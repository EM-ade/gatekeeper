import { checkNftOwnershipWithClass } from './utils/solana.js';
import { COLLECTIONS } from './config/collections.js';
import 'dotenv/config';

// Test wallet with multiple NFTs
const TEST_WALLET = 'Gsn9WsRjLBboAar9cngwBHJRAoVyeydr3quSAezCk7pZ';

// Simulate contract rules (as they would come from database)
const MOCK_CONTRACT_RULES = [
  // Quantity-based rules
  {
    contractAddress: '89KnhXiCHb2eGP2jRGzEQX3B8NTyqHEVmu55syDWSnL8',
    ruleType: 'quantity',
    requiredNftCount: 1,
    roleId: 'role_rmk_1plus',
    roleName: 'RMK ROYAL (1+)',
  },
  {
    contractAddress: '89KnhXiCHb2eGP2jRGzEQX3B8NTyqHEVmu55syDWSnL8',
    ruleType: 'quantity',
    requiredNftCount: 3,
    roleId: 'role_rmk_3plus',
    roleName: 'RMK ROYAL (3+)',
  },
  {
    contractAddress: '89KnhXiCHb2eGP2jRGzEQX3B8NTyqHEVmu55syDWSnL8',
    ruleType: 'quantity',
    requiredNftCount: 5,
    roleId: 'role_rmk_5plus',
    roleName: 'RMK ROYAL (5+)',
  },
  // Trait-based rules (class-based)
  {
    contractAddress: '89KnhXiCHb2eGP2jRGzEQX3B8NTyqHEVmu55syDWSnL8',
    ruleType: 'trait',
    traitType: 'Class',
    traitValue: 'King',
    roleId: 'role_king',
    roleName: 'REALM King 👑',
  },
  {
    contractAddress: '89KnhXiCHb2eGP2jRGzEQX3B8NTyqHEVmu55syDWSnL8',
    ruleType: 'trait',
    traitType: 'Class',
    traitValue: 'Knight',
    roleId: 'role_knight',
    roleName: 'KNIGHT',
  },
  {
    contractAddress: '89KnhXiCHb2eGP2jRGzEQX3B8NTyqHEVmu55syDWSnL8',
    ruleType: 'trait',
    traitType: 'Class',
    traitValue: 'Chef',
    roleId: 'role_chef',
    roleName: 'CHEF',
  },
  {
    contractAddress: '89KnhXiCHb2eGP2jRGzEQX3B8NTyqHEVmu55syDWSnL8',
    ruleType: 'trait',
    traitType: 'Class',
    traitValue: 'Queen',
    roleId: 'role_queen',
    roleName: 'REALM QUEEN 👑',
  },
];

const testPeriodicVerification = async () => {
  try {
    console.log('🧪 Testing Periodic Verification System\n');
    console.log(`💼 Wallet: ${TEST_WALLET}\n`);

    // Step 1: Group rules by collection
    console.log('Step 1: Grouping rules by collection');
    const rulesByCollection = {};
    for (const rule of MOCK_CONTRACT_RULES) {
      const collectionAddr = rule.contractAddress?.toLowerCase();
      if (!collectionAddr) continue;
      
      if (!rulesByCollection[collectionAddr]) {
        rulesByCollection[collectionAddr] = [];
      }
      rulesByCollection[collectionAddr].push(rule);
    }
    console.log(`  ✅ Grouped ${Object.keys(rulesByCollection).length} collection(s)\n`);

    // Step 2: Process each collection
    console.log('Step 2: Processing collections');
    let allNfts = [];
    const contractSummaries = [];

    for (const [collectionAddr, rules] of Object.entries(rulesByCollection)) {
      console.log(`\n  📋 Collection: ${collectionAddr}`);
      
      // Find collection config
      const collectionConfig = Object.values(COLLECTIONS || {})
        .find(config => config.address?.toLowerCase() === collectionAddr);

      if (!collectionConfig) {
        console.log(`    ❌ No collection config found`);
        continue;
      }

      console.log(`    ✅ Found config: ${collectionConfig.displayName}`);

      // Fetch NFTs with class attributes
      console.log(`    📡 Fetching NFTs from Magic Eden...`);
      const result = await checkNftOwnershipWithClass(TEST_WALLET, collectionConfig);

      if (!result.nfts || result.nfts.length === 0) {
        console.log(`    ⚠️  No NFTs found`);
        continue;
      }

      console.log(`    ✅ Found ${result.nfts.length} NFTs`);
      allNfts = allNfts.concat(result.nfts);

      // Process rules
      console.log(`    📋 Processing ${rules.length} rules:`);
      for (const rule of rules) {
        const ruleType = rule.ruleType || 'quantity';

        if (ruleType === 'trait') {
          // Trait-based rule
          const traitValue = rule.traitValue;
          const matchingNfts = result.nfts.filter(nft => nft.class === traitValue);
          const ownedCount = matchingNfts.length;
          const meetsRequirement = ownedCount > 0;

          contractSummaries.push({
            contractAddress: collectionAddr,
            ruleType: 'trait',
            traitType: 'Class',
            traitValue,
            requiredNftCount: 1,
            roleId: rule.roleId,
            roleName: rule.roleName,
            ownedCount,
            meetsRequirement,
          });

          const status = meetsRequirement ? '✅' : '❌';
          console.log(`      ${status} Trait: Class="${traitValue}" → ${rule.roleName} (${ownedCount} NFT${ownedCount !== 1 ? 's' : ''})`);
        } else {
          // Quantity-based rule
          const ownedCount = result.nfts.length;
          const requiredCount = rule.requiredNftCount || 1;
          const meetsRequirement = ownedCount >= requiredCount;

          contractSummaries.push({
            contractAddress: collectionAddr,
            ruleType: 'quantity',
            requiredNftCount: requiredCount,
            roleId: rule.roleId,
            roleName: rule.roleName,
            ownedCount,
            meetsRequirement,
          });

          const status = meetsRequirement ? '✅' : '❌';
          console.log(`      ${status} Quantity: ${ownedCount}/${requiredCount} → ${rule.roleName}`);
        }
      }
    }

    // Step 3: Summary
    console.log('\n\nStep 3: Verification Summary');
    console.log('═'.repeat(60));
    
    console.log(`\n📊 Total NFTs: ${allNfts.length}`);
    console.log(`\n🎯 Roles to Assign:`);
    
    const eligibleRoles = contractSummaries.filter(s => s.meetsRequirement);
    if (eligibleRoles.length === 0) {
      console.log('  (none)');
    } else {
      eligibleRoles.forEach(role => {
        if (role.ruleType === 'trait') {
          console.log(`  ✅ ${role.roleName} (Class: ${role.traitValue})`);
        } else {
          console.log(`  ✅ ${role.roleName} (${role.ownedCount}/${role.requiredNftCount} NFTs)`);
        }
      });
    }

    console.log(`\n❌ Roles NOT to Assign:`);
    const ineligibleRoles = contractSummaries.filter(s => !s.meetsRequirement);
    if (ineligibleRoles.length === 0) {
      console.log('  (none)');
    } else {
      ineligibleRoles.forEach(role => {
        if (role.ruleType === 'trait') {
          console.log(`  ❌ ${role.roleName} (Class: ${role.traitValue} - 0 NFTs)`);
        } else {
          console.log(`  ❌ ${role.roleName} (${role.ownedCount}/${role.requiredNftCount} NFTs)`);
        }
      });
    }

    // Step 4: Detailed NFT breakdown
    console.log('\n\n📋 NFT Breakdown by Class:');
    console.log('═'.repeat(60));
    
    const nftsByClass = {};
    allNfts.forEach(nft => {
      const cls = nft.class || 'Unknown';
      if (!nftsByClass[cls]) {
        nftsByClass[cls] = [];
      }
      nftsByClass[cls].push(nft);
    });

    Object.entries(nftsByClass).forEach(([cls, nfts]) => {
      console.log(`\n${cls} (${nfts.length}):`);
      nfts.forEach(nft => {
        console.log(`  • ${nft.name}`);
      });
    });

    console.log('\n\n✅ Periodic verification test complete!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
};

testPeriodicVerification();
