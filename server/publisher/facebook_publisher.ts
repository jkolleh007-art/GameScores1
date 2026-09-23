import { db } from '../db/index.js';
import { fbClient } from './facebook_client.js';
import {
  FacebookPostRecord,
  FacebookPageConfig,
  FacebookPublisherState,
  FacebookPendingPublication,
  MatchEventType,
  MatchSummaryItem,
} from '../types.js';
import { config } from '../config.js';
import { classifyFacebookError, computeContentHash } from './error_classifier.js';

export function extractHeadline(message: string): string {
  if (!message) return 'Live Match Update';
  const lines = message.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length > 0) {
    return lines[0];
  }
  return 'Live Match Update';
}

export interface PublicationRequestOptions {
  publicationType: 'LIVE' | 'HALF_TIME' | 'FULL_TIME' | 'MANUAL' | 'TEST';
  matchId: string;
  matchTitle: string;
  leagueName: string;
  eventType: MatchEventType;
  message: string;
  pageId?: string;
  accessToken?: string;
  isTest?: boolean;
  headline?: string;
  matchesCount?: number;
  matchesSummary?: MatchSummaryItem[];
  publishedBy?: string;
  isAiGenerated?: boolean;
}

export interface PublicationRequestResult {
  success: boolean;
  status: 'PUBLISHED' | 'QUEUED' | 'PENDING' | 'BLOCKED' | 'SKIPPED_DUPLICATE' | 'SKIPPED_INTERVAL';
  postId?: string;
  fbPostId?: string;
  message: string;
  blocked?: boolean;
  reason?: string;
  cooldownUntil?: string;
  retryAfterSeconds?: number;
}

export interface PublisherStatusOverview {
  publishingStatus: 'ACTIVE' | 'PAUSED';
  publishingEnabled: boolean;
  pauseReason?: string;
  isCooldown: boolean;
  cooldownRemainingSeconds: number;
  cooldownUntil?: string;
  cooldownReason?: string;
  lastSuccessfulPublishAt?: string;
  lastAttemptAt?: string;
  lastFacebookPostId?: string;
  lastContentHash?: string;
  pendingContentHash?: string;
  hasPendingScoreboard: boolean;
  pendingPublicationType?: string;
  pendingPublicationSummary?: string;
  consecutiveMetaBlocks: number;
  totalMetaBlocks: number;
  lockStatus: 'AVAILABLE' | 'LOCKED';
  lockOwner?: string;
  lastErrorCode?: number;
  lastErrorSubcode?: number;
  lastErrorMessage?: string;
  minPublishIntervalSeconds: number;
  elapsedSinceLastPublishSeconds: number;
  queueLength: number;
}

export class FacebookPublisher {
  private static instance: FacebookPublisher;
  private workerTimer: NodeJS.Timeout | null = null;
  private isWorkerLoopRunning = false;
  private workerId = `worker_${process.pid}_${Math.random().toString(36).substring(2, 7)}`;

  private constructor() {}

  public static getInstance(): FacebookPublisher {
    if (!FacebookPublisher.instance) {
      FacebookPublisher.instance = new FacebookPublisher();
    }
    return FacebookPublisher.instance;
  }

  /**
   * Initializes the centralized Facebook Publisher:
   * 1. Loads persistent state from PostgreSQL (cooldowns, consecutive blocks, content hash)
   * 2. Checks and cleans up any stale lock leases
   * 3. Starts background worker loop with pacing & lease management
   */
  async init(): Promise<void> {
    try {
      const state = await db.getFacebookPublisherState();
      console.log(`[FB Central] Loaded persistent state from DB:`, {
        publishingEnabled: state.publishingEnabled,
        publishingPaused: state.publishingPaused,
        cooldownUntil: state.cooldownUntil || 'NONE',
        consecutiveMetaBlocks: state.consecutiveMetaBlocks,
        lastSuccessfulPublishAt: state.lastSuccessfulPublishAt || 'NONE',
      });

      // Check if cooldown is active from previous run / crash
      if (state.cooldownUntil && new Date(state.cooldownUntil).getTime() > Date.now()) {
        const remainingSec = Math.ceil((new Date(state.cooldownUntil).getTime() - Date.now()) / 1000);
        console.warn(`[FB Central] RESTART SAFETY: Active Meta cooldown recovered (${remainingSec}s remaining until ${state.cooldownUntil}). Facebook publishing remains PAUSED.`);
      }

      // Recover expired lock if any
      const lockStatus = await db.getPublisherLockStatus();
      if (!lockStatus.locked) {
        console.log(`[FB Central] Publisher lock is available.`);
      } else {
        console.log(`[FB Central] Publisher lock currently held by ${lockStatus.owner} (${lockStatus.remainingMs}ms remaining).`);
      }

      // Recover any pending publications
      const pending = await db.getAllPendingPublications();
      console.log(`[FB Central] Loaded ${pending.length} pending publication(s) from database.`);

      this.startWorker();
    } catch (err) {
      console.error('[FB Central] Error initializing FacebookPublisher:', err);
    }
  }

  /**
   * Single entry point for all Facebook publication requests across the entire application.
   * SportsSyncEngine, manual publish, test publish, results roundup, and retries MUST call this.
   */
  async requestPublication(opts: PublicationRequestOptions): Promise<PublicationRequestResult> {
    console.log(`[FB Central] Publication requested: type=${opts.publicationType}, matchId=${opts.matchId}, title="${opts.matchTitle}"`);

    // 1. Reload persistent state directly from PostgreSQL
    const state = await db.getFacebookPublisherState();
    const now = Date.now();

    // 2. Safety Check: Global Facebook Publishing switch
    if (!state.publishingEnabled || !config.fbPublishEnabled) {
      console.warn(`[FB Central] Publication rejected: Facebook publishing is disabled in configuration.`);
      return {
        success: false,
        status: 'BLOCKED',
        blocked: true,
        message: 'Facebook publishing is disabled.',
        reason: 'Publishing disabled by administrator or configuration',
      };
    }

    // 3. Safety Check: Active Meta Cooldown (Error 1390008 or rate limit)
    const cooldownTime = state.cooldownUntil ? new Date(state.cooldownUntil).getTime() : 0;
    if (cooldownTime > now) {
      const remainingSec = Math.ceil((cooldownTime - now) / 1000);
      const reason = state.cooldownReason || `Facebook publishing is paused because Meta returned error ${state.lastErrorSubcode || 1390008}.`;
      console.warn(`[FB Central] Publication rejected: Active cooldown (${remainingSec}s remaining). Reason: ${reason}`);

      return {
        success: false,
        status: 'BLOCKED',
        blocked: true,
        reason,
        message: `Facebook publishing is temporarily paused to protect against spam velocity.`,
        cooldownUntil: state.cooldownUntil,
        retryAfterSeconds: remainingSec,
      };
    }

    // 4. Content normalization and deterministic SHA-256 hash calculation
    const contentHash = computeContentHash(opts.message);

    // 5. Duplicate Check against last successfully published content
    if (state.lastPublishedContentHash && state.lastPublishedContentHash === contentHash && opts.publicationType !== 'TEST') {
      console.log(`[FB Central] Duplicate scoreboard detected (hash=${contentHash.slice(0, 10)}...). Publication skipped.`);
      return {
        success: true,
        status: 'SKIPPED_DUPLICATE',
        message: 'Duplicate scoreboard detected. Publication skipped to protect Page from spam filters.',
      };
    }

    // 6. Test Publish Path: Execute synchronously under persistent safety checks without queue delay
    if (opts.isTest || opts.publicationType === 'TEST') {
      return await this.executeTestPublication(opts, contentHash);
    }

    // 7. Coalesced Pending Publication Management:
    // For live scoreboards, only maintain ONE pending live scoreboard in the database.
    // Score changes replace the pending scoreboard with the newest state.
    const pendingId = opts.publicationType === 'LIVE'
      ? 'pending_live_scoreboard'
      : opts.publicationType === 'HALF_TIME'
      ? 'pending_ht_scores'
      : opts.publicationType === 'FULL_TIME'
      ? 'pending_ft_results'
      : `pending_${opts.matchId}_${Date.now()}`;

    const resolvedHeadline = opts.headline || extractHeadline(opts.message);

    const pendingPub: FacebookPendingPublication = {
      id: pendingId,
      publicationType: opts.publicationType,
      matchId: opts.matchId,
      matchTitle: opts.matchTitle,
      leagueName: opts.leagueName,
      eventType: opts.eventType,
      content: opts.message,
      contentHash,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      attemptCount: 0,
      availableAt: new Date().toISOString(),
      headline: resolvedHeadline,
      matchesCount: opts.matchesCount,
      matchesSummary: opts.matchesSummary,
      publishedBy: opts.publishedBy || 'Admin',
      isAiGenerated: opts.isAiGenerated,
    };

    await db.savePendingPublication(pendingPub);

    // Update pending content hash in state
    state.pendingContentHash = contentHash;
    await db.saveFacebookPublisherState(state);

    console.log(`[FB Central] Pending publication updated (id=${pendingId}, type=${opts.publicationType}, hash=${contentHash.slice(0, 10)}...)`);

    // Also record in facebook_posts history table for transparency
    const historyRecord: FacebookPostRecord = {
      id: `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      matchId: opts.matchId,
      matchTitle: opts.matchTitle,
      leagueName: opts.leagueName,
      eventType: opts.eventType,
      message: opts.message,
      status: 'QUEUED',
      retryCount: 0,
      createdAt: new Date().toISOString(),
      headline: resolvedHeadline,
      postType: opts.publicationType,
      matchesCount: opts.matchesCount,
      matchesSummary: opts.matchesSummary,
      publishedBy: opts.publishedBy || 'Admin',
      isAiGenerated: opts.isAiGenerated,
    };
    await db.saveFacebookPost(historyRecord);

    // Trigger immediate loop processing tick
    setImmediate(() => this.processPendingQueue());

    return {
      success: true,
      status: 'PENDING',
      postId: historyRecord.id,
      message: 'Publication request saved to centralized pending queue. Will be published as soon as interval and rate limits permit.',
    };
  }

  /**
   * Safe synchronous execution of Test Publish.
   * Acquires lock, reloads state, rechecks cooldown, calls Facebook, and updates state.
   */
  private async executeTestPublication(opts: PublicationRequestOptions, contentHash: string): Promise<PublicationRequestResult> {
    console.log(`[FB Central] Executing protected test publication...`);
    const lockAcquired = await db.acquirePublisherLock(this.workerId, 20000);
    if (!lockAcquired) {
      console.warn(`[FB Central] Test publish rejected: Publisher lock is currently held by another worker.`);
      return {
        success: false,
        status: 'BLOCKED',
        blocked: true,
        message: 'Facebook publisher is currently busy publishing another post. Please try again in a few moments.',
      };
    }

    try {
      // Reload state after acquiring lock
      const state = await db.getFacebookPublisherState();
      const now = Date.now();
      if (state.cooldownUntil && new Date(state.cooldownUntil).getTime() > now) {
        const remainingSec = Math.ceil((new Date(state.cooldownUntil).getTime() - now) / 1000);
        return {
          success: false,
          status: 'BLOCKED',
          blocked: true,
          reason: state.cooldownReason || 'Facebook publishing is currently paused due to Meta anti-spam protection.',
          cooldownUntil: state.cooldownUntil,
          retryAfterSeconds: remainingSec,
          message: 'Test publish blocked: Meta anti-spam cooldown active.',
        };
      }

      // Check credentials
      const targetPageId = opts.pageId || config.fbPageId;
      const targetToken = opts.accessToken || config.fbPageAccessToken;
      if (!targetPageId || !targetToken) {
        return {
          success: false,
          status: 'BLOCKED',
          message: 'Missing Facebook Page ID or Access Token.',
        };
      }

      state.lastAttemptAt = new Date().toISOString();
      await db.saveFacebookPublisherState(state);

      console.log(`[FB Central] Dispatching test post to Meta Graph API...`);
      const result = await fbClient.publishPost(targetPageId, targetToken, opts.message);

      if (result.success && result.postId) {
        state.lastSuccessfulPublishAt = new Date().toISOString();
        state.lastPublishAt = state.lastSuccessfulPublishAt;
        state.lastFacebookPostId = result.postId;
        state.lastPublishedContentHash = contentHash;
        state.consecutiveMetaBlocks = 0; // Reset consecutive block count on success
        state.publishingPaused = false;
        state.pauseReason = undefined;
        state.cooldownUntil = undefined;
        state.cooldownReason = undefined;
        await db.saveFacebookPublisherState(state);

        const testHeadline = opts.headline || extractHeadline(opts.message);

        await db.saveFacebookPost({
          id: `test_${Date.now()}`,
          matchId: 'test',
          matchTitle: 'Meta Connection Test',
          leagueName: 'Live Sports App',
          eventType: 'STATUS_CHANGE',
          message: opts.message,
          status: 'PUBLISHED',
          fbPostId: result.postId,
          retryCount: 0,
          createdAt: new Date().toISOString(),
          publishedAt: new Date().toISOString(),
          headline: testHeadline,
          postType: 'TEST',
          matchesCount: 0,
          publishedBy: opts.publishedBy || 'Admin',
        });

        console.log(`[FB Central] Test publication successful (fbPostId=${result.postId})`);
        return {
          success: true,
          status: 'PUBLISHED',
          fbPostId: result.postId,
          message: 'Test post successfully published to your Facebook Page!',
        };
      } else {
        // Classify error and apply persistent cooldown
        const classified = classifyFacebookError(result);
        await this.handlePublishError(classified, state, result);

        await db.saveFacebookPost({
          id: `test_${Date.now()}`,
          matchId: 'test',
          matchTitle: 'Meta Connection Test',
          leagueName: 'Live Sports App',
          eventType: 'STATUS_CHANGE',
          message: opts.message,
          status: 'FAILED',
          error: result.error,
          retryCount: 0,
          createdAt: new Date().toISOString(),
        });

        return {
          success: false,
          status: 'BLOCKED',
          blocked: classified.isSpamVelocityBlock,
          reason: classified.message,
          cooldownUntil: state.cooldownUntil,
          retryAfterSeconds: classified.recommendedCooldownSeconds,
          message: result.error || 'Meta Graph API returned an error.',
        };
      }
    } finally {
      await db.releasePublisherLock(this.workerId);
    }
  }

  /**
   * Main background worker loop. Runs every 5 seconds.
   * Implements strict check order:
   * 1. Acquire Lock with expiring lease
   * 2. Reload State from PostgreSQL
   * 3. Check Cooldown
   * 4. Check Minimum Interval (900s / 15 min hard limit)
   * 5. Check Content Hash (De-duplication)
   * 6. Publish via fbClient
   * 7. Save persistent result & reset backoff on success
   * 8. Release Lock
   */
  async processPendingQueue(): Promise<void> {
    if (this.isWorkerLoopRunning) return;
    this.isWorkerLoopRunning = true;

    try {
      // 1. Fetch highest-priority pending publication from PostgreSQL
      const pendingPub = await db.getPendingPublication();
      if (!pendingPub) {
        return; // Nothing pending
      }

      // 2. Acquire Distributed PostgreSQL Lock (30-second lease)
      const lockAcquired = await db.acquirePublisherLock(this.workerId, 30000);
      if (!lockAcquired) {
        // Lock currently held by another worker or instance; skip this tick safely
        return;
      }

      try {
        console.log(`[FB Central] Publisher lock acquired by ${this.workerId}. Inspecting pending publication:`, {
          id: pendingPub.id,
          type: pendingPub.publicationType,
          title: pendingPub.matchTitle,
        });

        // 3. Reload persistent publisher state from PostgreSQL
        const state = await db.getFacebookPublisherState();
        const now = Date.now();

        // 4. Check Cooldown
        if (state.cooldownUntil && new Date(state.cooldownUntil).getTime() > now) {
          const remainingSec = Math.ceil((new Date(state.cooldownUntil).getTime() - now) / 1000);
          console.log(`[FB Central] Publication skipped - cooldown active (${remainingSec}s remaining). Reason: ${state.cooldownReason}`);
          return;
        }

        // 5. Load Facebook Page Config to access user-selected pacing & interval settings
        const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', {
          pageId: config.fbPageId,
          pageAccessToken: config.fbPageAccessToken,
          autoPublishEnabled: false,
          minPostSpacingSeconds: 30,
          roundupIntervalMinutes: 5,
        } as any);

        // 6. Check Minimum Safe Spacing between consecutive posts (no collisions between Live, HT, FT)
        const minSpacingSeconds = Math.max(20, Number(fbConfig.minPostSpacingSeconds) || 30);
        const minSpacingMs = minSpacingSeconds * 1000;
        const lastPublishMs = state.lastSuccessfulPublishAt ? new Date(state.lastSuccessfulPublishAt).getTime() : 0;
        const elapsedMs = now - lastPublishMs;

        if (lastPublishMs > 0 && elapsedMs < minSpacingMs) {
          const waitSec = Math.ceil((minSpacingMs - elapsedMs) / 1000);
          // Safe inter-post delay active. Keep item pending in DB; do not publish yet.
          return;
        }

        // 7. For LIVE scoreboards: strictly respect the user's selected minutes (roundupIntervalMinutes)
        if (pendingPub.publicationType === 'LIVE') {
          const intervalMinutes = Math.max(3, Number(fbConfig.roundupIntervalMinutes) || 5);
          const intervalMs = intervalMinutes * 60 * 1000;
          const lastRoundupMs = fbConfig.lastRoundupPublishedAt ? new Date(fbConfig.lastRoundupPublishedAt).getTime() : 0;
          if (lastRoundupMs > 0 && (now - lastRoundupMs) < intervalMs) {
            // Selected minutes interval not yet reached for Live Scoreboard
            return;
          }
        }

        // 8. Check Content Hash against last published content
        if (state.lastPublishedContentHash && state.lastPublishedContentHash === pendingPub.contentHash) {
          console.log(`[FB Central] Publication skipped - duplicate content detected (hash=${pendingPub.contentHash.slice(0, 10)}...).`);
          await db.deletePendingPublication(pendingPub.id);
          state.pendingContentHash = undefined;
          await db.saveFacebookPublisherState(state);
          return;
        }

        // 9. Verify credentials
        const pageId = fbConfig.pageId || config.fbPageId;
        const accessToken = fbConfig.pageAccessToken || config.fbPageAccessToken;

        if (!pageId || !accessToken) {
          console.warn(`[FB Central] Missing Page ID or Access Token. Deferring publication.`);
          return;
        }

        // 10. Publish to Facebook Graph API
        console.log(`[FB Central] Publishing to Facebook: type=${pendingPub.publicationType}, title="${pendingPub.matchTitle}"...`);
        state.lastAttemptAt = new Date().toISOString();
        await db.saveFacebookPublisherState(state);

        const result = await fbClient.publishPost(pageId, accessToken, pendingPub.content);

        if (result.success && result.postId) {
          console.log(`[FB Central] Publication successful! Facebook Post ID: ${result.postId}`);
          state.lastSuccessfulPublishAt = new Date().toISOString();
          state.lastPublishAt = state.lastSuccessfulPublishAt;
          state.lastFacebookPostId = result.postId;
          state.lastPublishedContentHash = pendingPub.contentHash;
          state.pendingContentHash = undefined;
          state.consecutiveMetaBlocks = 0; // Success resets backoff
          state.publishingPaused = false;
          state.pauseReason = undefined;
          state.cooldownUntil = undefined;
          state.cooldownReason = undefined;
          state.lastErrorCode = undefined;
          state.lastErrorSubcode = undefined;
          state.lastErrorMessage = undefined;
          await db.saveFacebookPublisherState(state);

          // Remove pending item from database
          await db.deletePendingPublication(pendingPub.id);

          // Update matching queued post records
          const posts = await db.getFacebookPosts(20);
          const matching = posts.find(p => p.status === 'QUEUED' && p.matchId === pendingPub.matchId);
          if (matching) {
            await db.updateFacebookPost(matching.id, {
              status: 'PUBLISHED',
              fbPostId: result.postId,
              publishedAt: state.lastSuccessfulPublishAt,
              error: undefined,
              headline: pendingPub.headline || matching.headline || extractHeadline(matching.message),
              postType: pendingPub.publicationType || matching.postType,
              matchesCount: pendingPub.matchesCount ?? matching.matchesCount,
              matchesSummary: pendingPub.matchesSummary || matching.matchesSummary,
              publishedBy: pendingPub.publishedBy || matching.publishedBy,
              isAiGenerated: pendingPub.isAiGenerated ?? matching.isAiGenerated,
            });
          }
        } else {
          // Classify and handle error
          const classified = classifyFacebookError(result);
          await this.handlePublishError(classified, state, result);

          pendingPub.attemptCount += 1;
          pendingPub.lastError = result.error;
          await db.savePendingPublication(pendingPub);

          const posts = await db.getFacebookPosts(20);
          const matching = posts.find(p => p.status === 'QUEUED' && p.matchId === pendingPub.matchId);
          if (matching) {
            await db.updateFacebookPost(matching.id, {
              status: 'FAILED',
              error: result.error,
              retryCount: (matching.retryCount || 0) + 1,
            });
          }
        }
      } finally {
        await db.releasePublisherLock(this.workerId);
        console.log(`[FB Central] Publisher lock released by ${this.workerId}`);
      }
    } catch (err) {
      console.warn('[FB Central] Unexpected error in worker loop:', (err as Error)?.message || err);
    } finally {
      this.isWorkerLoopRunning = false;
    }
  }

  /**
   * Centralized Error Handler & Persistent Exponential Backoff:
   * Handles 1390008, standard rate limits, and auth errors.
   * Multiplier schedule for consecutive 1390008 blocks:
   * 1st block: 10 minutes (600s)
   * 2nd block: 20 minutes (1200s)
   * 3rd block: 40 minutes (2400s)
   * 4th+ block: 60 minutes (3600s max)
   */
  async handlePublishError(
    classified: ReturnType<typeof classifyFacebookError>,
    state: FacebookPublisherState,
    rawResult: any
  ): Promise<void> {
    const now = Date.now();
    state.lastErrorCode = classified.code;
    state.lastErrorSubcode = classified.subcode;
    state.lastErrorMessage = rawResult.error || classified.message;

    if (classified.isSpamVelocityBlock) {
      state.consecutiveMetaBlocks += 1;
      state.totalMetaBlocks += 1;

      // Exponential backoff schedule: 10m, 20m, 40m, 60m max
      let cooldownSeconds = 600; // 10 min base
      if (state.consecutiveMetaBlocks === 2) {
        cooldownSeconds = 1200; // 20 min
      } else if (state.consecutiveMetaBlocks === 3) {
        cooldownSeconds = 2400; // 40 min
      } else if (state.consecutiveMetaBlocks >= 4) {
        cooldownSeconds = Math.min(3600, config.fbMaxCooldownSeconds); // 60 min max
      }

      const cooldownUntilDate = new Date(now + cooldownSeconds * 1000);
      state.cooldownUntil = cooldownUntilDate.toISOString();
      state.cooldownReason = `Meta Anti-Spam Velocity Block (Error 1390008). Strike #${state.consecutiveMetaBlocks}. Publishing paused for ${Math.round(cooldownSeconds / 60)} minutes.`;
      state.publishingPaused = true;
      state.pauseReason = state.cooldownReason;

      console.warn(`[FB Central] Meta 1390008 detected! Persistent cooldown created for ${cooldownSeconds}s (expires at ${state.cooldownUntil}). Consecutive blocks: ${state.consecutiveMetaBlocks}`);
    } else if (classified.isRateLimit) {
      const cooldownSeconds = 300; // 5 min
      state.cooldownUntil = new Date(now + cooldownSeconds * 1000).toISOString();
      state.cooldownReason = `Meta rate limit (code ${classified.code || 'quota'}). Cooldown active for 5 minutes.`;
      state.publishingPaused = true;
      state.pauseReason = state.cooldownReason;
      console.warn(`[FB Central] Meta rate limit detected. Cooldown created for 5 minutes.`);
    } else if (classified.isAuthOrPermissionError) {
      state.publishingPaused = true;
      state.pauseReason = `Facebook Authentication Error: ${rawResult.error || 'Access token or permissions invalid.'}`;
      console.warn(`[FB Central] Facebook auth/permission error detected. Publishing paused until credentials updated.`);
    }

    await db.saveFacebookPublisherState(state);
  }

  /**
   * Administrative Acknowledge / Reset Action.
   * Note: As mandated, this does NOT blindly bypass or delete an active Meta block cooldown.
   * It resets administrative flags while respecting authoritative Meta cooldown timers.
   */
  async acknowledgeOrResume(): Promise<{ success: boolean; message: string; cooldownStillActive: boolean; cooldownRemainingSeconds: number }> {
    const state = await db.getFacebookPublisherState();
    const now = Date.now();
    const cooldownMs = state.cooldownUntil ? new Date(state.cooldownUntil).getTime() : 0;

    if (cooldownMs > now) {
      const remainingSec = Math.ceil((cooldownMs - now) / 1000);
      console.log(`[FB Central] Admin acknowledged warning, but Meta cooldown remains authoritative (${remainingSec}s remaining).`);
      return {
        success: false,
        cooldownStillActive: true,
        cooldownRemainingSeconds: remainingSec,
        message: `Acknowledged, but Meta cooldown remains active for ${remainingSec}s to prevent Page suspension.`,
      };
    }

    state.publishingPaused = false;
    state.pauseReason = undefined;
    state.cooldownUntil = undefined;
    state.cooldownReason = undefined;
    await db.saveFacebookPublisherState(state);

    console.log(`[FB Central] Publisher resumed by administrator.`);
    return {
      success: true,
      cooldownStillActive: false,
      cooldownRemainingSeconds: 0,
      message: 'Facebook publisher resumed successfully.',
    };
  }

  /**
   * Clear pending queue without deleting or resetting Meta cooldown state.
   */
  async clearPendingQueue(): Promise<number> {
    const cleared = await db.clearPendingPublications();
    console.log(`[FB Central] Cleared ${cleared} pending publication(s) from database. Meta cooldown status preserved.`);
    return cleared;
  }

  /**
   * Returns complete real-time status overview reading strictly from persistent PostgreSQL state.
   */
  async getStatusOverview(): Promise<PublisherStatusOverview> {
    const state = await db.getFacebookPublisherState();
    const pending = await db.getAllPendingPublications();
    const lock = await db.getPublisherLockStatus();
    const now = Date.now();

    const cooldownMs = state.cooldownUntil ? new Date(state.cooldownUntil).getTime() : 0;
    const isCooldown = cooldownMs > now;
    const cooldownRemaining = isCooldown ? Math.ceil((cooldownMs - now) / 1000) : 0;

    const lastPublishMs = state.lastSuccessfulPublishAt ? new Date(state.lastSuccessfulPublishAt).getTime() : 0;
    const elapsedSinceLast = lastPublishMs > 0 ? Math.round((now - lastPublishMs) / 1000) : 999999;

    const topPending = pending[0];

    return {
      publishingStatus: isCooldown || state.publishingPaused || !state.publishingEnabled ? 'PAUSED' : 'ACTIVE',
      publishingEnabled: state.publishingEnabled && config.fbPublishEnabled,
      pauseReason: state.pauseReason || state.cooldownReason,
      isCooldown,
      cooldownRemainingSeconds: cooldownRemaining,
      cooldownUntil: state.cooldownUntil,
      cooldownReason: state.cooldownReason,
      lastSuccessfulPublishAt: state.lastSuccessfulPublishAt,
      lastAttemptAt: state.lastAttemptAt,
      lastFacebookPostId: state.lastFacebookPostId,
      lastContentHash: state.lastPublishedContentHash,
      pendingContentHash: state.pendingContentHash,
      hasPendingScoreboard: pending.length > 0,
      pendingPublicationType: topPending?.publicationType,
      pendingPublicationSummary: topPending ? `[${topPending.publicationType}] ${topPending.matchTitle}` : undefined,
      consecutiveMetaBlocks: state.consecutiveMetaBlocks,
      totalMetaBlocks: state.totalMetaBlocks,
      lockStatus: lock.locked ? 'LOCKED' : 'AVAILABLE',
      lockOwner: lock.owner,
      lastErrorCode: state.lastErrorCode,
      lastErrorSubcode: state.lastErrorSubcode,
      lastErrorMessage: state.lastErrorMessage,
      minPublishIntervalSeconds: Math.max(900, config.fbMinPublishIntervalSeconds),
      elapsedSinceLastPublishSeconds: elapsedSinceLast,
      queueLength: pending.length,
    };
  }

  startWorker(): void {
    if (this.workerTimer) clearInterval(this.workerTimer);
    this.workerTimer = setInterval(() => {
      this.processPendingQueue().catch(err => {
        console.warn('[FB Central] Worker error:', err?.message || err);
      });
    }, 5000);
  }

  stopWorker(): void {
    if (this.workerTimer) {
      clearInterval(this.workerTimer);
      this.workerTimer = null;
    }
  }
}

export const facebookPublisher = FacebookPublisher.getInstance();
