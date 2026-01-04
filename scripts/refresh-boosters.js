import BoosterService from '../services/boosterService.js';
import environmentConfig from '../config/environment.js';

/**
 * Script to refresh boosters for all active staking users
 * This can be run as a standalone script or called from other processes
 */
async function refreshAllBoosters() {
  const envInfo = environmentConfig.getEnvironmentInfo();
  console.log(`🚀 Starting booster refresh script (${envInfo.nodeEnv})...`);
  
  // Check if booster refresh is enabled in this environment
  const periodicConfig = environmentConfig.periodicServicesConfig;
  if (!periodicConfig.enablePeriodicBoosterRefresh && envInfo.isDevelopment) {
    console.log('⏸️ Booster refresh disabled in development mode');
    console.log('💡 Set NODE_ENV=production to enable booster refresh');
    process.exit(0);
  }
  
  const boosterService = new BoosterService();
  
  try {
    await boosterService.refreshAllActiveBoosters();
    console.log('✅ Booster refresh completed successfully');
  } catch (error) {
    console.error('❌ Booster refresh failed:', error);
    process.exit(1);
  }
  
  console.log('🏁 Booster refresh script finished');
  process.exit(0);
}

// Run if called directly
if (require.main === module) {
  refreshAllBoosters();
}

export { refreshAllBoosters };