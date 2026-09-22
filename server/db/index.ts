import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import { config } from '../config.js';
import {
  Match,
  MatchEvent,
  FacebookPostRecord,
  FacebookPublisherState,
  FacebookPendingPublication,
  FacebookPublisherLock,
  ApiKeyRecord,
  DailyLeagueSelection,
  FacebookPageConfig,
  AdminUser,
  AdminSession,
} from '../types.js';

const { Pool } = pg;

export function getTodayDateString(timeZone = 'UTC'): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

export interface PublishedFtRecord {
  matchId: string;
  teamKey: string;
  homeTeam: string;
  awayTeam: string;
  leagueName: string;
  score: string;
  publishedAt: string;
}

interface StoredAdminUser {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  role: 'superadmin' | 'admin' | 'moderator';
  createdAt: string;
  lastLogin?: string;
}

interface LocalDbSchema {
  matches: Record<string, Match>;
  events: Record<string, MatchEvent[]>;
  facebookPosts: FacebookPostRecord[];
  facebookPublisherState?: FacebookPublisherState;
  facebookPendingPublications: FacebookPendingPublication[];
  facebookPublisherLocks: Record<string, FacebookPublisherLock>;
  settings: Record<string, any>;
  apiKeys: ApiKeyRecord[];
  adminUsers: StoredAdminUser[];
  adminSessions: AdminSession[];
}

class DatabaseManager {
  private pgPool: pg.Pool | null = null;
  private isPostgres = false;
  private localDataPath = path.join(process.cwd(), 'data', 'sports_db.json');
  private localData: LocalDbSchema = {
    matches: {},
    events: {},
    facebookPosts: [],
    facebookPublisherState: undefined,
    facebookPendingPublications: [],
    facebookPublisherLocks: {},
    settings: {
      fbConfig: {
        pageId: config.fbPageId,
        pageName: '',
        category: 'Sports Team / Media',
        link: '',
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
        postTemplateGoal: "⚽ GOAL! {home_team} {home_score} - {away_score} {away_team}!\n{player} ({minute}')\n#{league_tag} #LiveScores",
        postTemplateYellowCard: "🟨 YELLOW CARD! {player} ({team}) booked in the {minute}' min!\n⏱️ Match Time: {minute}'\n{home_team} {home_score} - {away_score} {away_team}\n🏆 {league_name}\n\n#{league_tag} #GameScores #YellowCard",
        postTemplateRedCard: "🟥 RED CARD! {player} ({team}) sent off in the {minute}' min!\n⏱️ Match Time: {minute}'\n{home_team} {home_score} - {away_score} {away_team}\n🏆 {league_name}\n\n#{league_tag} #GameScores #RedCard",
        postTemplateCorner: "🚩 CORNER KICK! Corner awarded to {team} in the {minute}' min!\n⏱️ Match Time: {minute}'\n{home_team} {home_score} - {away_score} {away_team}\n🏆 {league_name}\n\n#{league_tag} #GameScores #CornerKick",
        postTemplateKickoff: "⚡ MATCH KICK-OFF!\n{home_team} vs {away_team}\n🏆 {league_name}\nStay tuned for live score updates!",
        postTemplateHalfTime: "⏸️ HALF-TIME: {home_team} {home_score} - {away_score} {away_team}\n🏆 {league_name}",
        postTemplateFullTime: "🏁 FULL-TIME: {home_team} {home_score} - {away_score} {away_team}\n🏆 {league_name}\n{stats_summary}\nThanks for following!",
        postTemplateRoundup: "⚽ LIVE MATCHES SCOREBOARD ⏱️\n📊 {count} Active Match(es) in Progress ({time})\n\n{matches_list}\n\n⚡ Follow for live scores and breaking goal updates!\n{hashtags} #LiveScores #GameScores",
      },
      scraperSettings: {
        activeProviderId: 'flashscore',
        pollingIntervalSeconds: 15,
        targetLeagues: ['Premier League', 'LaLiga', 'Champions League', 'Serie A', 'Bundesliga', 'Ligue 1'],
        maxConcurrentScrapes: 4,
      }
    },
    apiKeys: config.apiAdminKey
      ? [
          {
            id: 'key_admin_env',
            key: config.apiAdminKey,
            name: 'Environment Admin Key',
            role: 'admin',
            createdAt: new Date().toISOString(),
          },
        ]
      : [],
    adminUsers: [],
    adminSessions: [],
  };

  async init(): Promise<void> {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (config.databaseUrl) {
      try {
        this.pgPool = new Pool({
          connectionString: config.databaseUrl,
          ssl: config.databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
          connectionTimeoutMillis: 4000,
        });
        await this.pgPool.query('SELECT NOW()');
        this.isPostgres = true;
        console.log('[DB] Connected to PostgreSQL successfully.');
        await this.initPostgresSchema();
        await this.initAdminUserIfNone();
        return;
      } catch (err) {
        console.warn('[DB] Could not connect to PostgreSQL, falling back to local persistent store:', (err as Error).message);
        this.pgPool = null;
        this.isPostgres = false;
      }
    }

    // Initialize local JSON store
    if (fs.existsSync(this.localDataPath)) {
      try {
        const raw = fs.readFileSync(this.localDataPath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.localData = {
          ...this.localData,
          ...parsed,
          adminUsers: parsed.adminUsers || [],
          adminSessions: parsed.adminSessions || [],
        };
        console.log('[DB] Loaded persistent local store from disk.');
      } catch (e) {
        console.error('[DB] Error loading local store, initializing fresh:', e);
        this.saveLocalData();
      }
    } else {
      this.saveLocalData();
    }

    await this.initAdminUserIfNone();
  }

  private saveLocalData(): void {
    try {
      fs.writeFileSync(this.localDataPath, JSON.stringify(this.localData, null, 2), 'utf-8');
    } catch (e) {
      console.error('[DB] Error saving local store:', e);
    }
  }

  private async initPostgresSchema(): Promise<void> {
    if (!this.pgPool) return;
    const schemaSql = `
      CREATE TABLE IF NOT EXISTS matches (
        id VARCHAR(64) PRIMARY KEY,
        provider VARCHAR(32) NOT NULL DEFAULT 'flashscore',
        league_id VARCHAR(64) NOT NULL,
        league_name VARCHAR(128) NOT NULL,
        league_country VARCHAR(64) NOT NULL,
        home_team_id VARCHAR(64) NOT NULL,
        home_team_name VARCHAR(128) NOT NULL,
        away_team_id VARCHAR(64) NOT NULL,
        away_team_name VARCHAR(128) NOT NULL,
        home_score INT NOT NULL DEFAULT 0,
        away_score INT NOT NULL DEFAULT 0,
        status VARCHAR(32) NOT NULL DEFAULT 'SCHEDULED',
        status_text VARCHAR(64) NOT NULL DEFAULT '',
        minute INT,
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        raw_payload JSONB,
        stats JSONB,
        last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS match_events (
        id VARCHAR(128) PRIMARY KEY,
        match_id VARCHAR(64) NOT NULL,
        event_type VARCHAR(32) NOT NULL,
        minute INT NOT NULL,
        extra_minute INT,
        team_side VARCHAR(8) NOT NULL,
        player_name VARCHAR(128) NOT NULL,
        secondary_player_name VARCHAR(128),
        detail VARCHAR(256),
        home_score INT,
        away_score INT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS facebook_posts (
        id VARCHAR(64) PRIMARY KEY,
        match_id VARCHAR(64) NOT NULL,
        match_title VARCHAR(256) NOT NULL,
        league_name VARCHAR(128) NOT NULL,
        event_type VARCHAR(32) NOT NULL,
        message TEXT NOT NULL,
        fb_post_id VARCHAR(128),
        status VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
        error TEXT,
        retry_count INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        published_at TIMESTAMP WITH TIME ZONE
      );

      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(128) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id VARCHAR(64) PRIMARY KEY,
        key VARCHAR(128) UNIQUE NOT NULL,
        name VARCHAR(128) NOT NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'read',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMP WITH TIME ZONE
      );

      CREATE TABLE IF NOT EXISTS admin_users (
        id VARCHAR(64) PRIMARY KEY,
        username VARCHAR(64) UNIQUE NOT NULL,
        password_hash VARCHAR(256) NOT NULL,
        salt VARCHAR(64) NOT NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'superadmin',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        last_login TIMESTAMP WITH TIME ZONE
      );

      CREATE TABLE IF NOT EXISTS admin_sessions (
        token VARCHAR(128) PRIMARY KEY,
        admin_id VARCHAR(64) NOT NULL,
        username VARCHAR(64) NOT NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'superadmin',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS facebook_publisher_state (
        id VARCHAR(64) PRIMARY KEY,
        publishing_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        publishing_paused BOOLEAN NOT NULL DEFAULT FALSE,
        pause_reason TEXT,
        cooldown_until TIMESTAMP WITH TIME ZONE,
        cooldown_reason TEXT,
        last_attempt_at TIMESTAMP WITH TIME ZONE,
        last_publish_at TIMESTAMP WITH TIME ZONE,
        last_successful_publish_at TIMESTAMP WITH TIME ZONE,
        last_facebook_post_id VARCHAR(128),
        last_published_content_hash VARCHAR(128),
        pending_content_hash VARCHAR(128),
        consecutive_meta_blocks INT NOT NULL DEFAULT 0,
        total_meta_blocks INT NOT NULL DEFAULT 0,
        last_error_code INT,
        last_error_subcode INT,
        last_error_message TEXT,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS facebook_pending_publications (
        id VARCHAR(64) PRIMARY KEY,
        publication_type VARCHAR(32) NOT NULL DEFAULT 'LIVE',
        match_id VARCHAR(64) NOT NULL,
        match_title VARCHAR(256) NOT NULL,
        league_name VARCHAR(128) NOT NULL,
        event_type VARCHAR(32) NOT NULL DEFAULT 'STATUS_CHANGE',
        content TEXT NOT NULL,
        content_hash VARCHAR(128) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        attempt_count INT NOT NULL DEFAULT 0,
        last_error TEXT,
        available_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS facebook_publisher_locks (
        lock_name VARCHAR(64) PRIMARY KEY,
        locked BOOLEAN NOT NULL DEFAULT FALSE,
        lock_owner VARCHAR(128),
        locked_at TIMESTAMP WITH TIME ZONE,
        lease_until TIMESTAMP WITH TIME ZONE
      );
    `;
    await this.pgPool.query(schemaSql);
  }

  async saveMatches(matches: Match[]): Promise<void> {
    if (this.isPostgres && this.pgPool) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN');
        for (const m of matches) {
          await client.query(
            `INSERT INTO matches (
              id, provider, league_id, league_name, league_country,
              home_team_id, home_team_name, away_team_id, away_team_name,
              home_score, away_score, status, status_text, minute,
              start_time, raw_payload, stats, last_updated
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
            ON CONFLICT (id) DO UPDATE SET
              home_score = EXCLUDED.home_score,
              away_score = EXCLUDED.away_score,
              status = EXCLUDED.status,
              status_text = EXCLUDED.status_text,
              minute = EXCLUDED.minute,
              stats = EXCLUDED.stats,
              last_updated = NOW()`,
            [
              m.id, m.provider, m.league.id, m.league.name, m.league.country,
              m.homeTeam.id, m.homeTeam.name, m.awayTeam.id, m.awayTeam.name,
              m.homeScore, m.awayScore, m.status, m.statusText, m.minute || null,
              m.startTime, JSON.stringify(m), JSON.stringify(m.stats || {})
            ]
          );
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } else {
      for (const m of matches) {
        this.localData.matches[m.id] = { ...m, lastUpdated: new Date().toISOString() };
      }
      this.saveLocalData();
    }
  }

  async saveMatch(match: Match): Promise<void> {
    return this.saveMatches([match]);
  }

  async saveEvents(events: MatchEvent[]): Promise<void> {
    return this.saveMatchEvents(events);
  }

  async getMatchById(id: string): Promise<Match | null> {
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query('SELECT raw_payload FROM matches WHERE id = $1', [id]);
      if (res.rows.length === 0) return null;
      return res.rows[0].raw_payload as Match;
    }
    return this.localData.matches[id] || null;
  }

  async getAllMatches(filter?: { status?: string; leagueId?: string; limit?: number }): Promise<Match[]> {
    if (this.isPostgres && this.pgPool) {
      let q = 'SELECT raw_payload FROM matches WHERE 1=1';
      const params: any[] = [];
      if (filter?.status) {
        params.push(filter.status);
        q += ` AND status = $${params.length}`;
      }
      if (filter?.leagueId) {
        params.push(filter.leagueId);
        q += ` AND league_id = $${params.length}`;
      }
      q += ' ORDER BY start_time DESC';
      if (filter?.limit) {
        params.push(filter.limit);
        q += ` LIMIT $${params.length}`;
      }
      const res = await this.pgPool.query(q, params);
      return res.rows.map(r => r.raw_payload as Match);
    }

    let list = Object.values(this.localData.matches);
    if (filter?.status) {
      list = list.filter(m => m.status === filter.status);
    }
    if (filter?.leagueId) {
      list = list.filter(m => m.league.id === filter.leagueId);
    }
    list.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    if (filter?.limit) {
      list = list.slice(0, filter.limit);
    }
    return list;
  }

  async saveMatchEvents(events: MatchEvent[]): Promise<void> {
    if (events.length === 0) return;
    if (this.isPostgres && this.pgPool) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN');
        for (const ev of events) {
          await client.query(
            `INSERT INTO match_events (
              id, match_id, event_type, minute, extra_minute,
              team_side, player_name, secondary_player_name, detail,
              home_score, away_score, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (id) DO NOTHING`,
            [
              ev.id, ev.matchId, ev.type, ev.minute, ev.extraMinute || null,
              ev.teamSide, ev.playerName, ev.secondaryPlayerName || null, ev.detail || null,
              ev.homeScore ?? null, ev.awayScore ?? null, ev.createdAt
            ]
          );
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } else {
      for (const ev of events) {
        if (!this.localData.events[ev.matchId]) {
          this.localData.events[ev.matchId] = [];
        }
        const existingIdx = this.localData.events[ev.matchId].findIndex(e => e.id === ev.id);
        if (existingIdx === -1) {
          this.localData.events[ev.matchId].push(ev);
        }
      }
      this.saveLocalData();
    }
  }

  async getEventsByMatchId(matchId: string): Promise<MatchEvent[]> {
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(
        'SELECT * FROM match_events WHERE match_id = $1 ORDER BY minute ASC',
        [matchId]
      );
      return res.rows.map(r => ({
        id: r.id,
        matchId: r.match_id,
        type: r.event_type,
        minute: r.minute,
        extraMinute: r.extra_minute,
        teamSide: r.team_side,
        playerName: r.player_name,
        secondaryPlayerName: r.secondary_player_name,
        detail: r.detail,
        homeScore: r.home_score,
        awayScore: r.away_score,
        createdAt: r.created_at.toISOString(),
      }));
    }
    return this.localData.events[matchId] || [];
  }

  async saveFacebookPost(post: FacebookPostRecord): Promise<void> {
    if (this.isPostgres && this.pgPool) {
      await this.pgPool.query(
        `INSERT INTO facebook_posts (
          id, match_id, match_title, league_name, event_type,
          message, fb_post_id, status, error, retry_count,
          created_at, published_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          fb_post_id = EXCLUDED.fb_post_id,
          error = EXCLUDED.error,
          retry_count = EXCLUDED.retry_count,
          published_at = EXCLUDED.published_at`,
        [
          post.id, post.matchId, post.matchTitle, post.leagueName, post.eventType,
          post.message, post.fbPostId || null, post.status, post.error || null,
          post.retryCount, post.createdAt, post.publishedAt || null
        ]
      );
    } else {
      const idx = this.localData.facebookPosts.findIndex(p => p.id === post.id);
      if (idx >= 0) {
        this.localData.facebookPosts[idx] = post;
      } else {
        this.localData.facebookPosts.unshift(post);
      }
      this.saveLocalData();
    }
  }

  async updateFacebookPost(id: string, updates: Partial<FacebookPostRecord>): Promise<void> {
    if (this.isPostgres && this.pgPool) {
      const setClauses: string[] = [];
      const values: any[] = [];
      let i = 1;
      for (const [key, val] of Object.entries(updates)) {
        const col = key === 'fbPostId' ? 'fb_post_id'
          : key === 'publishedAt' ? 'published_at'
          : key === 'retryCount' ? 'retry_count'
          : key;
        setClauses.push(`${col} = $${i++}`);
        values.push(val);
      }
      values.push(id);
      await this.pgPool.query(`UPDATE facebook_posts SET ${setClauses.join(', ')} WHERE id = $${i}`, values);
    } else {
      const idx = this.localData.facebookPosts.findIndex(p => p.id === id);
      if (idx >= 0) {
        this.localData.facebookPosts[idx] = { ...this.localData.facebookPosts[idx], ...updates };
        this.saveLocalData();
      }
    }
  }

  async getFacebookPosts(limit = 50, offset = 0): Promise<FacebookPostRecord[]> {
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(
        'SELECT * FROM facebook_posts ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      );
      return res.rows.map(r => ({
        id: r.id,
        matchId: r.match_id,
        matchTitle: r.match_title,
        leagueName: r.league_name,
        eventType: r.event_type,
        message: r.message,
        fbPostId: r.fb_post_id,
        status: r.status,
        error: r.error,
        retryCount: r.retry_count,
        createdAt: r.created_at.toISOString(),
        publishedAt: r.published_at ? r.published_at.toISOString() : undefined,
      }));
    }
    return this.localData.facebookPosts.slice(offset, offset + limit);
  }

  async clearFacebookPosts(): Promise<void> {
    if (this.isPostgres && this.pgPool) {
      await this.pgPool.query('DELETE FROM facebook_posts');
    } else {
      this.localData.facebookPosts = [];
      this.saveLocalData();
    }
  }

  async deleteFacebookPost(id: string): Promise<boolean> {
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query('DELETE FROM facebook_posts WHERE id = $1', [id]);
      return (res.rowCount ?? 0) > 0;
    } else {
      const initial = this.localData.facebookPosts.length;
      this.localData.facebookPosts = this.localData.facebookPosts.filter(p => p.id !== id);
      const changed = this.localData.facebookPosts.length !== initial;
      if (changed) this.saveLocalData();
      return changed;
    }
  }

  async dismissAntiSpamWarnings(): Promise<number> {
    let count = 0;
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(
        "UPDATE facebook_posts SET error = NULL WHERE error LIKE '%1390008%' OR error LIKE '%velocity%' OR error LIKE '%spam%'"
      );
      count = res.rowCount ?? 0;
    } else {
      for (const p of this.localData.facebookPosts) {
        if (p.error && (p.error.includes('1390008') || p.error.includes('velocity') || p.error.includes('spam'))) {
          p.error = undefined;
          count++;
        }
      }
      if (count > 0) this.saveLocalData();
    }
    return count;
  }

  // -------------------------------------------------------------
  // Centralized Facebook Publisher State (PostgreSQL Persistent)
  // -------------------------------------------------------------

  async getFacebookPublisherState(): Promise<FacebookPublisherState> {
    const defaultState: FacebookPublisherState = {
      id: 'primary',
      publishingEnabled: true,
      publishingPaused: false,
      consecutiveMetaBlocks: 0,
      totalMetaBlocks: 0,
      updatedAt: new Date().toISOString(),
    };

    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(
        'SELECT * FROM facebook_publisher_state WHERE id = $1',
        ['primary']
      );
      if (res.rows.length === 0) {
        // Initialize default row
        await this.saveFacebookPublisherState(defaultState);
        return defaultState;
      }
      const r = res.rows[0];
      return {
        id: r.id,
        publishingEnabled: r.publishing_enabled,
        publishingPaused: r.publishing_paused,
        pauseReason: r.pause_reason || undefined,
        cooldownUntil: r.cooldown_until ? new Date(r.cooldown_until).toISOString() : undefined,
        cooldownReason: r.cooldown_reason || undefined,
        lastAttemptAt: r.last_attempt_at ? new Date(r.last_attempt_at).toISOString() : undefined,
        lastPublishAt: r.last_publish_at ? new Date(r.last_publish_at).toISOString() : undefined,
        lastSuccessfulPublishAt: r.last_successful_publish_at ? new Date(r.last_successful_publish_at).toISOString() : undefined,
        lastFacebookPostId: r.last_facebook_post_id || undefined,
        lastPublishedContentHash: r.last_published_content_hash || undefined,
        pendingContentHash: r.pending_content_hash || undefined,
        consecutiveMetaBlocks: Number(r.consecutive_meta_blocks || 0),
        totalMetaBlocks: Number(r.total_meta_blocks || 0),
        lastErrorCode: r.last_error_code ? Number(r.last_error_code) : undefined,
        lastErrorSubcode: r.last_error_subcode ? Number(r.last_error_subcode) : undefined,
        lastErrorMessage: r.last_error_message || undefined,
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
      };
    } else {
      if (!this.localData.facebookPublisherState) {
        this.localData.facebookPublisherState = { ...defaultState };
        this.saveLocalData();
      }
      return { ...this.localData.facebookPublisherState };
    }
  }

  async saveFacebookPublisherState(state: FacebookPublisherState): Promise<void> {
    state.updatedAt = new Date().toISOString();
    if (this.isPostgres && this.pgPool) {
      await this.pgPool.query(
        `INSERT INTO facebook_publisher_state (
          id, publishing_enabled, publishing_paused, pause_reason,
          cooldown_until, cooldown_reason, last_attempt_at, last_publish_at,
          last_successful_publish_at, last_facebook_post_id, last_published_content_hash,
          pending_content_hash, consecutive_meta_blocks, total_meta_blocks,
          last_error_code, last_error_subcode, last_error_message, updated_at
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11,
          $12, $13, $14,
          $15, $16, $17, NOW()
        ) ON CONFLICT (id) DO UPDATE SET
          publishing_enabled = EXCLUDED.publishing_enabled,
          publishing_paused = EXCLUDED.publishing_paused,
          pause_reason = EXCLUDED.pause_reason,
          cooldown_until = EXCLUDED.cooldown_until,
          cooldown_reason = EXCLUDED.cooldown_reason,
          last_attempt_at = EXCLUDED.last_attempt_at,
          last_publish_at = EXCLUDED.last_publish_at,
          last_successful_publish_at = EXCLUDED.last_successful_publish_at,
          last_facebook_post_id = EXCLUDED.last_facebook_post_id,
          last_published_content_hash = EXCLUDED.last_published_content_hash,
          pending_content_hash = EXCLUDED.pending_content_hash,
          consecutive_meta_blocks = EXCLUDED.consecutive_meta_blocks,
          total_meta_blocks = EXCLUDED.total_meta_blocks,
          last_error_code = EXCLUDED.last_error_code,
          last_error_subcode = EXCLUDED.last_error_subcode,
          last_error_message = EXCLUDED.last_error_message,
          updated_at = NOW()`,
        [
          state.id || 'primary',
          state.publishingEnabled,
          state.publishingPaused,
          state.pauseReason || null,
          state.cooldownUntil || null,
          state.cooldownReason || null,
          state.lastAttemptAt || null,
          state.lastPublishAt || null,
          state.lastSuccessfulPublishAt || null,
          state.lastFacebookPostId || null,
          state.lastPublishedContentHash || null,
          state.pendingContentHash || null,
          state.consecutiveMetaBlocks || 0,
          state.totalMetaBlocks || 0,
          state.lastErrorCode || null,
          state.lastErrorSubcode || null,
          state.lastErrorMessage || null,
        ]
      );
    } else {
      this.localData.facebookPublisherState = { ...state };
      this.saveLocalData();
    }
  }

  // -------------------------------------------------------------
  // Centralized Pending Publications (Coalesced & Restart-Safe)
  // -------------------------------------------------------------

  async getPendingPublication(type?: string): Promise<FacebookPendingPublication | null> {
    if (this.isPostgres && this.pgPool) {
      let query = "SELECT * FROM facebook_pending_publications WHERE status = 'PENDING'";
      const params: any[] = [];
      if (type) {
        query += ' AND publication_type = $1';
        params.push(type);
      }
      query += ' ORDER BY created_at ASC LIMIT 1';
      const res = await this.pgPool.query(query, params);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        publicationType: r.publication_type,
        matchId: r.match_id,
        matchTitle: r.match_title,
        leagueName: r.league_name,
        eventType: r.event_type,
        content: r.content,
        contentHash: r.content_hash,
        status: r.status,
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
        attemptCount: Number(r.attempt_count || 0),
        lastError: r.last_error || undefined,
        availableAt: new Date(r.available_at).toISOString(),
      };
    } else {
      if (!this.localData.facebookPendingPublications) {
        this.localData.facebookPendingPublications = [];
      }
      const item = this.localData.facebookPendingPublications.find(
        p => p.status === 'PENDING' && (!type || p.publicationType === type)
      );
      return item ? { ...item } : null;
    }
  }

  async getAllPendingPublications(): Promise<FacebookPendingPublication[]> {
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(
        "SELECT * FROM facebook_pending_publications WHERE status = 'PENDING' ORDER BY created_at ASC"
      );
      return res.rows.map(r => ({
        id: r.id,
        publicationType: r.publication_type,
        matchId: r.match_id,
        matchTitle: r.match_title,
        leagueName: r.league_name,
        eventType: r.event_type,
        content: r.content,
        contentHash: r.content_hash,
        status: r.status,
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
        attemptCount: Number(r.attempt_count || 0),
        lastError: r.last_error || undefined,
        availableAt: new Date(r.available_at).toISOString(),
      }));
    } else {
      return (this.localData.facebookPendingPublications || []).filter(p => p.status === 'PENDING');
    }
  }

  async savePendingPublication(pub: FacebookPendingPublication): Promise<void> {
    if (this.isPostgres && this.pgPool) {
      await this.pgPool.query(
        `INSERT INTO facebook_pending_publications (
          id, publication_type, match_id, match_title, league_name, event_type,
          content, content_hash, status, created_at, updated_at, attempt_count,
          last_error, available_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, NOW(), $11,
          $12, $13
        ) ON CONFLICT (id) DO UPDATE SET
          content = EXCLUDED.content,
          content_hash = EXCLUDED.content_hash,
          match_title = EXCLUDED.match_title,
          status = EXCLUDED.status,
          updated_at = NOW(),
          attempt_count = EXCLUDED.attempt_count,
          last_error = EXCLUDED.last_error,
          available_at = EXCLUDED.available_at`,
        [
          pub.id,
          pub.publicationType,
          pub.matchId,
          pub.matchTitle,
          pub.leagueName,
          pub.eventType,
          pub.content,
          pub.contentHash,
          pub.status,
          pub.createdAt || new Date().toISOString(),
          pub.attemptCount || 0,
          pub.lastError || null,
          pub.availableAt || new Date().toISOString(),
        ]
      );
    } else {
      if (!this.localData.facebookPendingPublications) {
        this.localData.facebookPendingPublications = [];
      }
      const idx = this.localData.facebookPendingPublications.findIndex(p => p.id === pub.id);
      if (idx >= 0) {
        this.localData.facebookPendingPublications[idx] = { ...pub, updatedAt: new Date().toISOString() };
      } else {
        this.localData.facebookPendingPublications.push({ ...pub, updatedAt: new Date().toISOString() });
      }
      this.saveLocalData();
    }
  }

  async deletePendingPublication(id: string): Promise<void> {
    if (this.isPostgres && this.pgPool) {
      await this.pgPool.query('DELETE FROM facebook_pending_publications WHERE id = $1', [id]);
    } else {
      if (!this.localData.facebookPendingPublications) return;
      this.localData.facebookPendingPublications = this.localData.facebookPendingPublications.filter(p => p.id !== id);
      this.saveLocalData();
    }
  }

  async clearPendingPublications(): Promise<number> {
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query("DELETE FROM facebook_pending_publications WHERE status = 'PENDING'");
      return res.rowCount ?? 0;
    } else {
      if (!this.localData.facebookPendingPublications) return 0;
      const count = this.localData.facebookPendingPublications.filter(p => p.status === 'PENDING').length;
      this.localData.facebookPendingPublications = this.localData.facebookPendingPublications.filter(p => p.status !== 'PENDING');
      this.saveLocalData();
      return count;
    }
  }

  // -------------------------------------------------------------
  // PostgreSQL-Based Publisher Mutual Exclusion Lock with Expiring Lease
  // -------------------------------------------------------------

  async acquirePublisherLock(owner: string, leaseMs = 30000): Promise<boolean> {
    const lockName = 'facebook_publisher_primary_lock';
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + leaseMs);

    if (this.isPostgres && this.pgPool) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN');
        // Check current lock status
        const res = await client.query(
          'SELECT * FROM facebook_publisher_locks WHERE lock_name = $1 FOR UPDATE',
          [lockName]
        );

        let canAcquire = false;
        if (res.rows.length === 0) {
          canAcquire = true;
          await client.query(
            `INSERT INTO facebook_publisher_locks (lock_name, locked, lock_owner, locked_at, lease_until)
             VALUES ($1, TRUE, $2, NOW(), $3)`,
            [lockName, owner, leaseUntil.toISOString()]
          );
        } else {
          const row = res.rows[0];
          const isCurrentlyLocked = row.locked;
          const isExpired = row.lease_until ? new Date(row.lease_until).getTime() <= now.getTime() : true;
          const isSameOwner = row.lock_owner === owner;

          if (!isCurrentlyLocked || isExpired || isSameOwner) {
            canAcquire = true;
            await client.query(
              `UPDATE facebook_publisher_locks
               SET locked = TRUE, lock_owner = $2, locked_at = NOW(), lease_until = $3
               WHERE lock_name = $1`,
              [lockName, owner, leaseUntil.toISOString()]
            );
          }
        }

        await client.query('COMMIT');
        return canAcquire;
      } catch (e) {
        await client.query('ROLLBACK');
        console.warn('[DB Lock] Error acquiring publisher lock:', (e as Error).message);
        return false;
      } finally {
        client.release();
      }
    } else {
      if (!this.localData.facebookPublisherLocks) {
        this.localData.facebookPublisherLocks = {};
      }
      const existing = this.localData.facebookPublisherLocks[lockName];
      const isExpired = existing?.leaseUntil ? new Date(existing.leaseUntil).getTime() <= now.getTime() : true;
      const isSameOwner = existing?.lockOwner === owner;

      if (!existing || !existing.locked || isExpired || isSameOwner) {
        this.localData.facebookPublisherLocks[lockName] = {
          lockName,
          locked: true,
          lockOwner: owner,
          lockedAt: now.toISOString(),
          leaseUntil: leaseUntil.toISOString(),
        };
        this.saveLocalData();
        return true;
      }
      return false;
    }
  }

  async releasePublisherLock(owner: string): Promise<boolean> {
    const lockName = 'facebook_publisher_primary_lock';
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(
        `UPDATE facebook_publisher_locks
         SET locked = FALSE, lock_owner = NULL, lease_until = NULL
         WHERE lock_name = $1 AND (lock_owner = $2 OR lease_until <= NOW() OR lock_owner IS NULL)`,
        [lockName, owner]
      );
      return (res.rowCount ?? 0) > 0;
    } else {
      if (!this.localData.facebookPublisherLocks) return true;
      const existing = this.localData.facebookPublisherLocks[lockName];
      if (existing && (existing.lockOwner === owner || !existing.locked)) {
        this.localData.facebookPublisherLocks[lockName] = {
          lockName,
          locked: false,
        };
        this.saveLocalData();
        return true;
      }
      return false;
    }
  }

  async getPublisherLockStatus(): Promise<{ locked: boolean; owner?: string; remainingMs?: number }> {
    const lockName = 'facebook_publisher_primary_lock';
    const now = Date.now();
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(
        'SELECT * FROM facebook_publisher_locks WHERE lock_name = $1',
        [lockName]
      );
      if (res.rows.length === 0) return { locked: false };
      const r = res.rows[0];
      const leaseTime = r.lease_until ? new Date(r.lease_until).getTime() : 0;
      const isExpired = leaseTime <= now;
      if (r.locked && !isExpired) {
        return { locked: true, owner: r.lock_owner || undefined, remainingMs: leaseTime - now };
      }
      return { locked: false };
    } else {
      const existing = this.localData.facebookPublisherLocks?.[lockName];
      if (!existing || !existing.locked) return { locked: false };
      const leaseTime = existing.leaseUntil ? new Date(existing.leaseUntil).getTime() : 0;
      const isExpired = leaseTime <= now;
      if (!isExpired) {
        return { locked: true, owner: existing.lockOwner, remainingMs: leaseTime - now };
      }
      return { locked: false };
    }
  }

  async getSettings<T>(key: string, defaultValue: T): Promise<T> {
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query('SELECT value FROM system_settings WHERE key = $1', [key]);
      if (res.rows.length === 0) return defaultValue;
      return res.rows[0].value as T;
    }
    return (this.localData.settings[key] as T) ?? defaultValue;
  }

  async saveSettings(key: string, value: any): Promise<void> {
    if (this.isPostgres && this.pgPool) {
      await this.pgPool.query(
        'INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()',
        [key, JSON.stringify(value)]
      );
    } else {
      this.localData.settings[key] = value;
      this.saveLocalData();
    }
  }

  async getPublishedFtMatches(): Promise<PublishedFtRecord[]> {
    return this.getSettings<PublishedFtRecord[]>('publishedFtMatches', []);
  }

  async isFtMatchPublished(matchId: string, homeTeamName?: string, awayTeamName?: string): Promise<boolean> {
    const list = await this.getPublishedFtMatches();
    if (!list || list.length === 0) return false;

    // Check by match ID
    if (matchId && list.some(r => r.matchId === matchId)) {
      return true;
    }

    // Check by normalized team pair key to prevent duplicate posts even if ID changes
    if (homeTeamName && awayTeamName) {
      const cleanHome = homeTeamName.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      const cleanAway = awayTeamName.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      const teamKey = `${cleanHome}_vs_${cleanAway}`;
      if (teamKey && list.some(r => r.teamKey === teamKey)) {
        return true;
      }
    }

    return false;
  }

  async markFtMatchesPublished(matches: Match[]): Promise<void> {
    if (!matches || matches.length === 0) return;
    const current = await this.getPublishedFtMatches();
    const newRecords: PublishedFtRecord[] = [];
    const now = new Date().toISOString();

    for (const m of matches) {
      const matchId = m.id;
      const home = m.homeTeam?.name || '';
      const away = m.awayTeam?.name || '';
      const cleanHome = home.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      const cleanAway = away.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      const teamKey = `${cleanHome}_vs_${cleanAway}`;

      const alreadyExists = current.some(
        r => r.matchId === matchId || (teamKey && r.teamKey === teamKey)
      );

      if (!alreadyExists) {
        newRecords.push({
          matchId,
          teamKey,
          homeTeam: home,
          awayTeam: away,
          leagueName: m.league?.name || '',
          score: `${m.homeScore ?? 0} - ${m.awayScore ?? 0}`,
          publishedAt: now,
        });
      }
    }

    if (newRecords.length > 0) {
      // Keep up to 2000 most recent records
      const combined = [...newRecords, ...current].slice(0, 2000);
      await this.saveSettings('publishedFtMatches', combined);
    }
  }

  async clearPublishedFtMatches(): Promise<void> {
    await this.saveSettings('publishedFtMatches', []);
  }

  async getApiKeys(): Promise<ApiKeyRecord[]> {
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query('SELECT * FROM api_keys ORDER BY created_at DESC');
      return res.rows.map(r => ({
        id: r.id,
        key: r.key,
        name: r.name,
        role: r.role,
        createdAt: r.created_at.toISOString(),
        lastUsedAt: r.last_used_at ? r.last_used_at.toISOString() : undefined,
      }));
    }
    return this.localData.apiKeys;
  }

  async validateApiKey(key: string): Promise<ApiKeyRecord | null> {
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query('SELECT * FROM api_keys WHERE key = $1', [key]);
      if (res.rows.length === 0) return null;
      await this.pgPool.query('UPDATE api_keys SET last_used_at = NOW() WHERE key = $1', [key]);
      const r = res.rows[0];
      return {
        id: r.id,
        key: r.key,
        name: r.name,
        role: r.role,
        createdAt: r.created_at.toISOString(),
        lastUsedAt: new Date().toISOString(),
      };
    }
    const match = this.localData.apiKeys.find(k => k.key === key);
    if (match) {
      match.lastUsedAt = new Date().toISOString();
      this.saveLocalData();
      return match;
    }
    return null;
  }

  async getDailyLeagueSelection(timeZone = 'UTC'): Promise<DailyLeagueSelection> {
    const today = getTodayDateString(timeZone);
    const stored = await this.getSettings<DailyLeagueSelection | null>('dailyLeagueSelection', null);

    // If no selection stored, or if the date has changed (new day began!):
    if (!stored || stored.date !== today) {
      const resetSelection: DailyLeagueSelection = {
        date: today,
        selectedLeagueIds: [],
        selectedLeagueNames: [],
        allLeaguesSelected: false,
        lastUpdated: new Date().toISOString(),
      };
      await this.saveSettings('dailyLeagueSelection', resetSelection);

      // Also reset fbConfig targetLeagueIds so they remain strictly in sync
      const fbConfig = await this.getSettings<FacebookPageConfig | null>('fbConfig', null);
      if (fbConfig) {
        fbConfig.targetLeagueIds = [];
        await this.saveSettings('fbConfig', fbConfig);
      }
      return resetSelection;
    }

    return stored;
  }

  async saveDailyLeagueSelection(
    selection: { selectedLeagueIds: string[]; selectedLeagueNames?: string[]; allLeaguesSelected?: boolean },
    timeZone = 'UTC'
  ): Promise<DailyLeagueSelection> {
    const today = getTodayDateString(timeZone);
    const updated: DailyLeagueSelection = {
      date: today,
      selectedLeagueIds: Array.isArray(selection.selectedLeagueIds) ? selection.selectedLeagueIds : [],
      selectedLeagueNames: Array.isArray(selection.selectedLeagueNames) ? selection.selectedLeagueNames : [],
      allLeaguesSelected: Boolean(selection.allLeaguesSelected),
      lastUpdated: new Date().toISOString(),
    };
    await this.saveSettings('dailyLeagueSelection', updated);

    // Synchronize fbConfig.targetLeagueIds
    const fbConfig = await this.getSettings<FacebookPageConfig | null>('fbConfig', null);
    if (fbConfig) {
      fbConfig.targetLeagueIds = updated.selectedLeagueIds;
      await this.saveSettings('fbConfig', fbConfig);
    }

    return updated;
  }

  async resetDailyLeagueSelection(timeZone = 'UTC'): Promise<DailyLeagueSelection> {
    const today = getTodayDateString(timeZone);
    const resetSelection: DailyLeagueSelection = {
      date: today,
      selectedLeagueIds: [],
      selectedLeagueNames: [],
      allLeaguesSelected: false,
      lastUpdated: new Date().toISOString(),
    };
    await this.saveSettings('dailyLeagueSelection', resetSelection);
    const fbConfig = await this.getSettings<FacebookPageConfig | null>('fbConfig', null);
    if (fbConfig) {
      fbConfig.targetLeagueIds = [];
      await this.saveSettings('fbConfig', fbConfig);
    }
    return resetSelection;
  }

  async getStats(): Promise<{ matchCount: number; eventCount: number; fbPostCount: number; dbType: string }> {
    if (this.isPostgres && this.pgPool) {
      const m = await this.pgPool.query('SELECT COUNT(*) FROM matches');
      const e = await this.pgPool.query('SELECT COUNT(*) FROM match_events');
      const p = await this.pgPool.query('SELECT COUNT(*) FROM facebook_posts');
      return {
        matchCount: parseInt(m.rows[0].count, 10),
        eventCount: parseInt(e.rows[0].count, 10),
        fbPostCount: parseInt(p.rows[0].count, 10),
        dbType: 'PostgreSQL'
      };
    }
    const matchCount = Object.keys(this.localData.matches).length;
    const eventCount = Object.values(this.localData.events).reduce((sum, evList) => sum + evList.length, 0);
    const fbPostCount = this.localData.facebookPosts.length;
    return {
      matchCount,
      eventCount,
      fbPostCount,
      dbType: 'Persistent SQL/JSON Store'
    };
  }

  // -------------------------------------------------------------
  // Admin User & Session Authentication
  // -------------------------------------------------------------

  hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  }

  generateSalt(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  async initAdminUserIfNone(): Promise<void> {
    try {
      const count = await this.getAdminCount();
      if (count === 0) {
        const salt = this.generateSalt();
        const defaultUsername = 'admin';
        const defaultPassword = 'admin12345';
        const passwordHash = this.hashPassword(defaultPassword, salt);
        const adminId = 'admin_' + crypto.randomBytes(8).toString('hex');

        if (this.isPostgres && this.pgPool) {
          await this.pgPool.query(
            `INSERT INTO admin_users (id, username, password_hash, salt, role, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (username) DO NOTHING`,
            [adminId, defaultUsername, passwordHash, salt, 'superadmin']
          );
        } else {
          this.localData.adminUsers.push({
            id: adminId,
            username: defaultUsername,
            passwordHash,
            salt,
            role: 'superadmin',
            createdAt: new Date().toISOString(),
          });
          this.saveLocalData();
        }
        console.log(`[Auth] Initialized default superadmin user ('${defaultUsername}'). Password: '${defaultPassword}'`);
      }
    } catch (e) {
      console.error('[Auth] Error initializing default admin:', e);
    }
  }

  async getAdminCount(): Promise<number> {
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query('SELECT COUNT(*) FROM admin_users');
      return parseInt(res.rows[0].count, 10);
    }
    return (this.localData.adminUsers || []).length;
  }

  async getAdminByUsername(username: string): Promise<(AdminUser & { passwordHash: string; salt: string }) | null> {
    const cleanUsername = username.trim().toLowerCase();
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(
        'SELECT id, username, password_hash, salt, role, created_at, last_login FROM admin_users WHERE LOWER(username) = $1 LIMIT 1',
        [cleanUsername]
      );
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        username: r.username,
        passwordHash: r.password_hash,
        salt: r.salt,
        role: r.role,
        createdAt: r.created_at,
        lastLogin: r.last_login,
      };
    }

    const found = (this.localData.adminUsers || []).find(u => u.username.toLowerCase() === cleanUsername);
    if (!found) return null;
    return {
      id: found.id,
      username: found.username,
      passwordHash: found.passwordHash,
      salt: found.salt,
      role: found.role,
      createdAt: found.createdAt,
      lastLogin: found.lastLogin,
    };
  }

  async getAdminById(id: string): Promise<AdminUser | null> {
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(
        'SELECT id, username, role, created_at, last_login FROM admin_users WHERE id = $1 LIMIT 1',
        [id]
      );
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        id: r.id,
        username: r.username,
        role: r.role,
        createdAt: r.created_at,
        lastLogin: r.last_login,
      };
    }

    const found = (this.localData.adminUsers || []).find(u => u.id === id);
    if (!found) return null;
    return {
      id: found.id,
      username: found.username,
      role: found.role,
      createdAt: found.createdAt,
      lastLogin: found.lastLogin,
    };
  }

  async createAdminUser(data: { username: string; password: string; role?: 'superadmin' | 'admin' | 'moderator' }): Promise<AdminUser> {
    const cleanUsername = data.username.trim().toLowerCase();
    const existing = await this.getAdminByUsername(cleanUsername);
    if (existing) {
      throw new Error(`Username "${data.username}" already exists.`);
    }

    const salt = this.generateSalt();
    const passwordHash = this.hashPassword(data.password, salt);
    const id = 'admin_' + crypto.randomBytes(8).toString('hex');
    const role = data.role || 'admin';
    const now = new Date().toISOString();

    if (this.isPostgres && this.pgPool) {
      await this.pgPool.query(
        `INSERT INTO admin_users (id, username, password_hash, salt, role, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, cleanUsername, passwordHash, salt, role, now]
      );
    } else {
      this.localData.adminUsers.push({
        id,
        username: cleanUsername,
        passwordHash,
        salt,
        role,
        createdAt: now,
      });
      this.saveLocalData();
    }

    return {
      id,
      username: cleanUsername,
      role,
      createdAt: now,
    };
  }

  async updateAdminPassword(adminId: string, newPassword: string): Promise<boolean> {
    const salt = this.generateSalt();
    const passwordHash = this.hashPassword(newPassword, salt);

    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(
        'UPDATE admin_users SET password_hash = $1, salt = $2 WHERE id = $3',
        [passwordHash, salt, adminId]
      );
      return (res.rowCount ?? 0) > 0;
    }

    const idx = (this.localData.adminUsers || []).findIndex(u => u.id === adminId);
    if (idx >= 0) {
      this.localData.adminUsers[idx].passwordHash = passwordHash;
      this.localData.adminUsers[idx].salt = salt;
      this.saveLocalData();
      return true;
    }
    return false;
  }

  async updateAdminLastLogin(adminId: string): Promise<void> {
    const now = new Date().toISOString();
    if (this.isPostgres && this.pgPool) {
      await this.pgPool.query('UPDATE admin_users SET last_login = NOW() WHERE id = $1', [adminId]);
      return;
    }

    const idx = (this.localData.adminUsers || []).findIndex(u => u.id === adminId);
    if (idx >= 0) {
      this.localData.adminUsers[idx].lastLogin = now;
      this.saveLocalData();
    }
  }

  async getAdminUsers(): Promise<AdminUser[]> {
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query('SELECT id, username, role, created_at, last_login FROM admin_users ORDER BY created_at ASC');
      return res.rows.map(r => ({
        id: r.id,
        username: r.username,
        role: r.role,
        createdAt: r.created_at,
        lastLogin: r.last_login,
      }));
    }

    return (this.localData.adminUsers || []).map(u => ({
      id: u.id,
      username: u.username,
      role: u.role,
      createdAt: u.createdAt,
      lastLogin: u.lastLogin,
    }));
  }

  async createSession(adminId: string, username: string, role = 'superadmin', expiresInDays = 7): Promise<AdminSession> {
    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

    const session: AdminSession = {
      token,
      adminId,
      username,
      role,
      createdAt: now.toISOString(),
      expiresAt,
    };

    if (this.isPostgres && this.pgPool) {
      await this.pgPool.query(
        `INSERT INTO admin_sessions (token, admin_id, username, role, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [token, adminId, username, role, session.createdAt, expiresAt]
      );
    } else {
      if (!this.localData.adminSessions) this.localData.adminSessions = [];
      this.localData.adminSessions.push(session);
      this.saveLocalData();
    }

    return session;
  }

  async validateSession(token: string): Promise<AdminSession | null> {
    if (!token) return null;

    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query(
        'SELECT token, admin_id, username, role, created_at, expires_at FROM admin_sessions WHERE token = $1 LIMIT 1',
        [token]
      );
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      if (new Date(r.expires_at).getTime() < Date.now()) {
        await this.deleteSession(token);
        return null;
      }
      return {
        token: r.token,
        adminId: r.admin_id,
        username: r.username,
        role: r.role,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
      };
    }

    const sessions = this.localData.adminSessions || [];
    const found = sessions.find(s => s.token === token);
    if (!found) return null;

    if (new Date(found.expiresAt).getTime() < Date.now()) {
      await this.deleteSession(token);
      return null;
    }

    return found;
  }

  async deleteSession(token: string): Promise<boolean> {
    if (this.isPostgres && this.pgPool) {
      const res = await this.pgPool.query('DELETE FROM admin_sessions WHERE token = $1', [token]);
      return (res.rowCount ?? 0) > 0;
    }

    const initialLen = (this.localData.adminSessions || []).length;
    this.localData.adminSessions = (this.localData.adminSessions || []).filter(s => s.token !== token);
    if (this.localData.adminSessions.length !== initialLen) {
      this.saveLocalData();
      return true;
    }
    return false;
  }

  getConnectionInfo() {
    const rawUrl = config.databaseUrl;
    let masked = 'None';
    let isRenderHost = false;
    if (rawUrl) {
      try {
        const u = new URL(rawUrl);
        masked = `${u.protocol}//${u.username}:****@${u.host}${u.pathname}`;
        isRenderHost = u.host.includes('dpg-') || u.host.includes('render.com');
      } catch {
        masked = 'Configured (PostgreSQL)';
      }
    }
    return {
      isPostgres: this.isPostgres,
      dbType: this.isPostgres ? 'PostgreSQL (Connected)' : (config.databaseUrl ? 'PostgreSQL (Fallback to Local Disk)' : 'Local JSON Disk Store'),
      databaseUrlMasked: masked,
      isRenderHost,
    };
  }
}

export const db = new DatabaseManager();
