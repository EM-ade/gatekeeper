import crypto from 'crypto';
import sql from '../db.js';
import * as guildVerificationConfigStore from '../repositories/guildVerificationConfigsRepository.js';
import { PublicKey } from '@solana/web3.js';

const DEFAULT_SESSION_TTL_MINUTES = 10;

class VerificationSessionError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'VerificationSessionError';
    this.statusCode = statusCode;
  }
}

class VerificationSessionService {
  constructor() {
    this.sessionTtlMs =
      (parseInt(process.env.VERIFICATION_SESSION_TTL_MINUTES, 10) ||
        DEFAULT_SESSION_TTL_MINUTES) *
      60 *
      1000;
  }

  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  computeExpiresAt() {
    return new Date(Date.now() + this.sessionTtlMs).toISOString();
  }

  generateVerificationMessage(discordId, walletAddress) {
    const timestamp = Date.now();
    return `Verify your wallet for Discord\nDiscord ID: ${discordId}\n${walletAddress ? `Wallet: ${walletAddress}\n` : ''}Timestamp: ${timestamp}`;
  }

  isValidSolanaAddress(address) {
    if (!address || typeof address !== 'string') return false;
    // Proper Solana address validation using web3.js PublicKey class
    try {
      new PublicKey(address);
      return true;
    } catch (error) {
      console.warn(`[verification] Address ${address} is invalid: ${error.message}`);
      return false;
    }
  }

  async createSession({ discordId, guildId, walletAddress, username }) {
    if (!discordId || !guildId) {
      throw new VerificationSessionError('discordId and guildId are required.');
    }

    console.log('[verification:createSession] Received walletAddress:', walletAddress, 'type:', typeof walletAddress);
    
    // Store wallet address in original case but validate in lowercase
    if (walletAddress && !this.isValidSolanaAddress(walletAddress)) {
      console.error('[verification:createSession] Invalid wallet address format:', walletAddress);
      throw new VerificationSessionError('Invalid Solana wallet address.');
    }

    const token = this.generateToken();
    const tokenHash = this.hashToken(token);
    const message = this.generateVerificationMessage(discordId, walletAddress);
    const expiresAt = this.computeExpiresAt();

    const result = await sql`
      INSERT INTO verification_sessions (
        discord_id, guild_id, wallet_address, token_hash, 
        status, signature_payload, expires_at, username
      )
      VALUES (
        ${discordId}, ${guildId}, ${walletAddress || null}, ${tokenHash},
        'pending', ${message}, ${expiresAt}, ${username || null}
      )
      RETURNING *
    `;

    const session = result[0];

    console.log(`[verification] Created session ${session.id} for discordId=${discordId} guildId=${guildId}`);

    return {
      token,
      status: session.status,
      expiresAt: session.expires_at,
      message,
    };
  }

  async findSessionByToken(token) {
    if (!token) {
      throw new VerificationSessionError('Verification token is required.');
    }

    const tokenHash = this.hashToken(token);
    const result = await sql`
      SELECT * FROM verification_sessions 
      WHERE token_hash = ${tokenHash}
      LIMIT 1
    `;

    if (!result || result.length === 0) {
      return null;
    }

    const session = result[0];
    
    // Auto-expire if needed
    if (session.status === 'pending' && new Date(session.expires_at) <= new Date()) {
      await sql`
        UPDATE verification_sessions 
        SET status = 'expired' 
        WHERE id = ${session.id}
      `;
      session.status = 'expired';
    }

    return {
      id: session.id,
      discordId: session.discord_id,
      guildId: session.guild_id,
      walletAddress: session.wallet_address,
      status: session.status,
      expiresAt: session.expires_at,
      verifiedAt: session.verified_at,
      username: session.username,
      message: session.signature_payload,
      createdAt: session.created_at,
    };
  }

  async verifySession(token, signature, { username, walletAddress: providedWallet, client = null } = {}) {
    if (!token || !signature) {
      throw new VerificationSessionError('Verification token and signature are required.');
    }

    const tokenHash = this.hashToken(token);
    const result = await sql`
      SELECT * FROM verification_sessions 
      WHERE token_hash = ${tokenHash}
      LIMIT 1
    `;

    if (!result || result.length === 0) {
      throw new VerificationSessionError('Session not found.', 404);
    }

    const session = result[0];

    // Check if expired
    if (session.status === 'pending' && new Date(session.expires_at) <= new Date()) {
      await sql`
        UPDATE verification_sessions 
        SET status = 'expired' 
        WHERE id = ${session.id}
      `;
      throw new VerificationSessionError('Verification session has expired.', 410);
    }

    if (session.status !== 'pending') {
      throw new VerificationSessionError('Verification session already completed.', 409);
    }

    let walletAddress = session.wallet_address;

    if (!walletAddress) {
      walletAddress = providedWallet;

      if (!walletAddress) {
        throw new VerificationSessionError(
          'Verification session is missing wallet address. Please restart verification.',
          400
        );
      }

      if (!this.isValidSolanaAddress(walletAddress)) {
        throw new VerificationSessionError('Invalid Solana wallet address provided.', 400);
      }

      await sql`
        UPDATE verification_sessions 
        SET wallet_address = ${walletAddress}, updated_at = NOW()
        WHERE id = ${session.id}
      `;
    }

    // Verify signature (simplified - you should use proper Solana signature verification)
    const signatureValid = await this.verifySignature(session.signature_payload, signature, walletAddress);

    if (!signatureValid) {
      await sql`
        UPDATE verification_sessions 
        SET status = 'failed', updated_at = NOW()
        WHERE id = ${session.id}
      `;
      throw new VerificationSessionError('Invalid wallet signature.', 401);
    }

    // Get contract rules
    let contractRules = [];
    try {
      contractRules = await guildVerificationConfigStore.listByGuild(session.guild_id);
    } catch (error) {
      console.warn(`[verification] Failed to load guild contract rules: ${error.message}`);
    }

    // Verify NFT ownership
    const verificationResult = await this.verifyNFTOwnership(walletAddress, contractRules);
    
    // Add wallet address to verification result
    verificationResult.walletAddress = walletAddress;

    const meetsAnyRule = verificationResult.isVerified;

    // Update user verification status
    const lastVerifiedAt = new Date().toISOString();
    await this.updateUserVerification(session, verificationResult, username || session.username, lastVerifiedAt);

    const sessionStatus = meetsAnyRule ? 'verified' : 'completed';

    await sql`
      UPDATE verification_sessions 
      SET status = ${sessionStatus}, verified_at = ${lastVerifiedAt}, updated_at = ${lastVerifiedAt}
      WHERE id = ${session.id}
    `;

    // Immediately assign special roles if client is provided
    if (client && global.periodicVerificationService) {
      try {
        const guild = await client.guilds.fetch(session.guild_id);
        const member = await guild.members.fetch(session.discord_id);
        
        // Update class-based roles immediately (was previously called updateSpecialRoles)
        await global.periodicVerificationService.updateClassBasedRoles(
          member, 
          verificationResult.nfts, 
          username || session.username || session.discord_id,
          contractRules
        );
        
        console.log(`[verification] Immediately assigned special roles for user ${session.discord_id}`);
      } catch (roleError) {
        console.error(`[verification] Failed to assign special roles immediately:`, roleError.message);
        // Don't throw - role assignment failure shouldn't block verification
      }
    }

    return {
      session: {
        id: session.id,
        discordId: session.discord_id,
        guildId: session.guild_id,
        walletAddress,
        status: sessionStatus,
        verifiedAt: lastVerifiedAt,
      },
      verification: {
        walletAddress,
        nftCount: verificationResult.nftCount,
        isVerified: verificationResult.isVerified,
        nfts: verificationResult.nfts,
        contracts: verificationResult.contracts,
        verifiedAt: lastVerifiedAt,
      },
    };
  }

  async verifySignature(message, signature, walletAddress) {
    // TODO: Implement proper Solana signature verification
    // For now, return true (you need to add @solana/web3.js and nacl for proper verification)
    console.warn('[verification] Signature verification not fully implemented - accepting all signatures');
    return true;
  }

  async verifyNFTOwnership(walletAddress, contractRules) {
    // Use Helius RPC API with pagination (same as old bot)
    const heliusApiKey = process.env.HELIUS_API_KEY;
    
    if (!heliusApiKey) {
      console.warn('[verification] HELIUS_API_KEY not set, skipping NFT verification');
      return { isVerified: false, nftCount: 0, nfts: [], contracts: [] };
    }

    try {
      const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
      let allNFTs = [];
      let page = 1;
      let hasMore = true;
      const limit = 1000;

      while (hasMore) {
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'nft-verification',
            method: 'getAssetsByOwner',
            params: {
              ownerAddress: walletAddress,
              page: page,
              limit: limit,
              displayOptions: {
                showFungible: false,
                showNativeBalance: false,
                showInscription: false,
              },
            },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[verification] Helius RPC HTTP error:', response.status, errorText);
          return { isVerified: false, nftCount: 0, nfts: [], contracts: [] };
        }

        const data = await response.json();
        
        // Check for RPC error
        if (data.error) {
          console.error('[verification] Helius RPC error:', JSON.stringify(data.error));
          return { isVerified: false, nftCount: 0, nfts: [], contracts: [] };
        }
        
        const items = data.result?.items || [];
        allNFTs = allNFTs.concat(items);
        
        console.log(`[verification] Fetched page ${page}: ${items.length} items (total: ${allNFTs.length})`);
        
        // Check if there are more pages
        hasMore = items.length === limit;
        
        if (hasMore) {
          page++;
          // Small delay between pages
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      const nfts = allNFTs;
      console.log(`[verification] Total ${nfts.length} NFTs found for wallet ${walletAddress}`);

      // Check against contract rules (both quantity and trait-based)
      const contractSummaries = contractRules.map((rule) => {
        // Filter NFTs from this collection
        const collectionNfts = nfts.filter(nft => {
          const matches = nft.grouping?.some(group => 
            group.group_value?.toLowerCase() === rule.contractAddress?.toLowerCase()
          );
          
          if (!matches && nfts.indexOf(nft) === 0) {
            console.log(`[verification] First NFT grouping:`, JSON.stringify(nft.grouping?.slice(0, 2), null, 2));
            console.log(`[verification] Looking for contract: ${rule.contractAddress}`);
          }
          
          return matches;
        });

        console.log(`[verification] Processing rule for contract ${rule.contractAddress}: found ${collectionNfts.length} NFTs from collection`);
        
        const ruleType = rule.ruleType || rule.rule_type || 'quantity';

        if (ruleType === 'trait') {
          // Trait-based rule: check if user owns ANY NFT with the specified trait
          const traitType = rule.traitType || rule.trait_type;
          const traitValue = rule.traitValue || rule.trait_value;

          const matchingNfts = collectionNfts.filter(nft => {
            const attributes = nft.content?.metadata?.attributes || [];
            const matches = attributes.some(attr => {
              // Handle both formats: { trait_type, value } and { [traitType]: traitValue }
              const attrKey = attr.trait_type || Object.keys(attr).find(k => k.toLowerCase() === traitType.toLowerCase());
              const attrValue = attr.value || attr[traitType];
              
              return (
                (attr.trait_type === traitType && attr.value === traitValue) ||
                (attrKey?.toLowerCase() === traitType.toLowerCase() && attrValue === traitValue)
              );
            });
            
            if (matches) {
              console.log(`[verification] NFT ${nft.id} matches trait ${traitType}=${traitValue}`);
            }
            
            return matches;
          });

          const ownedCount = matchingNfts.length;
          console.log(`[verification] Trait rule ${traitType}=${traitValue}: found ${ownedCount} matching NFTs from ${collectionNfts.length} total`);

          return {
            contractAddress: rule.contractAddress,
            ruleType: 'trait',
            traitType,
            traitValue,
            requiredNftCount: 1, // For traits, just need 1
            roleId: rule.roleId,
            roleName: rule.roleName,
            ownedCount,
            meetsRequirement: ownedCount > 0,
          };
        } else {
          // Quantity-based rule: support ranges with optional max
          const ownedCount = collectionNfts.length;
          const minRequired = rule.requiredNftCount || 1;
          const maxAllowed = (rule.maxNftCount ?? rule.max_nft_count ?? null);

          return {
            contractAddress: rule.contractAddress,
            ruleType: 'quantity',
            requiredNftCount: minRequired,
            roleId: rule.roleId,
            roleName: rule.roleName,
            ownedCount,
            meetsRequirement: ownedCount >= minRequired && (maxAllowed == null ? true : ownedCount <= maxAllowed),
          };
        }
      });

      const meetsAnyRule = contractSummaries.length > 0 
        ? contractSummaries.some(summary => summary.meetsRequirement)
        : false;

      const totalNftCount = nfts.length;

      // Prepare full NFT data with attributes for special role processing
      const preparedNfts = nfts.map(nft => {
        const attributes = nft.content?.metadata?.attributes || [];
        
        // Log first NFT's attributes for debugging
        if (nfts.indexOf(nft) === 0 && attributes.length > 0) {
          console.log(`[verification] Sample NFT attributes:`, JSON.stringify(attributes.slice(0, 3), null, 2));
        }
        
        return {
          id: nft.id,
          mint: nft.id,
          name: nft.content?.metadata?.name || 'Unknown NFT',
          image: nft.content?.links?.image || null,
          content: {
            metadata: {
              name: nft.content?.metadata?.name || 'Unknown NFT',
              attributes: attributes
            }
          }
        };
      });

      return {
        isVerified: meetsAnyRule,
        nftCount: totalNftCount,
        nfts: preparedNfts,
        contracts: contractSummaries,
      };
    } catch (error) {
      console.error('[verification] NFT verification error:', error);
      return { isVerified: false, nftCount: 0, nfts: [], contracts: [] };
    }
  }

  async updateUserVerification(session, verificationResult, username, lastVerifiedAt) {
    // Upsert user verification status
    const walletAddress = verificationResult.walletAddress || session.wallet_address || null;
    const isVerified = verificationResult.isVerified || false;
    const usernameValue = username || session.username || null;
    
    await sql`
      INSERT INTO users (discord_id, guild_id, username, wallet_address, is_verified, last_verification_check, updated_at)
      VALUES (
        ${session.discord_id}, ${session.guild_id}, ${usernameValue}, 
        ${walletAddress}, ${isVerified}, 
        ${lastVerifiedAt}, ${lastVerifiedAt}
      )
      ON CONFLICT (discord_id, guild_id) 
      DO UPDATE SET 
        username = EXCLUDED.username,
        wallet_address = EXCLUDED.wallet_address,
        is_verified = EXCLUDED.is_verified,
        last_verification_check = EXCLUDED.last_verification_check,
        updated_at = EXCLUDED.updated_at
    `;
  }
}

export const verificationSessionService = new VerificationSessionService();
export { VerificationSessionError };
