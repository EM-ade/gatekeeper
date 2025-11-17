-- Migration: Add per-user daily kills tracking for void arena
-- Tracks per-user kills per day for an event, enabling daily-only leaderboards

CREATE TABLE IF NOT EXISTS event_daily_user_kills (
    event_id TEXT REFERENCES void_events(event_id),
    day_number INTEGER NOT NULL,
    user_id TEXT REFERENCES linked_wallets(user_id),
    kills INTEGER DEFAULT 0,
    mkin_earned INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (event_id, day_number, user_id)
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_event_daily_user_kills_event_day ON event_daily_user_kills(event_id, day_number);
CREATE INDEX IF NOT EXISTS idx_event_daily_user_kills_user ON event_daily_user_kills(user_id);
