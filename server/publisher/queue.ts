import { db } from '../db/index.js';
import { fbClient } from './facebook_client.js';
import { FacebookPostRecord, FacebookPageConfig } from '../types.js';
import { config } from '../config.js';

class FacebookPublisherQueue {
  private queue: FacebookPostRecord[] = [];
  private isProcessing = false;
  private timer: NodeJS.Timeout | null = null;
  private postTimes: number[] = []; // Timestamps for rate-limiting
  private maxPostsPerMinute = Math.min(config.fbRateLimitPerMinute || 10, 4); // Safe ceiling: max 4 posts/min
  private minPostSpacingMs = 25000; // Pacing: 25s minimum between posts to avoid velocity spam blocks
  private lastPublishedAt = 0;
  private cooldownUntil = 0;
  private cooldownReason = '';
  private consecutiveRateLimits = 0;

  async init(): Promise<void> {
    // Load any uncompleted posts from database
    try {
      const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', {
        pageId: config.fbPageId,
        publishingMode: 'roundup',
      } as any);

      const posts = await db.getFacebookPosts(100);
      const queued = posts.filter(p => p.status === 'QUEUED' || p.status === 'PUBLISHING');
      for (const p of queued) {
        const ageMs = Date.now() - new Date(p.createdAt).getTime();
        // Drop any posts older than 15 minutes! Live sports scores from 15+ minutes ago are obsolete and trigger spam filters
        if (ageMs > 15 * 60 * 1000) {
          p.status = 'FAILED';
          p.error = 'Expired: Created over 15 minutes ago. Purged to prevent stale scores and Meta velocity triggers.';
          await db.updateFacebookPost(p.id, { status: 'FAILED', error: p.error });
          continue;
        }

        // If system is configured in roundup mode, purge backlogged single-game posts to avoid Meta spam blocks
        if (
          fbConfig.publishingMode === 'roundup' &&
          p.matchId !== 'test' &&
          !p.matchId.startsWith('roundup_') &&
          !p.matchId.startsWith('results_roundup_')
        ) {
          p.status = 'SKIPPED';
          p.error = 'Suppressed single-game event post in favor of live scoreboard roundup';
          await db.updateFacebookPost(p.id, { status: 'SKIPPED', error: p.error });
          continue;
        }

        // Reset PUBLISHING to QUEUED on startup to recover safely
        p.status = 'QUEUED';
        this.queue.push(p);
      }
      console.log(`[FB Queue] Loaded ${this.queue.length} pending posts from persistence.`);
    } catch (e) {
      console.warn('[FB Queue] Error loading pending posts:', e);
    }

    // Start background processing loop
    this.startWorker();
  }

  startWorker(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.processQueue().catch(err => {
        console.warn('[FB Worker] Unexpected error in loop:', (err as Error)?.message || err);
      });
    }, 4000);
  }

  stopWorker(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  resetCooldown(): void {
    this.cooldownUntil = 0;
    this.cooldownReason = '';
    this.consecutiveRateLimits = 0;
    console.log('[FB Queue] Cooldown reset manually. Queue resumed.');
    if (!this.isProcessing) {
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * Enqueue a new post asynchronously with deduplication.
   * Scraper calls this and returns immediately.
   */
  async enqueue(postData: Omit<FacebookPostRecord, 'id' | 'status' | 'retryCount' | 'createdAt'>): Promise<string> {
    // 0. Safety Guard: Check if configured in roundup mode
    try {
      const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', {
        publishingMode: 'roundup',
      } as any);

      if (
        fbConfig.publishingMode === 'roundup' &&
        postData.matchId !== 'test' &&
        !postData.matchId.startsWith('roundup_') &&
        !postData.matchId.startsWith('results_roundup_')
      ) {
        console.log(`[FB Queue] Suppressed individual match event (${postData.eventType}) for "${postData.matchTitle}" because system is in Roundup mode.`);
        return 'suppressed_roundup_mode';
      }
    } catch {
      // Proceed if setting retrieval encounters issue
    }

    // 1. Check if identical post is already pending in the active queue
    const alreadyQueued = this.queue.find(
      p => p.matchId === postData.matchId && p.eventType === postData.eventType && p.message === postData.message
    );
    if (alreadyQueued) {
      console.log(`[FB Queue] Skipping duplicate post for match ${postData.matchId} (${postData.eventType}) - already queued as ${alreadyQueued.id}`);
      return alreadyQueued.id;
    }

    // 2. Check if identical post was published in the last 15 minutes
    try {
      const recentPosts = await db.getFacebookPosts(30);
      const recentPublished = recentPosts.find(
        p => p.status === 'PUBLISHED' &&
             p.matchId === postData.matchId &&
             p.eventType === postData.eventType &&
             p.message === postData.message &&
             p.publishedAt &&
             (Date.now() - new Date(p.publishedAt).getTime() < 15 * 60 * 1000)
      );
      if (recentPublished) {
        console.log(`[FB Queue] Skipping duplicate post - identical post was published ${recentPublished.publishedAt} (${recentPublished.id})`);
        return recentPublished.id;
      }
    } catch {
      // Ignore db error on duplicate check
    }

    // If enqueuing a new roundup, supersede any older pending roundups so only the freshest live scores are published
    if (postData.matchId.startsWith('roundup_')) {
      for (const existing of this.queue) {
        if (existing.matchId.startsWith('roundup_')) {
          existing.status = 'SKIPPED';
          existing.error = 'Superseded by fresher live scoreboard update.';
          await db.updateFacebookPost(existing.id, { status: 'SKIPPED', error: existing.error });
        }
      }
      this.queue = this.queue.filter(p => p.status !== 'SKIPPED');
    }

    if (postData.matchId.startsWith('results_roundup_')) {
      for (const existing of this.queue) {
        if (existing.matchId.startsWith('results_roundup_')) {
          existing.status = 'SKIPPED';
          existing.error = 'Superseded by fresher full-time results batch.';
          await db.updateFacebookPost(existing.id, { status: 'SKIPPED', error: existing.error });
        }
      }
      this.queue = this.queue.filter(p => p.status !== 'SKIPPED');
    }

    const id = `fb_post_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const record: FacebookPostRecord = {
      ...postData,
      id,
      status: 'QUEUED',
      retryCount: 0,
      createdAt: new Date().toISOString(),
    };

    await db.saveFacebookPost(record);
    this.queue.push(record);
    console.log(`[FB Queue] Enqueued post ${id} for match: "${record.matchTitle}" (${record.eventType})`);

    // Kick off worker if idle and not in cooldown
    if (!this.isProcessing && Date.now() >= this.cooldownUntil) {
      setImmediate(() => this.processQueue());
    }

    return id;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;

    // 1. Check if active cooldown is in progress
    if (Date.now() < this.cooldownUntil) {
      return;
    }

    // 2. Purge any stale posts from the queue before processing (older than 15 minutes)
    while (this.queue.length > 0) {
      const head = this.queue[0];
      const ageMs = Date.now() - new Date(head.createdAt).getTime();
      if (head.matchId !== 'test' && ageMs > 15 * 60 * 1000) {
        console.warn(`[FB Queue] Expiring stale post ${head.id} (age: ${Math.round(ageMs / 60000)}m) to prevent outdated scores`);
        head.status = 'FAILED';
        head.error = `Expired: Created ${Math.round(ageMs / 60000)}m ago. Live scores are outdated.`;
        await db.updateFacebookPost(head.id, { status: 'FAILED', error: head.error });
        this.queue.shift();
      } else {
        break;
      }
    }

    if (this.queue.length === 0) return;

    // 3. Pacing check: ensure minimum delay between consecutive posts to Facebook
    const elapsedSinceLast = Date.now() - this.lastPublishedAt;
    if (this.lastPublishedAt > 0 && elapsedSinceLast < this.minPostSpacingMs) {
      // Pacing interval not reached yet, wait for next timer tick
      return;
    }

    this.isProcessing = true;

    try {
      // Get page configuration
      const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', {
        pageId: config.fbPageId,
        isConnected: false,
        autoPublishEnabled: false,
        publishGoals: true,
        publishRedCards: true,
        publishKickoff: true,
        publishHalfTime: true,
        publishFullTime: true,
        includeStatsInFullTime: true,
        targetLeagueIds: [],
        postTemplateGoal: '',
        postTemplateRedCard: '',
        postTemplateKickoff: '',
        postTemplateHalfTime: '',
        postTemplateFullTime: '',
      });

      if (fbConfig.minPostSpacingSeconds && fbConfig.minPostSpacingSeconds >= 10) {
        this.minPostSpacingMs = fbConfig.minPostSpacingSeconds * 1000;
      }

      // Rate limit check: clean timestamps older than 60s
      const oneMinuteAgo = Date.now() - 60000;
      this.postTimes = this.postTimes.filter(t => t > oneMinuteAgo);

      if (this.postTimes.length >= this.maxPostsPerMinute) {
        console.warn(`[FB Queue] Rolling rate limit reached (${this.postTimes.length}/${this.maxPostsPerMinute} posts/min). Pacing next post.`);
        this.isProcessing = false;
        return;
      }

      const post = this.queue[0];
      if (!post) {
        this.isProcessing = false;
        return;
      }

      // Check if credentials exist
      const pageId = fbConfig.pageId || config.fbPageId;
      const accessToken = fbConfig.pageAccessToken || (fbConfig as any).accessToken || config.fbPageAccessToken;

      if (!pageId || !accessToken) {
        // Facebook is not configured yet - mark as SKIPPED so queue doesn't get blocked
        post.status = 'SKIPPED';
        post.error = 'Facebook Page ID or Access Token is not configured. Please connect page in Admin settings.';
        await db.updateFacebookPost(post.id, { status: 'SKIPPED', error: post.error });
        this.queue.shift();
        this.isProcessing = false;
        return;
      }

      // Mark as publishing
      post.status = 'PUBLISHING';
      await db.updateFacebookPost(post.id, { status: 'PUBLISHING' });

      // Call Meta Graph API
      const result = await fbClient.publishPost(pageId, accessToken, post.message);

      if (result.success && result.postId) {
        this.postTimes.push(Date.now());
        this.lastPublishedAt = Date.now();
        this.consecutiveRateLimits = 0;
        this.cooldownUntil = 0;
        this.cooldownReason = '';

        post.status = 'PUBLISHED';
        post.fbPostId = result.postId;
        post.publishedAt = new Date().toISOString();
        post.error = undefined;
        await db.updateFacebookPost(post.id, {
          status: 'PUBLISHED',
          fbPostId: result.postId,
          publishedAt: post.publishedAt,
          error: undefined,
        });
        console.log(`[FB Queue] Successfully published post ${post.id} to Facebook Page (FB ID: ${result.postId})`);
        this.queue.shift(); // Remove from queue
      } else {
        // Handle rate limits and spam velocity blocks with cooldown
        if (result.rateLimited || result.isSpamBlocked) {
          this.consecutiveRateLimits += 1;
          const baseCooldown = result.cooldownSeconds || (result.isSpamBlocked ? 300 : 60);
          const multiplier = Math.min(this.consecutiveRateLimits, 3);
          const cooldownSec = baseCooldown * multiplier;

          this.cooldownUntil = Date.now() + (cooldownSec * 1000);
          this.cooldownReason = result.isSpamBlocked
            ? `Facebook velocity anti-spam filter active (error 1390008). Pausing queue for ${cooldownSec}s to protect Page.`
            : `Facebook rate limit active. Pausing queue for ${cooldownSec}s.`;

          console.warn(`[FB Queue] ${this.cooldownReason}`);

          post.retryCount += 1;
          post.error = `${result.error} [Throttled: cooling down for ${cooldownSec}s, will retry automatically]`;

          if (result.isSpamBlocked) {
            // Anti-spam protection: NEVER retry when Meta flags spam velocity (1390008).
            // Retrying the same post content extends the penalty and triggers repeat OAuthExceptions.
            post.status = 'FAILED';
            post.error = `Cancelled after Meta anti-spam velocity warning (error 1390008) to protect Page. Cooldown active for ${cooldownSec}s: ${result.error}`;
            await db.updateFacebookPost(post.id, {
              status: 'FAILED',
              retryCount: post.retryCount,
              error: post.error,
            });
            console.warn(`[FB Queue] Dropped post ${post.id} immediately to protect Page from repeated 1390008 velocity strikes.`);
            this.queue.shift();
          } else if (post.retryCount >= 3) {
            post.status = 'FAILED';
            await db.updateFacebookPost(post.id, {
              status: 'FAILED',
              retryCount: post.retryCount,
              error: `Permanently failed after ${post.retryCount} throttled retries: ${result.error}`,
            });
            console.warn(`[FB Queue] Post ${post.id} failed after ${post.retryCount} retries: ${post.error}`);
            this.queue.shift();
          } else {
            // Standard rate limit (e.g. quota code 4/17): wait for cooldown
            post.status = 'QUEUED';
            await db.updateFacebookPost(post.id, {
              status: 'QUEUED',
              retryCount: post.retryCount,
              error: post.error,
            });
            console.warn(`[FB Queue] Post ${post.id} waiting for cooldown (attempt ${post.retryCount}/3).`);
          }
        } else {
          // Standard non-rate-limit error (e.g. invalid syntax, auth revoked)
          post.retryCount += 1;
          post.error = result.error || 'Unknown Facebook API error';

          if (post.retryCount >= config.fbPublishMaxRetries) {
            post.status = 'FAILED';
            await db.updateFacebookPost(post.id, {
              status: 'FAILED',
              retryCount: post.retryCount,
              error: post.error,
            });
            console.warn(`[FB Queue] Post ${post.id} failed after ${post.retryCount} retries: ${post.error}`);
            this.queue.shift(); // Remove from queue
          } else {
            post.status = 'QUEUED';
            await db.updateFacebookPost(post.id, {
              status: 'QUEUED',
              retryCount: post.retryCount,
              error: post.error,
            });
            console.warn(`[FB Queue] Post ${post.id} failed (attempt ${post.retryCount}): ${post.error}. Will retry.`);
            // Move to back of queue
            this.queue.shift();
            this.queue.push(post);
          }
        }
      }
    } catch (err) {
      console.warn('[FB Worker] Error in queue processor:', (err as Error)?.message || err);
    } finally {
      this.isProcessing = false;
    }
  }

  getMetrics(): {
    queueLength: number;
    isProcessing: boolean;
    recentPublishCount: number;
    maxPerMinute: number;
    isCooldown: boolean;
    cooldownSecondsRemaining: number;
    cooldownReason?: string;
    lastPublishedAt?: string;
    minPostSpacingSeconds: number;
  } {
    const oneMinuteAgo = Date.now() - 60000;
    const recent = this.postTimes.filter(t => t > oneMinuteAgo).length;
    const remainingSec = this.cooldownUntil > Date.now()
      ? Math.ceil((this.cooldownUntil - Date.now()) / 1000)
      : 0;

    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      recentPublishCount: recent,
      maxPerMinute: this.maxPostsPerMinute,
      isCooldown: remainingSec > 0,
      cooldownSecondsRemaining: remainingSec,
      cooldownReason: remainingSec > 0 ? this.cooldownReason : undefined,
      lastPublishedAt: this.lastPublishedAt > 0 ? new Date(this.lastPublishedAt).toISOString() : undefined,
      minPostSpacingSeconds: Math.round(this.minPostSpacingMs / 1000),
    };
  }

  async clearQueue(): Promise<number> {
    const count = this.queue.length;
    for (const post of this.queue) {
      post.status = 'FAILED';
      post.error = 'Manually cleared from queue to reset Meta velocity limits.';
      await db.updateFacebookPost(post.id, { status: 'FAILED', error: post.error });
    }
    this.queue = [];
    this.cooldownUntil = 0;
    this.cooldownReason = '';
    this.consecutiveRateLimits = 0;
    this.isProcessing = false;
    return count;
  }
}

export const publisherQueue = new FacebookPublisherQueue();
