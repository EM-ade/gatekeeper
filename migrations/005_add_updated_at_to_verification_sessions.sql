-- Add updated_at column to verification_sessions table
ALTER TABLE public.verification_sessions 
ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Add users table for verification tracking
CREATE TABLE IF NOT EXISTS public.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_id text NOT NULL,
    guild_id text NOT NULL,
    username text,
    wallet_address text,
    is_verified boolean NOT NULL DEFAULT false,
    last_verification_check timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (discord_id, guild_id)
);

CREATE INDEX IF NOT EXISTS users_discord_guild_idx
    ON public.users (discord_id, guild_id);

CREATE INDEX IF NOT EXISTS users_wallet_idx
    ON public.users (wallet_address);
