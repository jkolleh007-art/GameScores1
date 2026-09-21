export type MatchStatus =
  | 'SCHEDULED'
  | 'IN_PLAY'
  | 'PAUSED'
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
  secondaryPlayerName?: string;
  detail?: string;
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
  startTime: string;
  events?: MatchEvent[];
  stats?: MatchStats;
  lastUpdated: string;
}

export interface FacebookPageConfig {
  pageId: string;
  pageAccessToken?: string;
  pageName?: string;
  category?: string;
  link?: string;
  isConnected: boolean;
  autoPublishEnabled: boolean;
  publishingMode?: 'roundup';
  roundupIntervalMinutes?: number;
  minPostSpacingSeconds?: number;
  lastRoundupPublishedAt?: string;
  timezone?: string;
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
  targetLeagueIds: string[];
  postTemplateGoal: string;
  postTemplateYellowCard?: string;
  postTemplateRedCard: string;
  postTemplateCorner?: string;
  postTemplateKickoff: string;
  postTemplateHalfTime: string;
  postTemplateFullTime: string;
  postTemplateRoundup?: string;
  postTemplateFullTimeRoundup?: string;
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
}

export interface SystemStatus {
  success: boolean;
  timestamp: string;
  nodeApi: {
    status: string;
    uptime: number;
    port: number;
    connectedWsClients: number;
  };
  scraplingService: {
    service: string;
    status: string;
    scrapling_version?: string;
    latency_ms?: number;
    upstream_accessible?: boolean;
    error?: string;
  };
  syncEngine: {
    isRunning: boolean;
    trackedLiveMatches: number;
    lastScrapeTime: string | null;
    scrapeCount: number;
    lastError: string | null;
    intervalSeconds: number;
  };
  facebookPublisher: {
    config: {
      pageId: string | null;
      isConnected: boolean;
      autoPublishEnabled: boolean;
      targetLeagueIds: string[];
    };
    queue: {
      queueLength: number;
      isProcessing: boolean;
      recentPublishCount: number;
      maxPerMinute: number;
      isCooldown?: boolean;
      cooldownSecondsRemaining?: number;
      cooldownReason?: string;
      lastPublishedAt?: string;
      minPostSpacingSeconds?: number;
    };
  };
  persistence: {
    type: string;
    connected: boolean;
  };
  cache: {
    type: string;
    connected: boolean;
  };
  dailyLeagueSelection?: {
    date: string;
    selectedCount: number;
    selectedLeagueNames: string[];
    isConfigured: boolean;
  };
}
