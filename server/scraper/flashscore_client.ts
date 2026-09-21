import { Match, MatchEvent, MatchStats } from '../types.js';
import { parseFlashscoreFeed, parseFlashscoreEvents, parseFlashscoreStatistics } from './flashscore_parser.js';
import { config } from '../config.js';

const FLASHSCORE_FALLBACKS = [
  'https://local-global.flashscore.ninja/2/x/feed',
  'https://2.flashscore.ninja/2/x/feed',
  'https://www.flashscore.com/x/feed',
];

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://www.flashscore.com/',
  'x-fsign': 'SW9D1eZo',
  'Accept-Language': 'en-GB,en;q=0.9',
};

export class FlashscoreClient {
  private lastLatencyMs = 0;
  private lastSuccessTime: string | null = null;
  private lastError: string | null = null;

  async fetchFeed(path: string, timeoutMs = 8000): Promise<string> {
    let lastErr: Error | null = null;
    const t0 = Date.now();

    for (const base of FLASHSCORE_FALLBACKS) {
      const url = `${base}/${path}`;
      try {
        const resp = await fetch(url, {
          headers: DEFAULT_HEADERS,
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (resp.ok) {
          const text = await resp.text();
          if (text && text.length > 0) {
            this.lastLatencyMs = Date.now() - t0;
            this.lastSuccessTime = new Date().toISOString();
            this.lastError = null;
            return text;
          }
        }
      } catch (err: any) {
        lastErr = err;
      }
    }

    this.lastError = lastErr?.message || 'Failed to fetch from all Flashscore mirrors';
    if (lastErr) throw lastErr;
    return '';
  }

  async getLiveMatches(): Promise<Match[]> {
    // Try external Scrapling microservice first if active
    try {
      const resp = await fetch(`${config.scraplingUrl}/matches/live`, {
        signal: AbortSignal.timeout(3000),
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          return json.data;
        }
      }
    } catch {
      // Fall through to native fetcher
    }

    // Native fetch from Flashscore Ninja
    const raw = await this.fetchFeed('f_1_0_2_en-uk_1');
    const all = parseFlashscoreFeed(raw);
    return all.filter((m) => ['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTIES'].includes(m.status));
  }

  async getTodayMatches(): Promise<Match[]> {
    try {
      const resp = await fetch(`${config.scraplingUrl}/matches/today`, {
        signal: AbortSignal.timeout(3000),
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          return json.data;
        }
      }
    } catch {
      // Fall through
    }

    const raw = await this.fetchFeed('f_1_0_1_en-uk_1');
    return parseFlashscoreFeed(raw);
  }

  async getFixtures(offset = 1): Promise<Match[]> {
    try {
      const resp = await fetch(`${config.scraplingUrl}/matches/fixtures?offset=${offset}`, {
        signal: AbortSignal.timeout(3000),
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json.success && Array.isArray(json.data)) {
          return json.data;
        }
      }
    } catch {
      // Fall through
    }

    const raw = await this.fetchFeed(`f_1_${offset}_4_en-uk_1`);
    const matches = parseFlashscoreFeed(raw);
    return matches.filter((m) => m.status === 'SCHEDULED');
  }

  async getResults(offset = -1): Promise<Match[]> {
    try {
      const resp = await fetch(`${config.scraplingUrl}/matches/results?offset=${offset}`, {
        signal: AbortSignal.timeout(3000),
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json.success && Array.isArray(json.data)) {
          return json.data;
        }
      }
    } catch {
      // Fall through
    }

    const raw = await this.fetchFeed(`f_1_${offset}_3_en-uk_1`);
    const matches = parseFlashscoreFeed(raw);
    return matches.filter((m) => m.status === 'FINISHED');
  }

  async getMatchEvents(matchId: string): Promise<MatchEvent[]> {
    try {
      const resp = await fetch(`${config.scraplingUrl}/match/${matchId}/events`, {
        signal: AbortSignal.timeout(3000),
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json.success && Array.isArray(json.data)) {
          return json.data;
        }
      }
    } catch {
      // Fall through
    }

    try {
      const raw = await this.fetchFeed(`df_su_1_${matchId}_en-uk_1`);
      return parseFlashscoreEvents(matchId, raw);
    } catch {
      return [];
    }
  }

  async getMatchStatistics(matchId: string): Promise<MatchStats | null> {
    try {
      const resp = await fetch(`${config.scraplingUrl}/match/${matchId}/stats`, {
        signal: AbortSignal.timeout(3000),
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json.success && json.data) {
          return json.data;
        }
      }
    } catch {
      // Fall through
    }

    try {
      const raw = await this.fetchFeed(`df_st_1_${matchId}_en-uk_1`);
      return parseFlashscoreStatistics(raw);
    } catch {
      return null;
    }
  }

  getStatus() {
    return {
      service: 'flashscore_native_ts',
      status: this.lastError ? 'DEGRADED' : 'ONLINE',
      latency_ms: this.lastLatencyMs,
      lastSuccess: this.lastSuccessTime,
      lastError: this.lastError,
    };
  }
}

export const flashscoreClient = new FlashscoreClient();
