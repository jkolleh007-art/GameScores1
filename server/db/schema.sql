-- Sports Database Schema for PostgreSQL & Persistent Storage

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
    match_id VARCHAR(64) NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_start_time ON matches(start_time);
CREATE INDEX IF NOT EXISTS idx_match_events_match_id ON match_events(match_id);
CREATE INDEX IF NOT EXISTS idx_facebook_posts_status ON facebook_posts(status);
