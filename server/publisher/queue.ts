import { facebookPublisher, PublisherStatusOverview } from './facebook_publisher.js';
import { FacebookPostRecord, FacebookPageConfig } from '../types.js';
import { db } from '../db/index.js';

class FacebookPublisherQueue {
  private inMemoryMetrics: any = null;

  async init(): Promise<void> {
    // facebookPublisher handles loading persistent state and starting the loop
    await facebookPublisher.init();
    await this.refreshMetrics();
  }

  startWorker(): void {
    facebookPublisher.startWorker();
  }

  stopWorker(): void {
    facebookPublisher.stopWorker();
  }

  /**
   * Reset/Acknowledge action.
   * STRICT FIX: Clears administrative warnings without bypassing active Meta cooldown timers (error 1390008).
   */
  async resetCooldown(): Promise<void> {
    const res = await facebookPublisher.acknowledgeOrResume();
    console.log(`[FB Queue] Acknowledge result:`, res.message);
    await this.refreshMetrics();
  }

  applySafeMode(minSpacingSec = 90): void {
    console.log(`[FB Queue] Anti-Spam Safe Mode active: Minimum 15-minute pacing enforced persistently.`);
  }

  /**
   * Centralized Enqueue:
   * Translates incoming publication requests into the single authoritative FacebookPublisher service.
   */
  async enqueue(postData: Omit<FacebookPostRecord, 'id' | 'status' | 'retryCount' | 'createdAt'>): Promise<string> {
    // Safety Guard: Check if configured in roundup mode
    try {
      const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', {
        publishingMode: 'roundup',
      } as any);

      if (
        fbConfig.publishingMode === 'roundup' &&
        postData.matchId !== 'test' &&
        !postData.matchId.startsWith('roundup_') &&
        !postData.matchId.startsWith('results_roundup_') &&
        !postData.matchId.startsWith('ht_roundup_') &&
        !postData.matchId.startsWith('halftime_roundup_')
      ) {
        console.log(`[FB Queue] Suppressed individual match event (${postData.eventType}) for "${postData.matchTitle}" because system is in Roundup mode.`);
        return 'suppressed_roundup_mode';
      }
    } catch {
      // Proceed
    }

    let publicationType: 'LIVE' | 'HALF_TIME' | 'FULL_TIME' | 'MANUAL' | 'TEST' = 'MANUAL';
    if (postData.matchId === 'test') {
      publicationType = 'TEST';
    } else if (postData.matchId.startsWith('roundup_')) {
      publicationType = 'LIVE';
    } else if (postData.matchId.startsWith('ht_roundup_') || postData.matchId.startsWith('halftime_roundup_')) {
      publicationType = 'HALF_TIME';
    } else if (postData.matchId.startsWith('results_roundup_')) {
      publicationType = 'FULL_TIME';
    }

    const res = await facebookPublisher.requestPublication({
      publicationType,
      matchId: postData.matchId,
      matchTitle: postData.matchTitle,
      leagueName: postData.leagueName,
      eventType: postData.eventType,
      message: postData.message,
      headline: postData.headline,
      matchesCount: postData.matchesCount,
      matchesSummary: postData.matchesSummary,
      publishedBy: postData.publishedBy,
      isAiGenerated: postData.isAiGenerated,
    });

    await this.refreshMetrics();
    return res.postId || `fb_${Date.now()}`;
  }

  /**
   * Refreshes metrics cache from PostgreSQL
   */
  async refreshMetrics(): Promise<PublisherStatusOverview> {
    try {
      this.inMemoryMetrics = await facebookPublisher.getStatusOverview();
    } catch (e) {
      console.warn('[FB Queue] Error reading publisher status overview:', e);
    }
    return this.inMemoryMetrics;
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
    publishingStatus: 'ACTIVE' | 'PAUSED';
    consecutiveMetaBlocks: number;
    totalMetaBlocks: number;
    lockStatus: 'AVAILABLE' | 'LOCKED';
    hasPendingScoreboard: boolean;
    lastContentHash?: string;
    lastFacebookPostId?: string;
  } {
    const m: PublisherStatusOverview = this.inMemoryMetrics || {
      publishingStatus: 'ACTIVE',
      publishingEnabled: true,
      isCooldown: false,
      cooldownRemainingSeconds: 0,
      consecutiveMetaBlocks: 0,
      totalMetaBlocks: 0,
      lockStatus: 'AVAILABLE',
      hasPendingScoreboard: false,
      minPublishIntervalSeconds: 900,
      elapsedSinceLastPublishSeconds: 999999,
      queueLength: 0,
    };

    return {
      queueLength: m.queueLength,
      isProcessing: m.lockStatus === 'LOCKED',
      recentPublishCount: m.lastSuccessfulPublishAt ? 1 : 0,
      maxPerMinute: 1,
      isCooldown: m.isCooldown,
      cooldownSecondsRemaining: m.cooldownRemainingSeconds,
      cooldownReason: m.cooldownReason,
      lastPublishedAt: m.lastSuccessfulPublishAt,
      minPostSpacingSeconds: m.minPublishIntervalSeconds,
      publishingStatus: m.publishingStatus,
      consecutiveMetaBlocks: m.consecutiveMetaBlocks,
      totalMetaBlocks: m.totalMetaBlocks,
      lockStatus: m.lockStatus,
      hasPendingScoreboard: m.hasPendingScoreboard,
      lastContentHash: m.lastContentHash,
      lastFacebookPostId: m.lastFacebookPostId,
    };
  }

  /**
   * Clear pending queue without resetting the persistent Meta cooldown timer.
   */
  async clearQueue(): Promise<number> {
    const cleared = await facebookPublisher.clearPendingQueue();
    await this.refreshMetrics();
    return cleared;
  }
}

export const publisherQueue = new FacebookPublisherQueue();
