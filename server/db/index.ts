import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import { config } from '../config.js';
import {
  Match,
  MatchEvent,
  FacebookPostRecord,
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
