// Rate limiting configuration for external APIs
export const RATE_LIMITING_CONFIG = {
    // Magic Eden API rate limiting
    magicEden: {
        maxRequestsPerSecond: 8, // Conservative limit (Magic Eden allows 10-20)
        batchSize: 5, // Number of requests to batch together
        retryDelay: 2000, // Wait 2 seconds on rate limit (429)
        cacheTTL: 5 * 60 * 1000, // Cache NFT metadata for 5 minutes
    },
    
    // Helius API rate limiting
    helius: {
        maxRequestsPerSecond: 20, // Helius allows higher rates
        delayBetweenPages: 200, // Small delay between pagination requests
    },
    
    // Verification service rate limiting
    verification: {
        batchSize: 5, // Users per batch
        delayBetweenBatches: 2000, // 2 seconds between batches
        delayBetweenUsers: 500, // 500ms between users in same batch
        maxUsersPerRun: 50, // Maximum users to process in one run
    },
    
    // Manual verification rate limiting
    manualVerification: {
        batchSize: 5, // Users per batch
        delayBetweenBatches: 2000, // 2 seconds between batches
    }
};

export default RATE_LIMITING_CONFIG;
