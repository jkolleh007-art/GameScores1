import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { config } from '../config.js';
import { Match, MatchEvent, FacebookPostRecord, ApiKeyRecord, DailyLeagueSelection, FacebookPageConfig } from '../types.js';

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

interface LocalDbSchema {
  matches: Record<string, Match>;
  events: Record<string, MatchEvent[]>;
  facebookPosts: FacebookPostRecord[];
  settings: Record<string, any>;
  apiKeys: ApiKeyRecord[];
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
      : []
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
          ssl: config.databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false }
        });
        await this.pgPool.query('SELECT NOW()');
        this.isPostgres = true;
        console.log('[DB] Connected to PostgreSQL successfully.');
        await this.initPostgresSchema();
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
        this.localData = { ...this.localData, ...parsed };
        console.log('[DB] Loaded persistent local store from disk.');
      } catch (e) {
        console.error('[DB] Error loading local store, initializing fresh:', e);
        this.saveLocalData();
      }
    } else {
      this.saveLocalData();
    }
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
}

export const db = new DatabaseManager();
