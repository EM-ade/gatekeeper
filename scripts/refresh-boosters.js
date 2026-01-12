import BoosterService from '../services/boosterService.js';
import environmentConfig from '../config/environment.js';

/**
 * Script to refresh boosters for all active staking users
 * This can be run as a standalone script or called from other processes
 */
async function refreshAllBoosters(forceRun = false) {
  const envInfo = environmentConfig.getEnvironmentInfo();
  console.log(`🚀 Starting booster refresh script (${envInfo.nodeEnv})...`);
  
  // Check if booster refresh is enabled in this environment
  const periodicConfig = environmentConfig.periodicServicesConfig;
  if (!periodicConfig.enablePeriodicBoosterRefresh && envInfo.isDevelopment && !forceRun) {
    console.log('⏸️ Booster refresh disabled in development mode');
    console.log('💡 Set NODE_ENV=production to enable booster refresh');
    console.log('💡 Or run with: node scripts/refresh-boosters.js --force');
    process.exit(0);
  }
  
  if (envInfo.isDevelopment && forceRun) {
    console.log('⚡ Force mode enabled - running in development environment');
  }
  
  const boosterService = new BoosterService();
  
  try {
    await boosterService.refreshAllActiveBoosters();
    console.log('✅ Booster refresh completed successfully');
  } catch (error) {
    console.error('❌ Booster refresh failed:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
  
  console.log('🏁 Booster refresh script finished');
  process.exit(0);
}

// Run if called directly (ES module way)
if (import.meta.url === `file://${process.argv[1]}`) {
  // Check for --force flag
  const forceRun = process.argv.includes('--force');
  refreshAllBoosters(forceRun);
}

export { refreshAllBoosters };