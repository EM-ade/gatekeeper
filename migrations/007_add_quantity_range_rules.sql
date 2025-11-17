ALTER TABLE public.guild_verification_contracts
ADD COLUMN IF NOT EXISTS max_nft_count integer;

DROP INDEX IF EXISTS guild_verification_contracts_unique_rule;
CREATE UNIQUE INDEX IF NOT EXISTS guild_verification_contracts_unique_rule
ON public.guild_verification_contracts (
    guild_id,
    contract_address,
    rule_type,
    COALESCE(trait_type, ''),
    COALESCE(trait_value, ''),
    required_nft_count,
    COALESCE(max_nft_count, -1)
);

COMMENT ON COLUMN public.guild_verification_contracts.max_nft_count IS 
'Optional upper bound for quantity rules; NULL means no upper limit';