-- Migration: Add withdrawal transaction logs
-- Purpose: Track all withdrawal attempts for auditing and manual refunds

-- Table: withdrawal_transactions
-- Stores complete history of all withdrawal attempts
CREATE TABLE IF NOT EXISTS withdrawal_transactions (
    id SERIAL PRIMARY KEY,
    
    -- User Information
    user_id TEXT NOT NULL,
    discord_id TEXT,
    wallet_address TEXT NOT NULL,
    
    -- Withdrawal Details
    amount_mkin DECIMAL(20, 2) NOT NULL,
    fee_amount_sol DECIMAL(20, 10) NOT NULL,
    fee_amount_usd DECIMAL(10, 2) NOT NULL,
    sol_price_usd DECIMAL(10, 2) NOT NULL,
    
    -- Transaction Signatures
    fee_tx_signature TEXT,
    mkin_tx_signature TEXT,
    
    -- Status Tracking
    status TEXT NOT NULL, -- 'initiated', 'fee_verified', 'completed', 'failed', 'refunded'
    error_message TEXT,
    error_code TEXT,
    
    -- Firebase Balance Tracking
    balance_before DECIMAL(20, 2),
    balance_after DECIMAL(20, 2),
    balance_deducted BOOLEAN DEFAULT FALSE,
    balance_refunded BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fee_verified_at TIMESTAMP,
    completed_at TIMESTAMP,
    failed_at TIMESTAMP,
    refunded_at TIMESTAMP,
    
    -- Additional Metadata
    ip_address TEXT,
    user_agent TEXT,
    retry_count INTEGER DEFAULT 0,
    notes TEXT
);

-- Indexes for quick lookups
CREATE INDEX IF NOT EXISTS idx_withdrawal_user_id ON withdrawal_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_status ON withdrawal_transactions(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_fee_tx ON withdrawal_transactions(fee_tx_signature);
CREATE INDEX IF NOT EXISTS idx_withdrawal_mkin_tx ON withdrawal_transactions(mkin_tx_signature);
CREATE INDEX IF NOT EXISTS idx_withdrawal_initiated_at ON withdrawal_transactions(initiated_at);
CREATE INDEX IF NOT EXISTS idx_withdrawal_needs_refund ON withdrawal_transactions(status, balance_deducted, balance_refunded) 
    WHERE status = 'failed' AND balance_deducted = TRUE AND balance_refunded = FALSE;

-- View: pending_refunds
-- Shows all failed withdrawals that need manual refunds
CREATE OR REPLACE VIEW pending_refunds AS
SELECT 
    id,
    user_id,
    discord_id,
    wallet_address,
    amount_mkin,
    fee_tx_signature,
    error_message,
    initiated_at,
    failed_at,
    (NOW() - failed_at) AS hours_since_failure
FROM withdrawal_transactions
WHERE status = 'failed'
  AND balance_deducted = TRUE
  AND balance_refunded = FALSE
ORDER BY failed_at ASC;

-- View: withdrawal_stats
-- Aggregate statistics for monitoring
CREATE OR REPLACE VIEW withdrawal_stats AS
SELECT 
    DATE(initiated_at) AS date,
    COUNT(*) AS total_attempts,
    COUNT(*) FILTER (WHERE status = 'completed') AS successful,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed,
    COUNT(*) FILTER (WHERE status IN ('initiated', 'fee_verified')) AS pending,
    SUM(amount_mkin) FILTER (WHERE status = 'completed') AS total_mkin_withdrawn,
    SUM(fee_amount_usd) FILTER (WHERE status = 'completed') AS total_fees_collected,
    AVG(EXTRACT(EPOCH FROM (completed_at - initiated_at))) FILTER (WHERE status = 'completed') AS avg_completion_time_seconds
FROM withdrawal_transactions
GROUP BY DATE(initiated_at)
ORDER BY date DESC;

-- Comments
COMMENT ON TABLE withdrawal_transactions IS 'Complete audit log of all withdrawal attempts';
COMMENT ON COLUMN withdrawal_transactions.status IS 'initiated -> fee_verified -> completed OR failed -> refunded';
COMMENT ON VIEW pending_refunds IS 'Failed withdrawals that need manual balance refunds';
COMMENT ON VIEW withdrawal_stats IS 'Daily statistics for monitoring withdrawal system health';
