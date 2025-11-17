-- Verification System Migration for Gatekeeper
-- Run this SQL in your Supabase SQL Editor

-- Verification Sessions Table
CREATE TABLE IF NOT EXISTS public.verification_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_id text NOT NULL,
    guild_id text NOT NULL,
    username text,
    token_hash text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    wallet_address text,
    signature text,
    signature_payload text,
    expires_at timestamptz NOT NULL,
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS verification_sessions_token_hash_idx
    ON public.verification_sessions (token_hash);

CREATE INDEX IF NOT EXISTS verification_sessions_discord_guild_idx
    ON public.verification_sessions (discord_id, guild_id);

-- Verification Attempts Table
CREATE TABLE IF NOT EXISTS public.verification_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.verification_sessions(id) ON DELETE CASCADE,
    ip_hash text,
    user_agent text,
    result_code text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verification_attempts_session_idx
    ON public.verification_attempts (session_id);

-- Guild Verification Contract Rules Table
CREATE TABLE IF NOT EXISTS public.guild_verification_contracts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id text NOT NULL,
    contract_address text NOT NULL,
    required_nft_count integer NOT NULL DEFAULT 1,
    role_id text,
    role_name text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (guild_id, contract_address, required_nft_count)
);

CREATE INDEX IF NOT EXISTS guild_verification_contracts_guild_idx
    ON public.guild_verification_contracts (guild_id);

-- Bot Configs Table (for verification channel/message storage)
CREATE TABLE IF NOT EXISTS public.bot_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id text NOT NULL UNIQUE,
    guild_name text NOT NULL,
    log_channel_id text,
    verification_channel_id text,
    verification_message_id text,
    settings jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_configs_guild_idx
    ON public.bot_configs (guild_id);
