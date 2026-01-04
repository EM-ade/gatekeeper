/**
 * ONE-TIME TOKEN DISTRIBUTION - EXTERNAL CRON VERSION
 * 
 * This version is designed to be triggered by an EXTERNAL cron job (system cron, cloud scheduler, etc.)
 * It executes immediately when called, without internal scheduling.
 * 
 * The one-time execution is guaranteed by checking Firebase for existing distribution records.
 * Safe to call multiple times - will only execute once.
 * 
 * Usage:
 * - Dry Run:  node scripts/one-time-distribution-cron.js --dry-run
 * - Production: node scripts/one-time-distribution-cron.js
 * 
 * External Cron Setup Examples:
 * 
 * 1. Linux/Mac crontab (5:00 UTC = 6:00 AM Nigeria time):
 *    0 5 5 1 * cd /path/to/gatekeeper && node scripts/one-time-distribution-cron.js >> logs/cron.log 2>&1
 * 
 * 2. Google Cloud Scheduler:
 *    Schedule: 0 5 5 1 *
 *    Target: Cloud Run / Cloud Functions
 *    Command: node scripts/one-time-distribution-cron.js
 * 
 * 3. AWS EventBridge:
 *    cron(0 5 5 1 ? 2026)
 * 
 * 4. GitHub Actions:
 *    schedule:
 *      - cron: '0 5 5 1 *'
 */

import 'dotenv/config';
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
  DISTRIBUTION_AMOUNT: 10000,
  DISTRIBUTION_ID: 'one_time_mkin_distribution_2025_01_05_6am',
  
  // Batch processing
  BATCH_SIZE: 50,
  
  // Retry settings
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 2000,
  
  // Helius API settings
  HELIUS_TIMEOUT_MS: 30000,
  HELIUS_PAGE_LIMIT: 1000,
  HELIUS_RATE_LIMIT_DELAY_MS: 200,
  
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
      if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
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
        const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        const serviceAccount = JSON.parse(fs.readFileSync(credPath, 'utf8'));
        
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        
        console.log('✅ Firebase initialized with GOOGLE_APPLICATION_CREDENTIALS');
      } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
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
    
    if (!fs.existsSync(CONFIG.LOG_DIR)) {
      fs.mkdirSync(CONFIG.LOG_DIR, { recursive: true });
    }
  }

  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message, data };
    this.logs.push(logEntry);
    
    const icon = {
      INFO: 'ℹ️',
      SUCCESS: '✅',
      WARNING: '⚠️',
      ERROR: '❌',
      DEBUG: '🔍',
    }[level] || '📝';
    
    console.log(`[${timestamp}] ${icon} ${message}`);
    if (data) console.log('   Data:', JSON.stringify(data, null, 2));
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
      'ONE-TIME TOKEN DISTRIBUTION LOG (External Cron)',
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
// NFT VERIFICATION SERVICE (Same as original)
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

  isValidSolanaAddress(walletAddress) {
    const solanaRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return solanaRegex.test(walletAddress);
  }

  async verifyNFTOwnership(walletAddress, activeContracts) {
    this.logger.debug(`Verifying NFT ownership for wallet: ${walletAddress}`);
    
    if (!walletAddress || !activeContracts.length) return 0;
    if (!this.isValidSolanaAddress(walletAddress)) {
      this.logger.warning(`Invalid Solana address format: ${walletAddress}`);
      return 0;
    }

    try {
      let allNFTs = [];
      
      if (this.heliusApiKey) {
        try {
          allNFTs = await this.fetchAllNFTsHelius(walletAddress);
        } catch (heliusError) {
          this.logger.warning(`Helius failed for ${walletAddress}, trying Magic Eden`, { error: heliusError.message });
          if (this.magicEdenApiKey) {
            allNFTs = await this.fetchAllNFTsMagicEden(walletAddress, activeContracts);
          } else {
            throw heliusError;
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

  async fetchAllNFTsHelius(walletAddress) {
    let allNFTs = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.retryWithBackoff(async () => {
        return await axios.post(this.rpcUrl, {
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
        }, {
          headers: { 'Content-Type': 'application/json' },
          timeout: CONFIG.HELIUS_TIMEOUT_MS,
        });
      });

      if (response.data.error) {
        throw new Error(`Helius API error: ${response.data.error.message}`);
      }

      const items = response.data.result?.items || [];
      allNFTs = allNFTs.concat(items);
      hasMore = items.length === CONFIG.HELIUS_PAGE_LIMIT;
      
      if (hasMore) {
        page++;
        await new Promise(resolve => setTimeout(resolve, CONFIG.HELIUS_RATE_LIMIT_DELAY_MS));
      }
    }

    return allNFTs;
  }

  async fetchAllNFTsMagicEden(walletAddress, activeContracts) {
    const allNFTs = [];
    const symbols = ['the_realmkin_kins', 'Therealmkin', 'therealmkin'];

    for (const symbol of symbols) {
      try {
        const url = `${this.magicEdenBaseUrl}/wallets/${walletAddress}/tokens`;
        
        const response = await this.retryWithBackoff(async () => {
          return await axios.get(url, {
            params: { collection_symbol: symbol, offset: 0, limit: 500 },
            headers: { 'Accept': 'application/json' },
            timeout: CONFIG.HELIUS_TIMEOUT_MS,
          });
        });

        if (response.data && Array.isArray(response.data)) {
          const transformed = response.data.map(item => ({
            id: item.mintAddress || item.mint,
            mint: item.mintAddress || item.mint,
            grouping: [{
              group_key: 'collection',
              group_value: item.collection || activeContracts[0],
            }],
          }));
          
          allNFTs.push(...transformed);
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        this.logger.debug(`Magic Eden query failed for symbol ${symbol}`, { error: error.message });
      }
    }

    return allNFTs;
  }

  filterMKINNFTs(nfts, activeContracts) {
    return nfts.filter(nft => {
      const collectionAddress = nft.grouping?.find(
        group => group.group_key === 'collection'
      )?.group_value?.toLowerCase();

      return collectionAddress && activeContracts.includes(collectionAddress);
    });
  }

  async retryWithBackoff(fn, attempt = 0) {
    try {
      return await fn();
    } catch (error) {
      const isRateLimitError = error.response?.status === 429;
      const shouldRetry = attempt < CONFIG.MAX_RETRIES && (isRateLimitError || error.code === 'ECONNRESET');

      if (!shouldRetry) throw error;

      const delay = CONFIG.RETRY_DELAY_MS * Math.pow(2, attempt);
      const jitter = Math.random() * 1000;
      const totalDelay = delay + jitter;

      this.logger.warning(`Retry attempt ${attempt + 1}/${CONFIG.MAX_RETRIES} after ${totalDelay.toFixed(0)}ms`, { error: error.message });

      await new Promise(resolve => setTimeout(resolve, totalDelay));
      return this.retryWithBackoff(fn, attempt + 1);
    }
  }
}

// ============================================================================
// DISTRIBUTION SERVICE (Same logic as original, condensed for brevity)
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
      skippedUsers: 0,
      retriedUsers: 0,
      totalTokensDistributed: 0,
      errors: [],
    };
    this.failedUsers = [];
    this.skippedUsers = [];
  }

  async execute(isDryRun = false) {
    this.logger.info('🚀 Starting one-time token distribution (External Cron)', {
      distributionId: CONFIG.DISTRIBUTION_ID,
      amount: CONFIG.DISTRIBUTION_AMOUNT,
      dryRun: isDryRun,
      executionTime: new Date().toISOString(),
    });

    try {
      if (!isDryRun) {
        const alreadyExecuted = await this.checkIfAlreadyExecuted();
        if (alreadyExecuted) {
          this.logger.warning('⚠️  Distribution already executed, aborting to prevent duplicates');
          return this.stats;
        }
      }

      const activeContracts = await this.loadActiveContracts();
      this.logger.info(`Found ${activeContracts.length} active contracts`, { activeContracts });

      const users = await this.loadUsersWithWallets();
      this.stats.totalUsers = users.length;
      this.logger.info(`Found ${users.length} users with wallet addresses`);

      await this.processUserBatches(users, activeContracts, isDryRun);
      this.logSummary();

      return this.stats;
    } catch (error) {
      this.logger.error('Fatal error in distribution', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  async checkIfAlreadyExecuted() {
    const snapshot = await db
      .collection('oneTimeDistribution')
      .where('distributionId', '==', CONFIG.DISTRIBUTION_ID)
      .where('status', '==', 'completed')
      .limit(1)
      .get();

    return !snapshot.empty;
  }

  async loadActiveContracts() {
    const snapshot = await db.collection('contractBonusConfigs').where('is_active', '==', true).get();
    const contracts = [];
    snapshot.forEach(doc => {
      const contractAddress = doc.id || doc.data().contract_address;
      if (contractAddress) contracts.push(contractAddress.toLowerCase());
    });

    if (contracts.length === 0) throw new Error('No active contract configurations found');
    return contracts;
  }

  async loadUsersWithWallets() {
    const snapshot = await db.collection('userRewards').where('walletAddress', '!=', null).get();
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

  async processUserBatches(users, activeContracts, isDryRun) {
    const totalBatches = Math.ceil(users.length / CONFIG.BATCH_SIZE);

    for (let i = 0; i < users.length; i += CONFIG.BATCH_SIZE) {
      const batch = users.slice(i, i + CONFIG.BATCH_SIZE);
      const batchNumber = Math.floor(i / CONFIG.BATCH_SIZE) + 1;

      this.logger.info(`Processing batch ${batchNumber}/${totalBatches}`, {
        batchSize: batch.length,
        progress: `${Math.round((i / users.length) * 100)}%`,
      });

      await this.processBatch(batch, activeContracts, isDryRun);

      if (i + CONFIG.BATCH_SIZE < users.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    if (this.failedUsers.length > 0) {
      this.logger.info(`Retrying ${this.failedUsers.length} failed users...`);
      await this.retryFailedUsers(activeContracts, isDryRun);
    }

    if (this.skippedUsers.length > 0) {
      this.logger.warning(`Skipped ${this.skippedUsers.length} users with invalid wallet addresses`, {
        sampleUsers: this.skippedUsers.slice(0, 5),
      });
    }
  }

  async retryFailedUsers(activeContracts, isDryRun) {
    const maxRetries = 2;
    let retryAttempt = 1;

    while (this.failedUsers.length > 0 && retryAttempt <= maxRetries) {
      this.logger.info(`Retry attempt ${retryAttempt}/${maxRetries} for ${this.failedUsers.length} users`);
      
      const usersToRetry = [...this.failedUsers];
      this.failedUsers = [];
      
      const waitTime = 5000 * retryAttempt;
      this.logger.info(`Waiting ${waitTime / 1000}s before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));

      const retryBatchSize = Math.min(10, CONFIG.BATCH_SIZE / 5);
      for (let i = 0; i < usersToRetry.length; i += retryBatchSize) {
        const batch = usersToRetry.slice(i, i + retryBatchSize);
        await this.processBatch(batch, activeContracts, isDryRun, true);
        
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

  async processBatch(users, activeContracts, isDryRun, isRetry = false) {
    const batchOperations = [];

    for (const user of users) {
      try {
        const result = await this.processUser(user, activeContracts, isDryRun);
        
        if (result.skipped) {
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
        const isTemporaryError = errorMsg.includes('rate limit') || 
                                 errorMsg.includes('timeout') || 
                                 errorMsg.includes('ECONNRESET') ||
                                 errorMsg.includes('429');
        
        if (isTemporaryError && !isRetry) {
          this.failedUsers.push(user);
          this.logger.warning(`Temporary error for user ${user.userId}, will retry`, { error: errorMsg });
        } else {
          this.logger.error(`Failed to process user ${user.userId}`, { error: errorMsg });
          this.stats.failedDistributions++;
          this.stats.errors.push(`User ${user.userId} (${user.walletAddress}): ${errorMsg}`);
        }
      }
    }

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

  async processUser(user, activeContracts, isDryRun) {
    if (!this.nftVerifier.isValidSolanaAddress(user.walletAddress)) {
      this.logger.debug(`Skipping user ${user.userId} - invalid wallet: ${user.walletAddress}`);
      return { eligible: false, skipped: true, reason: 'Invalid wallet address' };
    }

    if (!isDryRun) {
      const alreadyReceived = await this.checkUserAlreadyReceived(user.userId);
      if (alreadyReceived) {
        this.logger.debug(`User ${user.userId} already received distribution`);
        return { eligible: false, reason: 'Already received' };
      }
    }

    const nftCount = await this.nftVerifier.verifyNFTOwnership(user.walletAddress, activeContracts);

    if (nftCount > 0) {
      return { eligible: true, nftCount };
    } else {
      return { eligible: false, reason: 'No MKIN NFTs found' };
    }
  }

  async checkUserAlreadyReceived(userId) {
    const snapshot = await db
      .collection('oneTimeDistribution')
      .where('userId', '==', userId)
      .where('distributionId', '==', CONFIG.DISTRIBUTION_ID)
      .where('status', '==', 'completed')
      .get();

    return !snapshot.empty;
  }

  async executeBatchWrite(operations) {
    const batch = db.batch();

    for (const { user, nftCount } of operations) {
      try {
        const userRef = db.collection('userRewards').doc(user.userId);
        batch.update(userRef, {
          totalRealmkin: admin.firestore.FieldValue.increment(CONFIG.DISTRIBUTION_AMOUNT),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const transactionRef = db.collection('transactionHistory').doc();
        batch.set(transactionRef, {
          userId: user.userId,
          walletAddress: user.walletAddress,
          type: 'distribution',
          amount: CONFIG.DISTRIBUTION_AMOUNT,
          description: `One-time MKIN distribution (${CONFIG.DISTRIBUTION_ID})`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

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

    await batch.commit();
    this.logger.success(`Batch committed successfully: ${operations.length} distributions`);
  }

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

async function main() {
  const logger = new Logger();
  logger.info('🎬 One-Time Token Distribution (External Cron Mode) Started');
  
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  if (isDryRun) {
    logger.warning('🔧 DRY RUN MODE ENABLED - No actual distributions will occur');
  }

  const firebaseInitialized = initializeFirebase();
  if (!firebaseInitialized) {
    logger.error('Failed to initialize Firebase, exiting');
    process.exit(1);
  }

  if (!process.env.HELIUS_API_KEY && !process.env.MAGIC_EDEN_API_KEY) {
    logger.error('Either HELIUS_API_KEY or MAGIC_EDEN_API_KEY is required');
    process.exit(1);
  }

  try {
    const nftVerifier = new NFTVerifier(logger);
    const distributionService = new DistributionService(logger, nftVerifier);

    const stats = await distributionService.execute(isDryRun);

    logger.success('✅ Distribution execution completed', stats);
  } catch (error) {
    logger.error('❌ Distribution execution failed', {
      error: error.message,
      stack: error.stack,
    });
    await logger.saveToFile();
    process.exit(1);
  } finally {
    await logger.saveToFile();
  }

  logger.success('✅ Script completed successfully');
  process.exit(0);
}

// Run the script
main();
