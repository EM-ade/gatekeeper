
import fetch from 'node-fetch';
import { COLLECTIONS } from '../config/collections.js';
import RATE_LIMITING_CONFIG from '../config/rateLimiting.js';

// Environment Variables
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const MAGIC_EDEN_API_KEY = process.env.MAGIC_EDEN_API_KEY; // Reserved for future authenticated calls

// Derive collection identifiers from config to keep single source of truth
const CONFIG_COLLECTION_ADDRESSES = Object.values(COLLECTIONS || {})
    .map(c => c.address)
    .filter(Boolean);

const CONFIG_COLLECTION_SYMBOLS = Object.values(COLLECTIONS || {})
    .flatMap(c => c.symbols || [])
    .filter(Boolean);

const REALMKIN_COLLECTION_ADDRESS_SET = new Set(CONFIG_COLLECTION_ADDRESSES);
const REALMKIN_COLLECTION_SYMBOLS_SET = new Set(
    CONFIG_COLLECTION_SYMBOLS.map(symbol => String(symbol).toUpperCase())
);

/**
 * Fetches assets for a given wallet address using the Helius DAS API.
 * Filters for Realmkin NFTs based on collection address.
 * @param {string} walletAddress The Solana wallet address.
 * @returns {Promise<Array<{label: string, value: string}>>} A promise that resolves to an array of formatted NFT objects.
 */
export const getRealmkinNftsFromHelius = async (walletAddress, allowedAddresses = REALMKIN_COLLECTION_ADDRESS_SET) => {
    if (!HELIUS_API_KEY) {
        console.warn('HELIUS_API_KEY is not set. Skipping Helius API call.');
        return [];
    }

    try {
        console.log(`Helius: Attempting to fetch for wallet: ${walletAddress}`);
        if (!allowedAddresses || allowedAddresses.size === 0) {
            console.warn('Helius: No Realmkin collection addresses configured.');
        } else {
            console.log(`Helius: Using collection addresses: ${Array.from(allowedAddresses).join(', ')}`);
        }
        
        let allAssets = [];
        let page = 1;
        let hasMore = true;
        const limit = 1000;

        // Fetch all pages
        while (hasMore) {
            const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'realmkin-nft-check',
                    method: 'getAssetsByOwner',
                    params: {
                        ownerAddress: walletAddress,
                        page: page,
                        limit: limit,
                        options: {
                            showUnverifiedCollections: false,
                            showCollectionMetadata: false,
                            showGrandTotal: false,
                            showFungible: false,
                            showNativeBalance: false,
                            showInscription: false,
                            showZeroBalance: false
                        }
                    },
                }),
            });
            
            if (!response.ok) {
                // Handle 404 as "no NFTs found" rather than an error
                if (response.status === 404) {
                    console.log(`Helius: Wallet ${walletAddress} not found or no assets.`);
                    break;
                }
                throw new Error(`Helius API error: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Check for JSON-RPC errors
            if (data.error) {
                console.error('Helius JSON-RPC error:', data.error);
                break;
            }
            
            const items = data.result?.items || [];
            allAssets = allAssets.concat(items);
            
            console.log(`Helius: Fetched page ${page}: ${items.length} items (total: ${allAssets.length})`);
            
            // Check if there are more pages
            hasMore = items.length === limit;
            
            if (hasMore) {
                page++;
                // Small delay between pages to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        
        // Filter for Realmkin NFTs based on collection grouping
        const realmkinNfts = allAssets.filter(asset => 
            Array.isArray(asset.grouping) && 
            asset.grouping.some(group => 
                group.group_key === 'collection' && 
                allowedAddresses.has(group.group_value)
            )
        );

        console.log(`Helius: Found ${allAssets.length} total assets, ${realmkinNfts.length} Realmkin NFTs`);
        
        return realmkinNfts.map(asset => ({
            label: asset?.content?.metadata?.name || asset?.id,
            value: asset?.id, // Using asset ID as value
        }));
    } catch (error) {
        console.error('Error fetching NFTs from Helius:', error);
        return [];
    }
};


/**
 * Fetches all NFTs for a given wallet address from the Magic Eden API.
 * @param {string} walletAddress The Solana wallet address.
 * @returns {Promise<Array>} A promise that resolves to an array of raw Magic Eden NFT objects.
 */
const getAllNftsFromMagicEden = async (walletAddress) => {
    const url = `https://api-mainnet.magiceden.dev/v2/wallets/${walletAddress}/tokens`;
    const options = {
        method: 'GET',
        headers: { accept: 'application/json' }
    };

    try {
        console.log(`Magic Eden: Attempting to fetch for wallet: ${walletAddress}`);
        const response = await fetch(url, options);
        if (!response.ok) {
            if (response.status === 404) {
                console.log(`Magic Eden: Wallet ${walletAddress} not found or no tokens.`);
                return []; // Wallet might have no tokens, Magic Eden returns 404
            }
            throw new Error(`Magic Eden API error: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching NFTs from Magic Eden:', error);
        return [];
    }
};

const getMagicEdenCollectionSymbol = (nft) => {
    const candidates = [
        nft.collectionSymbol,
        nft.collection,
        nft.collection?.symbol,
        nft.symbol
    ];
    for (const c of candidates) {
        if (typeof c === 'string' && c.trim().length > 0) return c.trim().toUpperCase();
    }
    return undefined;
};

const mapMagicEdenNfts = (nfts) =>
    nfts
        .filter(nft => {
            const sym = getMagicEdenCollectionSymbol(nft);
            return sym && REALMKIN_COLLECTION_SYMBOLS_SET.has(sym);
        })
        .map(asset => ({
            label: asset.name || asset.mintAddress || asset.tokenMint,
            value: asset.mintAddress || asset.tokenMint || asset.id,
        }));

const dedupeNfts = (entries, sourceKey) => {
    const map = new Map();
    for (const entry of entries) {
        const key = String(entry.value || '').toLowerCase();
        if (!key) continue;
        const existing = map.get(key);
        if (existing) {
            if (!existing.sources.includes(sourceKey)) {
                existing.sources.push(sourceKey);
            }
            if (!existing.label && entry.label) {
                existing.label = entry.label;
            }
        } else {
            map.set(key, { ...entry, sources: [sourceKey] });
        }
    }
    return map;
};

const mergeSourceResults = (sourceEntries) => {
    const combinedMap = new Map();
    for (const { source, entries } of sourceEntries) {
        if (!entries || entries.length === 0) continue;
        const deduped = dedupeNfts(entries, source);
        for (const [key, value] of deduped.entries()) {
            if (combinedMap.has(key)) {
                const existing = combinedMap.get(key);
                const mergedSources = new Set([...existing.sources, ...value.sources]);
                combinedMap.set(key, {
                    label: existing.label || value.label,
                    value: existing.value || value.value,
                    sources: Array.from(mergedSources)
                });
            } else {
                combinedMap.set(key, value);
            }
        }
    }
    return Array.from(combinedMap.values());
};

export const scanRealmkinNfts = async (walletAddress) => {
    const result = {
        combined: [],
        sources: {
            magicEden: { nfts: [], error: null },
            helius: { nfts: [], error: null },
        }
    };

    const tasks = [];

    tasks.push(
        getAllNftsFromMagicEden(walletAddress)
            .then(raw => {
                const mapped = mapMagicEdenNfts(raw);
                result.sources.magicEden.nfts = mapped;
                return { source: 'magic_eden', entries: mapped };
            })
            .catch(err => {
                console.error('Magic Eden fetch failed:', err);
                result.sources.magicEden.error = err instanceof Error ? err.message : String(err);
                return { source: 'magic_eden', entries: [] };
            })
    );

    if (HELIUS_API_KEY) {
        tasks.push(
            getRealmkinNftsFromHelius(walletAddress)
                .then(entries => {
                    result.sources.helius.nfts = entries;
                    return { source: 'helius', entries };
                })
                .catch(err => {
                    console.error('Helius fetch failed:', err);
                    result.sources.helius.error = err instanceof Error ? err.message : String(err);
                    return { source: 'helius', entries: [] };
                })
        );
    } else {
        result.sources.helius.error = 'HELIUS_API_KEY not configured';
    }

    const sourceEntries = await Promise.all(tasks);
    result.combined = mergeSourceResults(sourceEntries);

    return result;
};

/**
 * Backwards compatible helper returning combined Realmkin NFTs across sources.
 * @param {string} walletAddress The Solana wallet address.
 * @returns {Promise<Array<{label: string, value: string}>>}
 */
export const getRealmkinNftsByOwner = async (walletAddress) => {
    const { combined } = await scanRealmkinNfts(walletAddress);
    return combined.map(({ label, value }) => ({ label, value }));
};

// Rate limiting and batching for Magic Eden API
class MagicEdenRateLimiter {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.maxRequestsPerSecond = RATE_LIMITING_CONFIG.magicEden.maxRequestsPerSecond;
        this.batchSize = RATE_LIMITING_CONFIG.magicEden.batchSize;
        this.cache = new Map();
        this.cacheTTL = RATE_LIMITING_CONFIG.magicEden.cacheTTL;
        this.retryDelay = RATE_LIMITING_CONFIG.magicEden.retryDelay;
    }

    async getNftMetadata(mintAddress) {
        // Check cache first
        const cached = this.cache.get(mintAddress);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return cached.data;
        }

        // Add to queue and wait for processing
        return new Promise((resolve, reject) => {
            this.queue.push({ mintAddress, resolve, reject });
            if (!this.processing) {
                this.processQueue();
            }
        });
    }

    async processQueue() {
        if (this.processing) return;
        this.processing = true;

        while (this.queue.length > 0) {
            const batch = this.queue.splice(0, this.batchSize);
            
            try {
                // Process batch concurrently with rate limiting
                const results = await Promise.all(
                    batch.map(item => this.fetchSingleNftMetadata(item.mintAddress))
                );

                // Resolve all promises in the batch
                batch.forEach((item, index) => {
                    if (results[index]) {
                        // Cache the result
                        this.cache.set(item.mintAddress, {
                            data: results[index],
                            timestamp: Date.now()
                        });
                        item.resolve(results[index]);
                    } else {
                        item.reject(new Error(`Failed to fetch metadata for ${item.mintAddress}`));
                    }
                });

                // Rate limiting delay
                await new Promise(resolve => setTimeout(resolve, 1000 / this.maxRequestsPerSecond));
            } catch (error) {
                // If batch fails, reject all items
                batch.forEach(item => item.reject(error));
            }
        }

        this.processing = false;
    }

    async fetchSingleNftMetadata(mintAddress) {
        const url = `https://api-mainnet.magiceden.dev/v2/tokens/${mintAddress}`;
        const options = {
            method: 'GET',
            headers: { accept: 'application/json' }
        };

        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                if (response.status === 429) {
                    // Rate limited - wait longer
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                    return this.fetchSingleNftMetadata(mintAddress); // Retry
                }
                throw new Error(`Magic Eden API error: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Error fetching metadata for ${mintAddress} from Magic Eden:`, error);
            return null;
        }
    }
}

// Create a singleton instance
const magicEdenRateLimiter = new MagicEdenRateLimiter();

/**
 * Fetches NFT metadata from Magic Eden including attributes
 * @param {string} mintAddress - The NFT mint address
 * @returns {Promise<Object>} NFT metadata with attributes
 */
export const getNftMetadataFromMagicEden = async (mintAddress) => {
    return await magicEdenRateLimiter.getNftMetadata(mintAddress);
};

/**
 * Extracts class attribute from NFT metadata
 * @param {Object} metadata - NFT metadata object
 * @param {string} classAttributeName - Name of the class attribute (default: 'Class')
 * @returns {string|null} Class value or null if not found
 */
export const extractClassFromMetadata = (metadata, classAttributeName = 'Class') => {
    if (!metadata || !metadata.attributes || !Array.isArray(metadata.attributes)) {
        return null;
    }
    
    const classAttr = metadata.attributes.find(
        attr => attr.trait_type === classAttributeName
    );
    
    return classAttr ? classAttr.value : null;
};

/**
 * Fetches NFTs from a specific collection for a wallet using Magic Eden API with collection symbol
 * @param {string} walletAddress The Solana wallet address.
 * @param {string} collectionSymbol The collection symbol to filter by.
 * @returns {Promise<Array>} Array of NFTs from the specified collection with attributes.
 */
export const getNftsFromCollectionByWallet = async (walletAddress, collectionSymbol) => {
    const url = `https://api-mainnet.magiceden.dev/v2/wallets/${walletAddress}/tokens?collectionSymbol=${encodeURIComponent(collectionSymbol)}`;
    const options = {
        method: 'GET',
        headers: { accept: 'application/json' }
    };

    try {
        console.log(`Magic Eden: Fetching ${collectionSymbol} NFTs for wallet: ${walletAddress}`);
        const response = await fetch(url, options);
        if (!response.ok) {
            if (response.status === 404) {
                console.log(`Magic Eden: No NFTs found for collection ${collectionSymbol}`);
                return [];
            }
            throw new Error(`Magic Eden API error: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error fetching ${collectionSymbol} NFTs from Magic Eden:`, error);
        return [];
    }
};

/**
 * Checks if a wallet owns an NFT from a specific collection with optional class filter
 * Uses Magic Eden API with collection symbol filtering, falls back to Helius if needed
 * @param {string} walletAddress - Solana wallet address
 * @param {Object} collectionConfig - Collection configuration object
 * @param {string} requiredClass - Optional class to filter by
 * @returns {Promise<Object>} Result object with ownership status and matching NFTs
 */
export const checkNftOwnershipWithClass = async (walletAddress, collectionConfig, requiredClass = null) => {
    const result = {
        hasNft: false,
        nfts: [],
        matchingNfts: [],
        error: null,
        source: null,
    };

    try {
        console.log(`Checking collection ${collectionConfig.name} for wallet ${walletAddress}`);
        
        // Fetch from both sources and merge results
        const magicEdenNfts = [];
        const heliusNfts = [];
        const seenMints = new Set(); // Track unique mints to avoid duplicates
        
        // Try Magic Eden
        for (const symbol of collectionConfig.symbols) {
            console.log(`Magic Eden: Fetching ${symbol} NFTs for wallet: ${walletAddress}`);
            const fetchedNfts = await getNftsFromCollectionByWallet(walletAddress, symbol);
            
            if (fetchedNfts && fetchedNfts.length > 0) {
                // Verify these are actually from the correct collection by checking collection address
                const collectionNfts = fetchedNfts.filter(nft => {
                    // Check if NFT's collection matches our configured address
                    const nftCollectionAddress = nft.collectionAddress || nft.collection?.address;
                    return nftCollectionAddress?.toLowerCase() === collectionConfig.address?.toLowerCase();
                });
                
                if (collectionNfts.length > 0) {
                    magicEdenNfts.push(...collectionNfts);
                    collectionNfts.forEach(nft => {
                        seenMints.add((nft.mintAddress || nft.tokenMint || nft.id)?.toLowerCase());
                    });
                    break; // Found NFTs from this symbol, use them
                }
            }
        }
        
        // Try Helius as well (to catch NFTs not on Magic Eden)
        console.log(`Helius: Fetching NFTs for wallet: ${walletAddress}`);
        const addrSet = new Set([collectionConfig.address].filter(Boolean));
        const heliusRawNfts = await getRealmkinNftsFromHelius(walletAddress, addrSet);
        
        if (heliusRawNfts && heliusRawNfts.length > 0) {
            // Convert Helius format to our format and filter out duplicates
            const heliusConverted = await Promise.all(heliusRawNfts.map(async (nft) => {
                const mintLower = nft.value?.toLowerCase();
                
                // Skip if already found on Magic Eden
                if (seenMints.has(mintLower)) {
                    console.log(`Helius: Skipping ${nft.label} (already found on Magic Eden)`);
                    return null;
                }
                
                const metadata = await getNftMetadataFromMagicEden(nft.value);
                const classAttr = extractClassFromMetadata(metadata, collectionConfig.classAttributeName);
                return {
                    mintAddress: nft.value,
                    name: nft.label,
                    class: classAttr,
                    source: 'helius',
                };
            }));
            
            // Filter out nulls and add to helius array
            heliusNfts.push(...heliusConverted.filter(nft => nft !== null));
            
            if (heliusNfts.length > 0) {
                console.log(`Helius: Found ${heliusNfts.length} additional NFTs not on Magic Eden`);
            }
        }
        
        // Combine results from both sources
        let nfts = [];
        if (magicEdenNfts.length > 0) {
            // Convert Magic Eden format to our format
            nfts = magicEdenNfts.map(nft => {
                const classAttr = nft.attributes?.find(a => a.trait_type === collectionConfig.classAttributeName);
                return {
                    mintAddress: nft.mintAddress || nft.tokenMint,
                    name: nft.name,
                    class: classAttr?.value || null,
                    source: 'magic_eden',
                };
            });
            result.source = 'magic_eden';
        }
        
        // Add Helius NFTs
        if (heliusNfts.length > 0) {
            nfts.push(...heliusNfts);
            result.source = magicEdenNfts.length > 0 ? 'magic_eden+helius' : 'helius';
        }
        
        if (!nfts || nfts.length === 0) {
            return result;
        }

        result.hasNft = true;
        result.nfts = nfts;

        // If class filtering is not required, return all NFTs
        if (!requiredClass || !collectionConfig.supportsClassFilter) {
            result.matchingNfts = result.nfts;
            return result;
        }

        // Filter by required class
        result.matchingNfts = result.nfts.filter(nft => nft.class === requiredClass);

        return result;
    } catch (error) {
        console.error('Error checking NFT ownership with class:', error);
        result.error = error instanceof Error ? error.message : String(error);
        return result;
    }
};

 
