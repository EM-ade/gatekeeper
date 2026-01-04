/**
 * ONE-TIME TOKEN DISTRIBUTION SCRIPT
 * 
 * This script executes ONCE at 6:00 AM Nigeria time (5:00 UTC) to distribute
 * 10,000 MKIN tokens to all users who currently hold at least one MKIN NFT.
 * 
 * Features:
 * - Scheduled execution using node-cron for exactly 6:00 AM tomorrow
 * - NFT ownership verification via Helius API
 * - Atomic transactions to prevent partial allocations
 * - Duplicate distribution prevention
 * - Comprehensive audit trail
 * - Dry-run mode for testing
 * - Error handling and retry logic
 * - Detailed logging
 * 
 * Usage:
 * - Dry Run:  node scripts/one-time-token-distribution.js --dry-run
 * - Production: node scripts/one-time-token-distribution.js
 * 
 * Environment Variables Required:
 * - HELIUS_API_KEY: Helius API key for NFT verification
 * - FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY: Firebase credentials
 */

import 'dotenv/config';
import cron from 'node-cron';
import admin from 'firebase-admin';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Distribution settings
  DISTRIBUTION_AMOUNT: 35000,
  DISTRIBUTION_ID: 'one_time_mkin_distribution_2025_01_05_6am',
  
  // Batch processing
  BATCH_SIZE: 50, // Process users in batches to avoid memory issues
  
  // Retry settings
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 2000,
  
  // Helius API settings
  HELIUS_TIMEOUT_MS: 30000,
  HELIUS_PAGE_LIMIT: 1000,
  HELIUS_RATE_LIMIT_DELAY_MS: 200,
  
  // Scheduling (6:00 AM Nigeria time = 5:00 UTC)
  CRON_SCHEDULE: '0 5 * * *', // At 5:00 UTC every day
  TIMEZONE: 'UTC',
  
  // Logging
  LOG_DIR: path.join(__dirname, '../logs'),
  LOG_FILE: `distribution_${new Date().toISOString().split('T')[0]}.log`,
};

// ============================================================================
// FIREBASE INITIALIZATION
// ============================================================================

let db;

function initializeFirebase() {
  try {
    if (!admin.apps.length) {
      // Try multiple initialization methods
      if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        // Method 1: Use environment variables
        const serviceAccount = {
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        };

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        
        console.log('✅ Firebase initialized with environment variables');
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        // Method 2: Use GOOGLE_APPLICATION_CREDENTIALS file path
        const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        const serviceAccount = JSON.parse(fs.readFileSync(credPath, 'utf8'));
        
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        
        console.log('✅ Firebase initialized with GOOGLE_APPLICATION_CREDENTIALS');
      } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        // Method 3: Use inline JSON
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        
        console.log('✅ Firebase initialized with FIREBASE_SERVICE_ACCOUNT_JSON');
      } else {
        throw new Error('No Firebase credentials found. Set FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY, GOOGLE_APPLICATION_CREDENTIALS, or FIREBASE_SERVICE_ACCOUNT_JSON');
      }
    }
    
    db = admin.firestore();
    return true;
  } catch (error) {
    console.error('❌ Firebase initialization failed:', error);
    return false;
  }
}

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

class Logger {
  constructor() {
    this.logs = [];
    this.startTime = new Date();
    
    // Ensure log directory exists
    if (!fs.existsSync(CONFIG.LOG_DIR)) {
      fs.mkdirSync(CONFIG.LOG_DIR, { recursive: true });
    }
  }

  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data,
    };
    
    this.logs.push(logEntry);
    
    // Console output
    const icon = {
      INFO: 'ℹ️',
      SUCCESS: '✅',
      WARNING: '⚠️',
      ERROR: '❌',
      DEBUG: '🔍',
    }[level] || '📝';
    
    console.log(`[${timestamp}] ${icon} ${message}`);
    if (data) {
      console.log('   Data:', JSON.stringify(data, null, 2));
    }
  }

  info(message, data) { this.log('INFO', message, data); }
  success(message, data) { this.log('SUCCESS', message, data); }
  warning(message, data) { this.log('WARNING', message, data); }
  error(message, data) { this.log('ERROR', message, data); }
  debug(message, data) { this.log('DEBUG', message, data); }

  async saveToFile() {
    const logPath = path.join(CONFIG.LOG_DIR, CONFIG.LOG_FILE);
    const summary = this.generateSummary();
    
    const content = [
      '='.repeat(80),
      'ONE-TIME TOKEN DISTRIBUTION LOG',
      '='.repeat(80),
      '',
      ...summary.split('\n'),
      '',
      '='.repeat(80),
      'DETAILED LOGS',
      '='.repeat(80),
      '',
      ...this.logs.map(log => JSON.stringify(log, null, 2)),
    ].join('\n');
    
    fs.writeFileSync(logPath, content, 'utf-8');
    console.log(`📄 Log saved to: ${logPath}`);
  }

  generateSummary() {
    const duration = (new Date() - this.startTime) / 1000;
    const errorCount = this.logs.filter(l => l.level === 'ERROR').length;
    const warningCount = this.logs.filter(l => l.level === 'WARNING').length;
    
    return `
Start Time: ${this.startTime.toISOString()}
End Time: ${new Date().toISOString()}
Duration: ${duration.toFixed(2)} seconds
Total Logs: ${this.logs.length}
Errors: ${errorCount}
Warnings: ${warningCount}
`.trim();
  }
}

// ============================================================================
// NFT VERIFICATION SERVICE
// ============================================================================

class NFTVerifier {
  constructor(logger) {
    this.logger = logger;
    this.heliusApiKey = process.env.HELIUS_API_KEY;
    this.magicEdenApiKey = process.env.MAGIC_EDEN_API_KEY;
    this.rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${this.heliusApiKey}`;
    this.magicEdenBaseUrl = 'https://api-mainnet.magiceden.dev/v2';
    
    if (!this.heliusApiKey && !this.magicEdenApiKey) {
      throw new Error('Either HELIUS_API_KEY or MAGIC_EDEN_API_KEY environment variable is required');
    }
  }

  /**
   * Validate if a wallet address is a valid Solana address
   */
  isValidSolanaAddress(walletAddress) {
    // Solana addresses are 32-44 characters, base58 encoded
    const solanaRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return solanaRegex.test(walletAddress);
  }

  /**
   * Verify NFT ownership for a wallet address
   * Returns the count of MKIN NFTs owned
   */
  async verifyNFTOwnership(walletAddress, activeContracts) {
    this.logger.debug(`Verifying NFT ownership for wallet: ${walletAddress}`);
    
    if (!walletAddress || !activeContracts.length) {
      return 0;
    }

    // Validate wallet address format
    if (!this.isValidSolanaAddress(walletAddress)) {
      this.logger.warning(`Invalid Solana address format: ${walletAddress}`);
      return 0; // Skip invalid addresses instead of throwing
    }

    try {
      // Try Helius first, fallback to Magic Eden
      let allNFTs = [];
      
      if (this.heliusApiKey) {
        try {
          allNFTs = await this.fetchAllNFTsHelius(walletAddress);
        } catch (heliusError) {
          this.logger.warning(`Helius failed for ${walletAddress}, trying Magic Eden`, { error: heliusError.message });
          if (this.magicEdenApiKey) {
            allNFTs = await this.fetchAllNFTsMagicEden(walletAddress, activeContracts);
          } else {
            throw heliusError; // Re-throw if no fallback available
          }
        }
      } else if (this.magicEdenApiKey) {
        allNFTs = await this.fetchAllNFTsMagicEden(walletAddress, activeContracts);
      }
      
      const mkinNFTs = this.filterMKINNFTs(allNFTs, activeContracts);
      
      this.logger.debug(`Found ${mkinNFTs.length} MKIN NFTs for ${walletAddress}`);
      return mkinNFTs.length;
    } catch (error) {
      this.logger.error(`NFT verification failed for ${walletAddress}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Fetch all NFTs for a wallet with pagination (Helius)
   */
  async fetchAllNFTsHelius(walletAddress) {
    let allNFTs = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.retryWithBackoff(async () => {
        return await axios.post(
          this.rpcUrl,
          {
            jsonrpc: '2.0',
            id: `nft-fetch-page-${page}`,
            method: 'getAssetsByOwner',
            params: {
              ownerAddress: walletAddress,
              page: page,
              limit: CONFIG.HELIUS_PAGE_LIMIT,
              displayOptions: {
                showFungible: false,
                showNativeBalance: false,
                showInscription: false,
              },
            },
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: CONFIG.HELIUS_TIMEOUT_MS,
          }
        );
      });

      if (response.data.error) {
        throw new Error(`Helius API error: ${response.data.error.message}`);
      }

      const items = response.data.result?.items || [];
      allNFTs = allNFTs.concat(items);

      // Check if there are more pages
      hasMore = items.length === CONFIG.HELIUS_PAGE_LIMIT;
      
      if (hasMore) {
        page++;
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, CONFIG.HELIUS_RATE_LIMIT_DELAY_MS));
      }
    }

    return allNFTs;
  }

  /**
   * Fetch all NFTs for a wallet using Magic Eden API
   */
  async fetchAllNFTsMagicEden(walletAddress, activeContracts) {
    const allNFTs = [];

    // Magic Eden requires querying by collection symbol
    // Try common Realmkin collection symbols
    const symbols = ['the_realmkin_kins', 'Therealmkin', 'therealmkin'];

    for (const symbol of symbols) {
      try {
        const url = `${this.magicEdenBaseUrl}/wallets/${walletAddress}/tokens`;
        
        const response = await this.retryWithBackoff(async () => {
          return await axios.get(url, {
            params: {
              collection_symbol: symbol,
              offset: 0,
              limit: 500,
            },
            headers: {
              'Accept': 'application/json',
            },
            timeout: CONFIG.HELIUS_TIMEOUT_MS,
          });
        });

        if (response.data && Array.isArray(response.data)) {
          // Transform Magic Eden format to Helius-like format
          const transformed = response.data.map(item => ({
            id: item.mintAddress || item.mint,
            mint: item.mintAddress || item.mint,
            grouping: [{
              group_key: 'collection',
              group_value: item.collection || activeContracts[0], // Use first active contract as fallback
            }],
          }));
          
          allNFTs.push(...transformed);
        }

        // Small delay between symbol queries
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        this.logger.debug(`Magic Eden query failed for symbol ${symbol}`, { error: error.message });
        // Continue to next symbol
      }
    }

    return allNFTs;
  }

  /**
   * Filter NFTs by active contract addresses
   */
  filterMKINNFTs(nfts, activeContracts) {
    return nfts.filter(nft => {
      const collectionAddress = nft.grouping?.find(
        group => group.group_key === 'collection'
      )?.group_value?.toLowerCase();

      return collectionAddress && activeContracts.includes(collectionAddress);
    });
  }

  /**
   * Retry logic with exponential backoff
   */
  async retryWithBackoff(fn, attempt = 0) {
    try {
      return await fn();
    } catch (error) {
      const isRateLimitError = error.response?.status === 429;
      const shouldRetry = attempt < CONFIG.MAX_RETRIES && (isRateLimitError || error.code === 'ECONNRESET');

      if (!shouldRetry) {
        throw error;
      }

      const delay = CONFIG.RETRY_DELAY_MS * Math.pow(2, attempt);
      const jitter = Math.random() * 1000;
      const totalDelay = delay + jitter;

      this.logger.warning(
        `Retry attempt ${attempt + 1}/${CONFIG.MAX_RETRIES} after ${totalDelay.toFixed(0)}ms`,
        { error: error.message }
      );

      await new Promise(resolve => setTimeout(resolve, totalDelay));
      return this.retryWithBackoff(fn, attempt + 1);
    }
  }
}

// ============================================================================
// DISTRIBUTION SERVICE
// ============================================================================

class DistributionService {
  constructor(logger, nftVerifier) {
    this.logger = logger;
    this.nftVerifier = nftVerifier;
    this.stats = {
      totalUsers: 0,
      eligibleUsers: 0,
      successfulDistributions: 0,
      failedDistributions: 0,
      totalTokensDistributed: 0,
      skippedUsers: 0,
      retriedUsers: 0,
      errors: [],
    };
    this.failedUsers = []; // Queue for users that failed verification
    this.skippedUsers = []; // Queue for users with invalid addresses
  }

  /**
   * Main distribution execution
   */
  async execute(isDryRun = true) {
    this.logger.info('🚀 Starting one-time token distribution', {
      distributionId: CONFIG.DISTRIBUTION_ID,
      amount: CONFIG.DISTRIBUTION_AMOUNT,
      dryRun: isDryRun,
    });

    try {
      // Step 1: Check if already executed
      if (!isDryRun) {
        const alreadyExecuted = await this.checkIfAlreadyExecuted();
        if (alreadyExecuted) {
          this.logger.warning('Distribution already executed, aborting');
          return this.stats;
        }
      }

      // Step 2: Load active contracts
      const activeContracts = await this.loadActiveContracts();
      this.logger.info(`Found ${activeContracts.length} active contracts`, { activeContracts });

      // Step 3: Load all users with wallets
      const users = await this.loadUsersWithWallets();
      this.stats.totalUsers = users.length;
      this.logger.info(`Found ${users.length} users with wallet addresses`);

      // Step 4: Process users in batches
      await this.processUserBatches(users, activeContracts, isDryRun);

      // Step 5: Log summary
      this.logSummary();

      return this.stats;
    } catch (error) {
      this.logger.error('Fatal error in distribution', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  /**
   * Check if distribution has already been executed
   */
  async checkIfAlreadyExecuted() {
    const snapshot = await db
      .collection('oneTimeDistribution')
      .where('distributionId', '==', CONFIG.DISTRIBUTION_ID)
      .where('status', '==', 'completed')
      .limit(1)
      .get();

    return !snapshot.empty;
  }

  /**
   * Load active contract configurations
   */
  async loadActiveContracts() {
    const snapshot = await db
      .collection('contractBonusConfigs')
      .where('is_active', '==', true)
      .get();

    const contracts = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      const contractAddress = doc.id || data.contract_address;
      if (contractAddress) {
        contracts.push(contractAddress.toLowerCase());
      }
    });

    if (contracts.length === 0) {
      throw new Error('No active contract configurations found');
    }

    return contracts;
  }

  /**
   * Load all users with wallet addresses
   */
  async loadUsersWithWallets() {
    const snapshot = await db
      .collection('userRewards')
      .where('walletAddress', '!=', null)
      .get();

    const users = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.walletAddress && data.walletAddress.trim() !== '') {
        users.push({
          userId: doc.id,
          walletAddress: data.walletAddress,
          totalNFTs: data.totalNFTs || 0,
          totalRealmkin: data.totalRealmkin || 0,
        });
      }
    });

    return users;
  }

  /**
   * Process users in batches
   */
  async processUserBatches(users, activeContracts, isDryRun) {
    const totalBatches = Math.ceil(users.length / CONFIG.BATCH_SIZE);

    // First pass - process all users
    for (let i = 0; i < users.length; i += CONFIG.BATCH_SIZE) {
      const batch = users.slice(i, i + CONFIG.BATCH_SIZE);
      const batchNumber = Math.floor(i / CONFIG.BATCH_SIZE) + 1;

      this.logger.info(`Processing batch ${batchNumber}/${totalBatches}`, {
        batchSize: batch.length,
        progress: `${Math.round((i / users.length) * 100)}%`,
      });

      await this.processBatch(batch, activeContracts, isDryRun);

      // Longer delay between batches to avoid rate limiting
      if (i + CONFIG.BATCH_SIZE < users.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Retry failed users if any
    if (this.failedUsers.length > 0) {
      this.logger.info(`Retrying ${this.failedUsers.length} failed users...`);
      await this.retryFailedUsers(activeContracts, isDryRun);
    }

    // Log summary of skipped users
    if (this.skippedUsers.length > 0) {
      this.logger.warning(`Skipped ${this.skippedUsers.length} users with invalid wallet addresses`, {
        sampleUsers: this.skippedUsers.slice(0, 5),
      });
    }
  }

  /**
   * Retry failed users with exponential backoff
   */
  async retryFailedUsers(activeContracts, isDryRun) {
    const maxRetries = 2;
    let retryAttempt = 1;

    while (this.failedUsers.length > 0 && retryAttempt <= maxRetries) {
      this.logger.info(`Retry attempt ${retryAttempt}/${maxRetries} for ${this.failedUsers.length} users`);
      
      const usersToRetry = [...this.failedUsers];
      this.failedUsers = []; // Clear the queue
      
      // Wait longer before retry
      const waitTime = 5000 * retryAttempt; // 5s, 10s
      this.logger.info(`Waiting ${waitTime / 1000}s before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));

      // Process in smaller batches for retries
      const retryBatchSize = Math.min(10, CONFIG.BATCH_SIZE / 5);
      for (let i = 0; i < usersToRetry.length; i += retryBatchSize) {
        const batch = usersToRetry.slice(i, i + retryBatchSize);
        await this.processBatch(batch, activeContracts, isDryRun, true);
        
        // Longer delay between retry batches
        if (i + retryBatchSize < usersToRetry.length) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      retryAttempt++;
    }

    if (this.failedUsers.length > 0) {
      this.logger.error(`${this.failedUsers.length} users still failed after ${maxRetries} retries`, {
        failedUsers: this.failedUsers.map(u => ({ userId: u.userId, wallet: u.walletAddress })),
      });
    }
  }

  /**
   * Process a single batch of users
   */
  async processBatch(users, activeContracts, isDryRun, isRetry = false) {
    const batchOperations = [];

    for (const user of users) {
      try {
        const result = await this.processUser(user, activeContracts, isDryRun);
        
        if (result.skipped) {
          // User has invalid wallet address - skip permanently
          this.skippedUsers.push(user);
          this.stats.skippedUsers++;
          continue;
        }
        
        if (result.eligible) {
          batchOperations.push({ user, nftCount: result.nftCount });
          if (isRetry) {
            this.stats.retriedUsers++;
            this.logger.success(`Retry successful for user ${user.userId}`);
          }
        }
      } catch (error) {
        const errorMsg = error.message || 'Unknown error';
        
        // Check if it's a rate limit or temporary error
        const isTemporaryError = errorMsg.includes('rate limit') || 
                                 errorMsg.includes('timeout') || 
                                 errorMsg.includes('ECONNRESET') ||
                                 errorMsg.includes('429');
        
        if (isTemporaryError && !isRetry) {
          // Add to retry queue
          this.failedUsers.push(user);
          this.logger.warning(`Temporary error for user ${user.userId}, will retry`, { error: errorMsg });
        } else {
          // Permanent failure
          this.logger.error(`Failed to process user ${user.userId}`, { error: errorMsg });
          this.stats.failedDistributions++;
          this.stats.errors.push(`User ${user.userId} (${user.walletAddress}): ${errorMsg}`);
        }
      }
    }

    // Execute batch write if not dry run
    if (!isDryRun && batchOperations.length > 0) {
      await this.executeBatchWrite(batchOperations);
    } else if (isDryRun) {
      batchOperations.forEach(op => {
        this.logger.info(`[DRY RUN] Would distribute ${CONFIG.DISTRIBUTION_AMOUNT} MKIN to user ${op.user.userId}`, {
          nftCount: op.nftCount,
          walletAddress: op.user.walletAddress,
        });
        this.stats.successfulDistributions++;
        this.stats.totalTokensDistributed += CONFIG.DISTRIBUTION_AMOUNT;
      });
    }

    this.stats.eligibleUsers += batchOperations.length;
  }

  /**
   * Process individual user
   */
  async processUser(user, activeContracts, isDryRun) {
    // Validate wallet address first
    if (!this.nftVerifier.isValidSolanaAddress(user.walletAddress)) {
      this.logger.debug(`Skipping user ${user.userId} - invalid wallet: ${user.walletAddress}`);
      return { eligible: false, skipped: true, reason: 'Invalid wallet address' };
    }

    // Check if already distributed (only in production)
    if (!isDryRun) {
      const alreadyReceived = await this.checkUserAlreadyReceived(user.userId);
      if (alreadyReceived) {
        this.logger.debug(`User ${user.userId} already received distribution`);
        return { eligible: false, reason: 'Already received' };
      }
    }

    // Verify NFT ownership
    const nftCount = await this.nftVerifier.verifyNFTOwnership(user.walletAddress, activeContracts);

    if (nftCount > 0) {
      return { eligible: true, nftCount };
    } else {
      return { eligible: false, reason: 'No MKIN NFTs found' };
    }
  }

  /**
   * Check if user already received distribution
   */
  async checkUserAlreadyReceived(userId) {
    const snapshot = await db
      .collection('oneTimeDistribution')
      .where('userId', '==', userId)
      .where('distributionId', '==', CONFIG.DISTRIBUTION_ID)
      .where('status', '==', 'completed')
      .get();

    return !snapshot.empty;
  }

  /**
   * Execute batch write to Firebase
   */
  async executeBatchWrite(operations) {
    const batch = db.batch();

    for (const { user, nftCount } of operations) {
      try {
        // Update user balance
        const userRef = db.collection('userRewards').doc(user.userId);
        batch.update(userRef, {
          totalRealmkin: admin.firestore.FieldValue.increment(CONFIG.DISTRIBUTION_AMOUNT),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Create transaction record
        const transactionRef = db.collection('transactionHistory').doc();
        batch.set(transactionRef, {
          userId: user.userId,
          walletAddress: user.walletAddress,
          type: 'distribution',
          amount: CONFIG.DISTRIBUTION_AMOUNT,
          description: `One-time MKIN distribution (${CONFIG.DISTRIBUTION_ID})`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Create distribution record
        const distributionRef = db.collection('oneTimeDistribution').doc();
        batch.set(distributionRef, {
          userId: user.userId,
          walletAddress: user.walletAddress,
          amount: CONFIG.DISTRIBUTION_AMOUNT,
          nftCount: nftCount,
          distributionId: CONFIG.DISTRIBUTION_ID,
          status: 'completed',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        this.stats.successfulDistributions++;
        this.stats.totalTokensDistributed += CONFIG.DISTRIBUTION_AMOUNT;

        this.logger.success(`Distributed ${CONFIG.DISTRIBUTION_AMOUNT} MKIN to user ${user.userId}`, {
          nftCount,
          walletAddress: user.walletAddress,
        });
      } catch (error) {
        this.logger.error(`Failed to prepare batch operation for user ${user.userId}`, { error: error.message });
        this.stats.failedDistributions++;
        this.stats.errors.push(`User ${user.userId}: ${error.message}`);
      }
    }

    // Commit the batch
    await batch.commit();
    this.logger.success(`Batch committed successfully: ${operations.length} distributions`);
  }

  /**
   * Log distribution summary
   */
  logSummary() {
    this.logger.info('📊 DISTRIBUTION SUMMARY', {
      totalUsers: this.stats.totalUsers,
      eligibleUsers: this.stats.eligibleUsers,
      successfulDistributions: this.stats.successfulDistributions,
      failedDistributions: this.stats.failedDistributions,
      skippedUsers: this.stats.skippedUsers,
      retriedUsers: this.stats.retriedUsers,
      totalTokensDistributed: this.stats.totalTokensDistributed,
      errorCount: this.stats.errors.length,
    });

    if (this.stats.errors.length > 0) {
      this.logger.warning('Errors encountered during distribution', {
        errorCount: this.stats.errors.length,
        sampleErrors: this.stats.errors.slice(0, 10),
      });
    }

    if (this.skippedUsers.length > 0) {
      this.logger.warning('Users with invalid wallet addresses (skipped)', {
        count: this.skippedUsers.length,
        sampleWallets: this.skippedUsers.slice(0, 5).map(u => ({
          userId: u.userId,
          wallet: u.walletAddress,
        })),
      });
    }
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

class OneTimeDistributionRunner {
  constructor() {
    this.logger = new Logger();
    this.hasExecuted = false;
    this.scheduledTask = null;
  }

  /**
   * Start the runner
   */
  async start() {
    this.logger.info('🎬 One-Time Token Distribution Script Started');
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    const isDryRun = args.includes('--dry-run');
    const isImmediate = args.includes('--immediate');

    if (isDryRun) {
      this.logger.warning('🔧 DRY RUN MODE ENABLED - No actual distributions will occur');
    }

    // Initialize Firebase
    const firebaseInitialized = initializeFirebase();
    if (!firebaseInitialized) {
      this.logger.error('Failed to initialize Firebase, exiting');
      process.exit(1);
    }

    // Validate environment
    if (!process.env.HELIUS_API_KEY && !process.env.MAGIC_EDEN_API_KEY) {
      this.logger.error('Either HELIUS_API_KEY or MAGIC_EDEN_API_KEY is required');
      process.exit(1);
    }

    // Execute immediately if flag is set (for testing)
    if (isImmediate) {
      this.logger.info('⚡ Immediate execution requested');
      await this.executeDistribution(isDryRun);
      await this.shutdown();
      return;
    }

    // Schedule for tomorrow at 6:00 AM Nigeria time (5:00 UTC)
    await this.scheduleExecution(isDryRun);
  }

  /**
   * Schedule the distribution
   */
  async scheduleExecution(isDryRun) {
    // Calculate next execution time
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setUTCHours(5, 0, 0, 0); // 5:00 UTC = 6:00 AM Nigeria time

    const timeUntilExecution = tomorrow - now;
    const hoursUntil = Math.floor(timeUntilExecution / (1000 * 60 * 60));
    const minutesUntil = Math.floor((timeUntilExecution % (1000 * 60 * 60)) / (1000 * 60));

    this.logger.info('⏰ Scheduled execution details', {
      scheduledFor: tomorrow.toISOString(),
      currentTime: now.toISOString(),
      timeUntil: `${hoursUntil}h ${minutesUntil}m`,
      timezone: 'UTC',
      nigeriaTime: '6:00 AM WAT',
    });

    // Create cron job
    this.scheduledTask = cron.schedule(
      CONFIG.CRON_SCHEDULE,
      async () => {
        if (!this.hasExecuted) {
          this.logger.info('⏰ Scheduled time reached, executing distribution...');
          await this.executeDistribution(isDryRun);
          await this.shutdown();
        }
      },
      {
        scheduled: true,
        timezone: CONFIG.TIMEZONE,
      }
    );

    this.logger.success('✅ Distribution scheduled successfully');
    this.logger.info('Script will remain running until execution completes...');
    this.logger.info('Press Ctrl+C to cancel');
  }

  /**
   * Execute the distribution
   */
  async executeDistribution(isDryRun) {
    if (this.hasExecuted) {
      this.logger.warning('Distribution already executed, skipping');
      return;
    }

    this.hasExecuted = true;

    try {
      const nftVerifier = new NFTVerifier(this.logger);
      const distributionService = new DistributionService(this.logger, nftVerifier);

      const stats = await distributionService.execute(isDryRun);

      this.logger.success('✅ Distribution execution completed', stats);
    } catch (error) {
      this.logger.error('❌ Distribution execution failed', {
        error: error.message,
        stack: error.stack,
      });
    } finally {
      await this.logger.saveToFile();
    }
  }

  /**
   * Shutdown gracefully
   */
  async shutdown() {
    this.logger.info('🛑 Shutting down...');
    
    if (this.scheduledTask) {
      this.scheduledTask.stop();
    }

    await this.logger.saveToFile();
    
    this.logger.success('✅ Shutdown complete');
    
    // Exit after a short delay
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  }
}

// ============================================================================
// START THE SCRIPT
// ============================================================================

const runner = new OneTimeDistributionRunner();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⚠️  Interrupt signal received');
  await runner.shutdown();
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️  Termination signal received');
  await runner.shutdown();
});

// Start the runner
runner.start().catch(async (error) => {
  console.error('❌ Fatal error:', error);
  await runner.shutdown();
  process.exit(1);
});
