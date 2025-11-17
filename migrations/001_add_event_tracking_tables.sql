-- Migration: Add event tracking tables for void arena
-- This migration adds support for tracking kills per event instead of cumulative totals

-- Events table to track each void event
CREATE TABLE IF NOT EXISTS void_events (
    event_id TEXT PRIMARY KEY,
    event_name TEXT NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    total_days INTEGER DEFAULT 5,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    goal_kills INTEGER DEFAULT 450,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Event participation and kills tracking
CREATE TABLE IF NOT EXISTS event_participation (
    event_id TEXT REFERENCES void_events(event_id),
    user_id TEXT REFERENCES linked_wallets(user_id),
    kills INTEGER DEFAULT 0,
    mkin_earned INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (event_id, user_id)
);

-- Daily progress tracking
CREATE TABLE IF NOT EXISTS event_daily_progress (
    event_id TEXT REFERENCES void_events(event_id),
    day_number INTEGER,
    total_kills INTEGER DEFAULT 0,
    unique_participants INTEGER DEFAULT 0,
    recorded_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (event_id, day_number)
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_event_participation_event ON event_participation(event_id);
CREATE INDEX IF NOT EXISTS idx_event_participation_user ON event_participation(user_id);
CREATE INDEX IF NOT EXISTS idx_event_daily_progress_event ON event_daily_progress(event_id);
CREATE INDEX IF NOT EXISTS idx_void_events_status ON void_events(status);
CREATE INDEX IF NOT EXISTS idx_void_events_time ON void_events(start_time, end_time);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for event_participation updated_at
DROP TRIGGER IF EXISTS update_event_participation_updated_at ON event_participation;
CREATE TRIGGER update_event_participation_updated_at
    BEFORE UPDATE ON event_participation
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert a default active event if none exists
INSERT INTO void_events (event_id, event_name, start_time, total_days, goal_kills, status)
SELECT 
    'void_event_' || EXTRACT(EPOCH FROM NOW())::TEXT,
    'Void Arena Event',
    NOW(),
    5,
    450,
    'active'
WHERE NOT EXISTS (SELECT 1 FROM void_events WHERE status = 'active');

COMMENT ON TABLE void_events IS 'Tracks void arena events and their metadata';
COMMENT ON TABLE event_participation IS 'Tracks user participation and kills per event';
COMMENT ON TABLE event_daily_progress IS 'Tracks daily progress statistics per event';
