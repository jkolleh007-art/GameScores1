export type MatchStatus =
  | 'SCHEDULED'
  | 'IN_PLAY'
  | 'PAUSED' // Half-time
  | 'EXTRA_TIME'
  | 'PENALTIES'
  | 'FINISHED'
  | 'POSTPONED'
  | 'CANCELLED'
  | 'SUSPENDED';

export interface Team {
  id: string;
  name: string;
  shortName?: string;
  logo?: string;
  country?: string;
}

export interface League {
  id: string;
  name: string;
  country: string;
  countryCode?: string;
  flag?: string;
  season?: string;
}

export type MatchEventType =
  | 'KICKOFF'
  | 'HALF_TIME'
  | 'FULL_TIME'
  | 'GOAL'
  | 'YELLOW_CARD'
  | 'RED_CARD'
  | 'YELLOW_RED_CARD'
  | 'CORNER'
  | 'SUBSTITUTION'
  | 'PENALTY_MISSED'
  | 'VAR_DECISION'
  | 'STATUS_CHANGE';

export interface MatchEvent {
  id: string;
  matchId: string;
  type: MatchEventType;
  minute: number;
  extraMinute?: number;
  teamSide: 'home' | 'away';
  playerName: string;
  secondaryPlayerName?: string; // assist or replaced player
  detail?: string; // "Penalty", "Own goal", "Foul"
  homeScore?: number;
  awayScore?: number;
  createdAt: string;
}

export interface MatchStats {
  possessionHome?: number;
  possessionAway?: number;
  shotsHome?: number;
  shotsAway?: number;
  shotsOnTargetHome?: number;
  shotsOnTargetAway?: number;
  cornersHome?: number;
  cornersAway?: number;
  foulsHome?: number;
  foulsAway?: number;
  yellowCardsHome?: number;
  yellowCardsAway?: number;
  redCardsHome?: number;
  redCardsAway?: number;
  substitutionsHome?: number;
  substitutionsAway?: number;
  penaltiesHome?: number;
  penaltiesAway?: number;
  offsidesHome?: number;
  offsidesAway?: number;
  savesHome?: number;
  savesAway?: number;
}

export interface Match {
  id: string;
  provider: string;
  league: League;
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number;
  awayScore: number;
  status: MatchStatus;
  statusText: string;
  minute?: number;
  extraMinute?: number;
  addedTime?: number;
  halfScores?: {
    home1?: number;
    away1?: number;
    home2?: number;
    away2?: number;
  };
  startTime: string; // ISO date string
  events?: MatchEvent[];
  stats?: MatchStats;
  lastUpdated: string;
}

export interface SportsProvider {
  id: string;
  name: string;
  description: string;
  isEnabled: boolean;
  isHealthy: boolean;
  latencyMs?: number;
  lastSyncTime?: string;
  getLiveMatches(): Promise<Match[]>;
  getFixtures(date?: string): Promise<Match[]>;
  getResults(date?: string): Promise<Match[]>;
  getMatchDetails(matchId: string): Promise<Match | null>;
  getMatchEvents(matchId: string): Promise<MatchEvent[]>;
  getMatchStatistics(matchId: string): Promise<MatchStats | null>;
}

export interface FacebookPageConfig {
  pageId: string;
  pageAccessToken?: string;
  pageName?: string;
  category?: string;
  link?: string;
  isConnected: boolean;
  autoPublishEnabled: boolean;
  publishingMode?: 'roundup'; // 'roundup' = all live games combined into 1 single post every X minutes
  roundupFormat?: 'default' | 'compact_emoji'; // 'default' = clean league format, 'compact_emoji' = bold digits + icon badges + legend
  roundupIntervalMinutes?: number; // e.g. 5 or 15 minutes between roundups
  minPostSpacingSeconds?: number; // minimum safe seconds between consecutive posts
  lastRoundupPublishedAt?: string;
  timezone?: string; // e.g. 'UTC', 'Africa/Monrovia', 'America/New_York', 'Europe/London'
  publishGoals: boolean;
  publishYellowCards?: boolean;
  publishRedCards: boolean;
  publishCorners?: boolean;
  publishKickoff: boolean;
  publishHalfTime: boolean;
  publishFullTime: boolean;
  includeStatsInFullTime: boolean;
  autoPublishFtRoundup?: boolean;
  lastFtRoundupPublishedAt?: string;
  lastHtRoundupPublishedAt?: string;
  targetLeagueIds: string[]; // empty means all leagues
  postTemplateGoal: string;
  postTemplateYellowCard?: string;
  postTemplateRedCard: string;
  postTemplateCorner?: string;
  postTemplateKickoff: string;
  postTemplateHalfTime: string;
  postTemplateFullTime: string;
  postTemplateRoundup?: string;
  postTemplateFullTimeRoundup?: string;
  postTemplateHalfTimeRoundup?: string;
  useDeepseekAi?: boolean;
  deepseekApiKey?: string;
  deepseekModel?: string;
  lastVerifiedAt?: string;
}

export interface DailyLeagueSelection {
  date: string; // YYYY-MM-DD
  selectedLeagueIds: string[];
  selectedLeagueNames: string[];
  allLeaguesSelected?: boolean;
  lastUpdated: string;
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

export interface PublishedHtRecord {
  matchId: string;
  teamKey: string;
  homeTeam: string;
  awayTeam: string;
  leagueName: string;
  score: string;
  publishedAt: string;
}

export interface FacebookPublisherState {
  id: string; // 'primary'
  publishingEnabled: boolean;
  publishingPaused: boolean;
  pauseReason?: string;
  cooldownUntil?: string; // ISO string
  cooldownReason?: string;
  lastAttemptAt?: string;
  lastPublishAt?: string;
  lastSuccessfulPublishAt?: string;
  lastFacebookPostId?: string;
  lastPublishedContentHash?: string;
  pendingContentHash?: string;
  consecutiveMetaBlocks: number;
  totalMetaBlocks: number;
  lastErrorCode?: number;
  lastErrorSubcode?: number;
  lastErrorMessage?: string;
  updatedAt: string;
}

export interface FacebookPendingPublication {
  id: string;
  publicationType: 'LIVE' | 'HALF_TIME' | 'FULL_TIME' | 'MANUAL' | 'TEST';
  matchId: string;
  matchTitle: string;
  leagueName: string;
  eventType: MatchEventType;
  content: string;
  contentHash: string;
  status: 'PENDING' | 'PUBLISHING' | 'PUBLISHED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
  attemptCount: number;
  lastError?: string;
  availableAt: string;
  headline?: string;
  matchesCount?: number;
  matchesSummary?: MatchSummaryItem[];
  publishedBy?: string;
  isAiGenerated?: boolean;
}

export interface FacebookPublisherLock {
  lockName: string;
  locked: boolean;
  lockOwner?: string;
  lockedAt?: string;
  leaseUntil?: string;
}

export interface MatchSummaryItem {
  id?: string;
  homeTeam: string;
  awayTeam: string;
  score: string;
  minute?: string;
  league?: string;
  statusText?: string;
}

export interface FacebookPostRecord {
  id: string;
  matchId: string;
  matchTitle: string;
  leagueName: string;
  eventType: MatchEventType;
  message: string;
  fbPostId?: string;
  status: 'QUEUED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'SKIPPED';
  error?: string;
  retryCount: number;
  createdAt: string;
  publishedAt?: string;
  headline?: string;
  postType?: 'LIVE' | 'HALF_TIME' | 'FULL_TIME' | 'MANUAL' | 'TEST';
  matchesCount?: number;
  matchesSummary?: MatchSummaryItem[];
  publishedBy?: string;
  isAiGenerated?: boolean;
}

export interface ApiKeyRecord {
  id: string;
  key: string;
  name: string;
  role: 'admin' | 'read';
  createdAt: string;
  lastUsedAt?: string;
}

export interface ScraperHealthStatus {
  service: 'python_scrapling' | 'node_api' | 'facebook_worker' | 'redis_cache' | 'database';
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  message: string;
  latencyMs: number;
  timestamp: string;
  details?: Record<string, any>;
}

export interface AdminUser {
  id: string;
  username: string;
  role: 'superadmin' | 'admin' | 'moderator';
  createdAt: string;
  lastLogin?: string;
}

export interface AdminSession {
  token: string;
  adminId: string;
  username: string;
  role: string;
  createdAt: string;
  expiresAt: string;
}

