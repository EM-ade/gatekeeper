-- Add trait-based verification support to guild_verification_contracts
ALTER TABLE public.guild_verification_contracts
ADD COLUMN IF NOT EXISTS rule_type text NOT NULL DEFAULT 'quantity',
ADD COLUMN IF NOT EXISTS trait_type text,
ADD COLUMN IF NOT EXISTS trait_value text;

-- Add check constraint for rule types
ALTER TABLE public.guild_verification_contracts
DROP CONSTRAINT IF EXISTS valid_rule_type;

ALTER TABLE public.guild_verification_contracts
ADD CONSTRAINT valid_rule_type CHECK (rule_type IN ('quantity', 'trait'));

-- Update unique constraint to allow multiple rules per contract
ALTER TABLE public.guild_verification_contracts
DROP CONSTRAINT IF EXISTS guild_verification_contracts_guild_id_contract_address_requ_key;

-- Create new unique constraint that includes rule type and trait info
CREATE UNIQUE INDEX IF NOT EXISTS guild_verification_contracts_unique_rule
ON public.guild_verification_contracts (
    guild_id, 
    contract_address, 
    rule_type,
    COALESCE(trait_type, ''),
    COALESCE(trait_value, ''),
    required_nft_count
);

-- Add comment for documentation
COMMENT ON COLUMN public.guild_verification_contracts.rule_type IS 
'Type of verification rule: "quantity" for NFT count thresholds, "trait" for specific trait matching';

COMMENT ON COLUMN public.guild_verification_contracts.trait_type IS 
'For trait rules: the metadata attribute name to check (e.g., "CLASS")';

COMMENT ON COLUMN public.guild_verification_contracts.trait_value IS 
'For trait rules: the required attribute value (e.g., "King", "Wizard")';
