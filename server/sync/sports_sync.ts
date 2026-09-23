import { Match, MatchEvent, FacebookPageConfig } from '../types.js';
import { db, getTodayDateString } from '../db/index.js';
import { cache } from '../cache/redis.js';
import { config } from '../config.js';
import { publisherQueue } from '../publisher/queue.js';
import { flashscoreClient } from '../scraper/flashscore_client.js';
import {
  formatGoalPost,
  formatYellowCardPost,
  formatRedCardPost,
  formatCornerPost,
  formatKickoffPost,
  formatHalfTimePost,
  formatFullTimePost,
  formatLiveRoundupPost,
  formatResultsRoundupPost,
  formatHalfTimeRoundupPost,
  isMatchAtHalfTime,
} from '../publisher/templates.js';

type BroadcastCallback = (type: string, payload: any) => void;

class SportsSyncEngine {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private previousMatches: Map<string, Match> = new Map();
  private broadcastFn: BroadcastCallback | null = null;
  private lastScrapeTime: string | null = null;
  private scrapeCount = 0;
  private lastError: string | null = null;
  private lastRoundupFingerprint = '';
  private lastActiveDay = '';

  setBroadcast(fn: BroadcastCallback): void {
    this.broadcastFn = fn;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[SyncEngine] Starting sports sync engine...');

    // Load initial matches from database / cache
    try {
      const cached = await cache.getLiveMatches();
      if (cached && cached.length > 0) {
        for (const m of cached) {
          this.previousMatches.set(m.id, m);
        }
      }
    } catch (e) {
      console.warn('[SyncEngine] Could not load initial cached matches:', e);
    }

    // Run first sync immediately (forced so it executes even if transitioning)
    await this.syncLiveMatches(true).catch(err => {
      console.warn('[SyncEngine] Initial sync error:', (err as Error)?.message || err);
    });

    // Schedule regular polling
    const intervalMs = Math.max(5000, config.scrapeIntervalSeconds * 1000);
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.timer = setInterval(() => {
      if (!this.isRunning) return;
      this.syncLiveMatches().catch(err => {
        console.warn('[SyncEngine] Polling error:', (err as Error)?.message || err);
      });
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    console.log('[SyncEngine] Stopped sports sync engine.');
  }

  /**
   * Syncs live matches from Scrapling / Flashscore engine
   */
  async syncLiveMatches(force = false): Promise<Match[]> {
    if (!this.isRunning && !force) {
      return Array.from(this.previousMatches.values());
    }
    try {
      const incomingMatches: Match[] = await flashscoreClient.getLiveMatches();
      this.lastScrapeTime = new Date().toISOString();
      this.scrapeCount++;
      this.lastError = null;

      // Day rollover check for automatic league selection reset
      const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', { timezone: 'UTC' } as any);
      const today = getTodayDateString(fbConfig.timezone || 'UTC');
      if (this.lastActiveDay && this.lastActiveDay !== today) {
        console.log(`[SyncEngine] Day rollover detected: ${this.lastActiveDay} -> ${today}. Auto-resetting daily league selection.`);
        const resetSelection = await db.getDailyLeagueSelection(fbConfig.timezone || 'UTC');
        if (this.broadcastFn) {
          this.broadcastFn('daily_leagues_updated', {
            date: resetSelection.date,
            selectedLeagueIds: resetSelection.selectedLeagueIds,
            reset: true,
            message: `A new day (${resetSelection.date}) has begun. League selection has been automatically reset.`
          });
        }
      }
      this.lastActiveDay = today;

      // Update cache
      await cache.setLiveMatches(incomingMatches, 30);

      // Diff against previous matches for real-time live events & Facebook publishing
      await this.processMatchDiffs(incomingMatches);

      // Broadcast live matches list to all connected clients (strictly filtered by today's selected leagues)
      if (this.broadcastFn) {
        const dailySelection = await db.getDailyLeagueSelection(fbConfig.timezone || 'UTC');
        const filteredMatches = dailySelection.selectedLeagueIds.length > 0
          ? incomingMatches.filter(m => m.league?.id && dailySelection.selectedLeagueIds.includes(m.league.id))
          : [];

        this.broadcastFn('live_matches_updated', {
          count: filteredMatches.length,
          totalUnfiltered: incomingMatches.length,
          timestamp: this.lastScrapeTime,
          matches: filteredMatches,
          dailySelectionDate: dailySelection.date,
          selectedLeagueCount: dailySelection.selectedLeagueIds.length,
        });
      }

      return incomingMatches;
    } catch (err: any) {
      this.lastError = err.message || 'Unknown scrape error';
      console.warn(`[SyncEngine] Live sync warning: ${this.lastError}`);
      throw err;
    }
  }

  /**
   * Compare previous match state to incoming match state to identify
   * Goals, Kickoffs, Half-Times, Red Cards, and Full-Times
   */
  private async processMatchDiffs(currentMatches: Match[]): Promise<void> {
    const fbConfig = await db.getSettings<FacebookPageConfig>('fbConfig', {
      pageId: config.fbPageId,
      isConnected: false,
      autoPublishEnabled: false,
      publishingMode: 'roundup',
      roundupIntervalMinutes: 15,
      minPostSpacingSeconds: 30,
      publishGoals: true,
      publishYellowCards: true,
      publishRedCards: true,
      publishCorners: true,
      publishKickoff: true,
      publishHalfTime: true,
      publishFullTime: true,
      includeStatsInFullTime: true,
      targetLeagueIds: [],
      postTemplateGoal: '',
      postTemplateYellowCard: '',
      postTemplateRedCard: '',
      postTemplateCorner: '',
      postTemplateKickoff: '',
      postTemplateHalfTime: '',
      postTemplateFullTime: '',
    });

    for (const match of currentMatches) {
      const prev = this.previousMatches.get(match.id);
      await db.saveMatch(match);

      if (prev) {
        // 1. Kickoff detection (SCHEDULED -> IN_PLAY)
        if (prev.status === 'SCHEDULED' && match.status === 'IN_PLAY') {
          await this.handleEvent({
            match,
            type: 'KICKOFF',
            teamSide: 'home',
            playerName: '',
            minute: 1,
            fbConfig,
          });
        }

        // 2. Goal detection (Score change)
        let eventMinute = match.minute || prev.minute;
        if (!eventMinute && match.startTime) {
          const elapsed = Math.floor((Date.now() - new Date(match.startTime).getTime()) / 60000);
          if (elapsed >= 1 && elapsed <= 130) eventMinute = elapsed;
        }
        if (!eventMinute && match.statusText) {
          const m = match.statusText.match(/(\d+)/);
          if (m) eventMinute = parseInt(m[1], 10);
        }
        const finalMinute = eventMinute || 1;

        if (match.homeScore > prev.homeScore) {
          const diff = match.homeScore - prev.homeScore;
          for (let i = 0; i < diff; i++) {
            await this.handleEvent({
              match,
              type: 'GOAL',
              teamSide: 'home',
              playerName: match.homeTeam.name,
              minute: finalMinute,
              homeScore: match.homeScore,
              awayScore: match.awayScore,
              fbConfig,
            });
          }
        }

        if (match.awayScore > prev.awayScore) {
          const diff = match.awayScore - prev.awayScore;
          for (let i = 0; i < diff; i++) {
            await this.handleEvent({
              match,
              type: 'GOAL',
              teamSide: 'away',
              playerName: match.awayTeam.name,
              minute: finalMinute,
              homeScore: match.homeScore,
              awayScore: match.awayScore,
              fbConfig,
            });
          }
        }

        // 3. Half-time detection
        if (prev.status === 'IN_PLAY' && match.status === 'PAUSED') {
          await this.handleEvent({
            match,
            type: 'HALF_TIME',
            teamSide: 'home',
            playerName: '',
            minute: 45,
            homeScore: match.homeScore,
            awayScore: match.awayScore,
            fbConfig,
          });
        }

        // 4. Full-time detection
        if ((prev.status === 'IN_PLAY' || prev.status === 'PAUSED') && match.status === 'FINISHED') {
          let stats = undefined;
          if (fbConfig.includeStatsInFullTime) {
            try {
              stats = await this.getMatchStatistics(match.id);
            } catch (e) {
              // Ignore stats fetch failure on finished
            }
          }

          await this.handleEvent({
            match,
            type: 'FULL_TIME',
            teamSide: 'home',
            playerName: '',
            minute: 90,
            homeScore: match.homeScore,
            awayScore: match.awayScore,
            fbConfig,
            stats,
          });
        }

        // 5. Cards & Corner events detection from stats diff
        if (match.stats && prev.stats) {
          // Yellow cards
          if ((match.stats.yellowCardsHome ?? 0) > (prev.stats.yellowCardsHome ?? 0)) {
            await this.handleEvent({
              match,
              type: 'YELLOW_CARD',
              teamSide: 'home',
              playerName: `${match.homeTeam.name} Player`,
              minute: finalMinute,
              fbConfig,
            });
          }
          if ((match.stats.yellowCardsAway ?? 0) > (prev.stats.yellowCardsAway ?? 0)) {
            await this.handleEvent({
              match,
              type: 'YELLOW_CARD',
              teamSide: 'away',
              playerName: `${match.awayTeam.name} Player`,
              minute: finalMinute,
              fbConfig,
            });
          }

          // Red cards
          if ((match.stats.redCardsHome ?? 0) > (prev.stats.redCardsHome ?? 0)) {
            await this.handleEvent({
              match,
              type: 'RED_CARD',
              teamSide: 'home',
              playerName: `${match.homeTeam.name} Player`,
              minute: finalMinute,
              fbConfig,
            });
          }
          if ((match.stats.redCardsAway ?? 0) > (prev.stats.redCardsAway ?? 0)) {
            await this.handleEvent({
              match,
              type: 'RED_CARD',
              teamSide: 'away',
              playerName: `${match.awayTeam.name} Player`,
              minute: finalMinute,
              fbConfig,
            });
          }

          // Corners
          if ((match.stats.cornersHome ?? 0) > (prev.stats.cornersHome ?? 0)) {
            await this.handleEvent({
              match,
              type: 'CORNER',
              teamSide: 'home',
              playerName: `${match.homeTeam.name}`,
              minute: finalMinute,
              fbConfig,
            });
          }
          if ((match.stats.cornersAway ?? 0) > (prev.stats.cornersAway ?? 0)) {
            await this.handleEvent({
              match,
              type: 'CORNER',
              teamSide: 'away',
              playerName: `${match.awayTeam.name}`,
              minute: finalMinute,
              fbConfig,
            });
          }
        }
      }

      // Update in memory map
      this.previousMatches.set(match.id, match);
    }

    // AUTOMATED POSTING TO FACEBOOK REMOVED:
    // To protect against Meta rate limits and anti-spam detection (Error 1390008),
    // background auto-publishing is completely disabled. All posts must be triggered
    // manually by the admin using the "Publish Now" buttons in the dashboard.
  }

  /**
   * Helper: Get the timestamp of the latest post published across all types (Live, HT, FT)
   */
  private getLastAnyPostTime(fbConfig: FacebookPageConfig): number {
    const times = [
      fbConfig.lastRoundupPublishedAt ? new Date(fbConfig.lastRoundupPublishedAt).getTime() : 0,
      fbConfig.lastHtRoundupPublishedAt ? new Date(fbConfig.lastHtRoundupPublishedAt).getTime() : 0,
      fbConfig.lastFtRoundupPublishedAt ? new Date(fbConfig.lastFtRoundupPublishedAt).getTime() : 0,
    ];
    const metrics = publisherQueue.getMetrics();
    if (metrics.lastPublishedAt) {
      times.push(new Date(metrics.lastPublishedAt).getTime());
    }
    return Math.max(...times, 0);
  }

  async enrichMatchesWithStats(matches: Match[]): Promise<Match[]> {
    if (!matches || matches.length === 0) return matches;
    await Promise.all(
      matches.map(async (m) => {
        try {
          if (!m.stats) {
            const stats = await this.getMatchStatistics(m.id);
            if (stats) m.stats = stats;
          }
          if (!m.events || m.events.length === 0) {
            const events = await this.getMatchEvents(m.id);
            if (events && events.length > 0) m.events = events;
          }
        } catch {
          // Ignore error on individual match
        }
      })
    );
    return matches;
  }

  /**
   * Periodic Live Scoreboard: strictly posts according to the user-selected minutes (roundupIntervalMinutes),
   * guaranteed not to conflict with Half-Time or Full-Time posts.
   */
  private async checkAndPublishRoundup(currentMatches: Match[], fbConfig: FacebookPageConfig): Promise<void> {
    if (!currentMatches || currentMatches.length === 0) return;

    // Filter to active in-play matches only (strictly in-play or intermission, not finished)
    let activeMatches = currentMatches.filter(m => m.status === 'IN_PLAY' || m.status === 'PAUSED');

    // Filter strictly by target leagues selected for today
    if (!fbConfig.targetLeagueIds || fbConfig.targetLeagueIds.length === 0) {
      return; // No leagues selected for today -> post nothing
    }
    activeMatches = activeMatches.filter(m => fbConfig.targetLeagueIds.includes(m.league?.id));

    if (activeMatches.length === 0) return;

    // Check if queue is currently under Facebook cooldown
    const queueStatus = publisherQueue.getMetrics();
    if (queueStatus.isCooldown) {
      return; // Defer roundup until Meta anti-spam cooldown expires
    }

    // 1. Conflict Prevention: ensure safe inter-post spacing since ANY recent post (HT, FT, or previous Live)
    const minSpacingMs = Math.max(20, Number(fbConfig.minPostSpacingSeconds) || 30) * 1000;
    const lastAnyPostTime = this.getLastAnyPostTime(fbConfig);
    if (lastAnyPostTime > 0 && (Date.now() - lastAnyPostTime) < minSpacingMs) {
      return; // Wait for safe inter-post spacing
    }

    // 2. Strict Interval: Post according to the user-selected minutes (roundupIntervalMinutes)
    const intervalMinutes = Math.max(3, Number(fbConfig.roundupIntervalMinutes) || 5);
    const intervalMs = intervalMinutes * 60 * 1000;
    const lastTime = fbConfig.lastRoundupPublishedAt ? new Date(fbConfig.lastRoundupPublishedAt).getTime() : 0;
    const elapsed = Date.now() - lastTime;

    if (elapsed >= intervalMs) {
      // Score fingerprint: Check if match scores or match statuses have actually changed
      const currentFingerprint = activeMatches
        .map(m => `${m.id}:${m.homeScore}-${m.awayScore}:${m.statusText}`)
        .sort()
        .join('|');

      // If scores haven't changed since last post and less than 15 minutes elapsed, skip duplicate post
      if (this.lastRoundupFingerprint === currentFingerprint && elapsed < 15 * 60 * 1000) {
        return;
      }

      console.log(`[SyncEngine] Generating scheduled live scoreboard roundup according to ${intervalMinutes}m setting for ${activeMatches.length} match(es)...`);
      await this.enrichMatchesWithStats(activeMatches);
      const message = formatLiveRoundupPost(activeMatches, fbConfig);

      await publisherQueue.enqueue({
        matchId: `roundup_${Date.now()}`,
        matchTitle: `Live Scoreboard Roundup (${activeMatches.length} Matches)`,
        leagueName: 'Multiple Leagues',
        eventType: 'STATUS_CHANGE',
        message,
      });

      this.lastRoundupFingerprint = currentFingerprint;
      fbConfig.lastRoundupPublishedAt = new Date().toISOString();
      await db.saveSettings('fbConfig', fbConfig);
    }
  }

  /**
   * Group active matches currently at Half-Time into a consolidated Half-Time post.
   * Strictly filters out matches that have already had their Half-Time score posted.
   * Returns true if a Half-Time post was enqueued.
   */
  private async checkAndPublishHalfTimeRoundup(currentMatches: Match[], fbConfig: FacebookPageConfig): Promise<boolean> {
    if (!fbConfig.autoPublishEnabled || !fbConfig.publishHalfTime) return false;

    // Check if queue is currently under Facebook cooldown
    const queueStatus = publisherQueue.getMetrics();
    if (queueStatus.isCooldown) return false;

    // Conflict Prevention: ensure safe inter-post spacing since ANY recent post
    const minSpacingMs = Math.max(20, Number(fbConfig.minPostSpacingSeconds) || 30) * 1000;
    const lastAnyPostTime = this.getLastAnyPostTime(fbConfig);
    if (lastAnyPostTime > 0 && (Date.now() - lastAnyPostTime) < minSpacingMs) {
      return false;
    }

    try {
      const htMatches = currentMatches.filter(m => isMatchAtHalfTime(m));
      if (htMatches.length === 0) return false;

      // Filter strictly by target leagues selected for today
      if (!fbConfig.targetLeagueIds || fbConfig.targetLeagueIds.length === 0) {
        return false;
      }
      const eligible = htMatches.filter(m => fbConfig.targetLeagueIds.includes(m.league?.id));

      // De-duplicate: filter out matches already published at HT
      const unpublished: Match[] = [];
      for (const m of eligible) {
        const isPublished = await db.isHtMatchPublished(m.id, m.homeTeam?.name, m.awayTeam?.name);
        if (!isPublished) {
          unpublished.push(m);
        }
      }

      if (unpublished.length === 0) return false;

      console.log(`[SyncEngine] Found ${unpublished.length} match(es) at Half-Time. Grouping into Half-Time Scores post...`);
      await this.enrichMatchesWithStats(unpublished.slice(0, 15));
      const message = formatHalfTimeRoundupPost(unpublished, fbConfig);

      await publisherQueue.enqueue({
        matchId: `ht_roundup_${Date.now()}`,
        matchTitle: `Half-Time Scores (${unpublished.length} Matches)`,
        leagueName: 'Multiple Leagues',
        eventType: 'STATUS_CHANGE',
        message,
      });

      await db.markHtMatchesPublished(unpublished);
      fbConfig.lastHtRoundupPublishedAt = new Date().toISOString();
      await db.saveSettings('fbConfig', fbConfig);
      console.log(`[SyncEngine] Successfully enqueued grouped HT post and marked ${unpublished.length} match(es) as published.`);
      return true;
    } catch (err) {
      console.warn('[SyncEngine] Error in checkAndPublishHalfTimeRoundup:', (err as Error)?.message || err);
      return false;
    }
  }

  /**
   * Group newly finished matches and publish a single Full-Time Results post.
   * Strictly filters out matches that have already been published so teams are never repeated.
   * Returns true if a Full-Time post was enqueued.
   */
  private async checkAndPublishFinishedRoundup(fbConfig: FacebookPageConfig): Promise<boolean> {
    // Only proceed if auto publish and Full-Time publishing are enabled
    if (!fbConfig.autoPublishEnabled || !fbConfig.publishFullTime) return false;

    // Check if queue is currently under Facebook cooldown
    const queueStatus = publisherQueue.getMetrics();
    if (queueStatus.isCooldown) return false;

    // Conflict Prevention: ensure safe inter-post spacing since ANY recent post
    const minSpacingMs = Math.max(20, Number(fbConfig.minPostSpacingSeconds) || 30) * 1000;
    const lastAnyPostTime = this.getLastAnyPostTime(fbConfig);
    if (lastAnyPostTime > 0 && (Date.now() - lastAnyPostTime) < minSpacingMs) {
      return false;
    }

    try {
      // 1. Get finished matches from results cache/feed
      const resultsToday = await this.getResults(0);
      // 2. Also check any finished matches in previousMatches map
      const finishedFromMap = Array.from(this.previousMatches.values()).filter(m => m.status === 'FINISHED');

      // Combine and de-duplicate by ID
      const allFinishedMap = new Map<string, Match>();
      for (const m of resultsToday) allFinishedMap.set(m.id, m);
      for (const m of finishedFromMap) allFinishedMap.set(m.id, m);
      const allFinished = Array.from(allFinishedMap.values());

      if (allFinished.length === 0) return false;

      // Filter strictly by target leagues selected for today
      if (!fbConfig.targetLeagueIds || fbConfig.targetLeagueIds.length === 0) {
        return false; // No leagues selected for today -> post nothing
      }
      const eligible = allFinished.filter(m => fbConfig.targetLeagueIds.includes(m.league?.id));

      // STRICT DE-DUPLICATION: Filter out any matches whose FT result was ALREADY published
      const unpublished: Match[] = [];
      for (const m of eligible) {
        const isPublished = await db.isFtMatchPublished(m.id, m.homeTeam?.name, m.awayTeam?.name);
        if (!isPublished) {
          unpublished.push(m);
        }
      }

      // DO NOT REPEAT POSTING: If there are NO new unpublished completed matches, do nothing!
      if (unpublished.length === 0) {
        return false;
      }

      console.log(`[SyncEngine] Found ${unpublished.length} newly finished match(es). Grouping into Full-Time Results post...`);

      // Optionally enrich with stats if enabled
      if (fbConfig.includeStatsInFullTime) {
        await this.enrichMatchesWithStats(unpublished.slice(0, 15));
      }

      const message = formatResultsRoundupPost(unpublished, fbConfig);

      await publisherQueue.enqueue({
        matchId: `results_roundup_${Date.now()}`,
        matchTitle: `Full-Time Results (${unpublished.length} Matches)`,
        leagueName: 'Multiple Leagues',
        eventType: 'FULL_TIME',
        message,
      });

      // Mark these matches and teams as published immediately so they are NEVER repeated!
      await db.markFtMatchesPublished(unpublished);

      fbConfig.lastFtRoundupPublishedAt = new Date().toISOString();
      await db.saveSettings('fbConfig', fbConfig);
      console.log(`[SyncEngine] Successfully enqueued grouped FT post and marked ${unpublished.length} match(es) as published.`);
      return true;
    } catch (err) {
      console.warn('[SyncEngine] Error in checkAndPublishFinishedRoundup:', (err as Error)?.message || err);
      return false;
    }
  }

  private async handleEvent(params: {
    match: Match;
    type: 'GOAL' | 'YELLOW_CARD' | 'RED_CARD' | 'CORNER' | 'KICKOFF' | 'HALF_TIME' | 'FULL_TIME';
    teamSide: 'home' | 'away';
    playerName: string;
    minute: number;
    homeScore?: number;
    awayScore?: number;
    fbConfig: FacebookPageConfig;
    stats?: any;
  }): Promise<void> {
    const { match, type, teamSide, playerName, minute, homeScore, awayScore, fbConfig, stats } = params;

    const eventRecord: MatchEvent = {
      id: `ev_${match.id}_${Date.now()}_${type}`,
      matchId: match.id,
      type: type === 'RED_CARD' ? 'RED_CARD' : type === 'YELLOW_CARD' ? 'YELLOW_CARD' : type === 'CORNER' ? 'CORNER' : type === 'GOAL' ? 'GOAL' : 'STATUS_CHANGE',
      minute,
      teamSide,
      playerName: playerName || (teamSide === 'home' ? match.homeTeam.name : match.awayTeam.name),
      homeScore: homeScore ?? match.homeScore,
      awayScore: awayScore ?? match.awayScore,
      createdAt: new Date().toISOString(),
    };

    // Save event
    await db.saveEvents([eventRecord]);

    // Broadcast event over WebSocket
    if (this.broadcastFn) {
      this.broadcastFn('match_event', {
        matchId: match.id,
        event: eventRecord,
        match,
      });
    }

    // AUTOMATED POSTING TO FACEBOOK REMOVED:
    // Background auto-publishing is permanently disabled to eliminate Meta spam detection.
    // The admin explicitly triggers posts via the "Publish Now" buttons in the dashboard.
    return;
  }

  async getLiveMatches(): Promise<Match[]> {
    try {
      const cached = await cache.getLiveMatches();
      if (cached && cached.length > 0) return cached;
    } catch {
      // ignore
    }
    if (this.previousMatches.size > 0) {
      return Array.from(this.previousMatches.values());
    }
    try {
      return await this.syncLiveMatches();
    } catch {
      return Array.from(this.previousMatches.values());
    }
  }

  async getTodayMatches(): Promise<Match[]> {
    const cached = await cache.get<Match[]>('matches:today');
    if (cached) return cached;

    try {
      const matches = await flashscoreClient.getTodayMatches();
      if (matches && matches.length > 0) {
        await cache.set('matches:today', matches, 60);
        return matches;
      }
    } catch (e) {
      console.warn('[SyncEngine] Error getting today matches:', e);
    }
    return [];
  }

  async getFixtures(offset = 1): Promise<Match[]> {
    const cacheKey = `matches:fixtures:${offset}`;
    const cached = await cache.get<Match[]>(cacheKey);
    if (cached) return cached;

    try {
      const matches = await flashscoreClient.getFixtures(offset);
      if (matches && matches.length > 0) {
        await cache.set(cacheKey, matches, 120);
        return matches;
      }
    } catch (e) {
      console.warn('[SyncEngine] Error getting fixtures:', e);
    }
    return [];
  }

  async getResults(offset = -1): Promise<Match[]> {
    const cacheKey = `matches:results:${offset}`;
    const cached = await cache.get<Match[]>(cacheKey);
    if (cached) return cached;

    try {
      const matches = await flashscoreClient.getResults(offset);
      if (matches && matches.length > 0) {
        await cache.set(cacheKey, matches, 120);
        return matches;
      }
    } catch (e) {
      console.warn('[SyncEngine] Error getting results:', e);
    }
    return [];
  }

  async getMatchEvents(matchId: string): Promise<MatchEvent[]> {
    const cacheKey = `match:${matchId}:events`;
    const cached = await cache.get<MatchEvent[]>(cacheKey);
    if (cached) return cached;

    try {
      const events = await flashscoreClient.getMatchEvents(matchId);
      if (events && events.length > 0) {
        await cache.set(cacheKey, events, 20);
        return events;
      }
    } catch (e) {
      console.warn('[SyncEngine] Error getting match events:', e);
    }
    return [];
  }

  async getMatchStatistics(matchId: string): Promise<any> {
    const cacheKey = `match:${matchId}:stats`;
    const cached = await cache.get<any>(cacheKey);
    if (cached) return cached;

    try {
      const stats = await flashscoreClient.getMatchStatistics(matchId);
      if (stats) {
        await cache.set(cacheKey, stats, 30);
        return stats;
      }
    } catch (e) {
      console.warn('[SyncEngine] Error getting match stats:', e);
    }
    return null;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      trackedLiveMatches: this.previousMatches.size,
      lastScrapeTime: this.lastScrapeTime,
      scrapeCount: this.scrapeCount,
      lastError: this.lastError,
      intervalSeconds: config.scrapeIntervalSeconds,
    };
  }
}

export const sportsSync = new SportsSyncEngine();
