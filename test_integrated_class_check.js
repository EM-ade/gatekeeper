import { checkNftOwnershipWithClass } from './utils/solana.js';
import { COLLECTIONS } from './config/collections.js';
import 'dotenv/config';

// Test wallet with multiple NFTs
const TEST_WALLET = 'F1p6dNLSSTHi4QkUkRVXZw8QurZJKUDcvVBjfF683nU';

const testIntegratedClassCheck = async () => {
  try {
    console.log('🧪 Testing Integrated Class Check Function\n');
    console.log(`💼 Wallet: ${TEST_WALLET}\n`);

    // Get Realmkin collection config
    const collectionConfig = COLLECTIONS.therealmkin;
    
    if (!collectionConfig) {
      console.error('❌ Collection config not found');
      return;
    }

    console.log(`📦 Collection: ${collectionConfig.displayName}`);
    console.log(`🔗 Address: ${collectionConfig.address}`);
    console.log(`📡 Primary Source: ${collectionConfig.primarySource}\n`);

    // Call the integrated function
    console.log('🔍 Checking NFT ownership with class filtering...\n');
    const result = await checkNftOwnershipWithClass(TEST_WALLET, collectionConfig);

    if (!result || !result.nfts) {
      console.log('⚠️  No result returned');
      return;
    }

    console.log(`✅ Found ${result.nfts.length} NFTs\n`);

    if (result.nfts.length === 0) {
      console.log('⚠️  No NFTs found for this wallet');
      return;
    }

    // Display NFT breakdown
    console.log('📋 NFT Breakdown by Class:');
    console.log('═'.repeat(60));

    const nftsByClass = {};
    result.nfts.forEach(nft => {
      const cls = nft.class || 'Unknown';
      if (!nftsByClass[cls]) {
        nftsByClass[cls] = [];
      }
      nftsByClass[cls].push(nft);
    });

    Object.entries(nftsByClass).forEach(([cls, nfts]) => {
      console.log(`\n${cls} (${nfts.length}):`);
      nfts.slice(0, 3).forEach(nft => {
        console.log(`  • ${nft.name}`);
      });
      if (nfts.length > 3) {
        console.log(`  ... and ${nfts.length - 3} more`);
      }
    });

    // Statistics
    console.log('\n\n📊 Statistics:');
    console.log('═'.repeat(60));
    console.log(`Total NFTs: ${result.nfts.length}`);
    console.log(`Classes found: ${Object.keys(nftsByClass).length}`);
    console.log(`NFTs with class: ${result.nfts.filter(n => n.class).length}`);
    console.log(`NFTs without class: ${result.nfts.filter(n => !n.class).length}`);

    // Class distribution
    console.log('\nClass Distribution:');
    Object.entries(nftsByClass)
      .sort((a, b) => b[1].length - a[1].length)
      .forEach(([cls, nfts]) => {
        const percentage = ((nfts.length / result.nfts.length) * 100).toFixed(1);
        const bar = '█'.repeat(Math.round(nfts.length / 2));
        console.log(`  ${cls.padEnd(12)} ${bar} ${nfts.length} (${percentage}%)`);
      });

    // Role eligibility simulation
    console.log('\n\n🎯 Role Eligibility (Simulated):');
    console.log('═'.repeat(60));

    const classRoles = {
      'King': 'REALM King 👑',
      'Queen': 'REALM QUEEN 👑',
      'Knight': 'KNIGHT',
      'Chef': 'CHEF',
      'Wizard': 'WIZARD',
      'Warrior': 'WARRIOR',
      'Priest': 'PRIEST',
      'Butler': 'BUTLER',
      'Noble': 'NOBLE\'S',
      'Jester': 'JESTER',
      'Chief': 'CHIEF',
      'Witch': 'WITCH',
    };

    const eligibleRoles = [];
    Object.entries(nftsByClass).forEach(([cls, nfts]) => {
      if (classRoles[cls]) {
        eligibleRoles.push({
          class: cls,
          role: classRoles[cls],
          count: nfts.length,
        });
      }
    });

    if (eligibleRoles.length === 0) {
      console.log('(No class-based roles eligible)');
    } else {
      eligibleRoles.forEach(role => {
        console.log(`✅ ${role.role} (${role.class}: ${role.count} NFT${role.count !== 1 ? 's' : ''})`);
      });
    }

    // Quantity-based roles
    console.log('\n\nQuantity-Based Roles:');
    const total = result.nfts.length;
    if (total >= 5) console.log(`✅ RMK ROYAL (5+) - ${total} NFTs`);
    if (total >= 3) console.log(`✅ RMK ROYAL (3+) - ${total} NFTs`);
    if (total >= 1) console.log(`✅ RMK ROYAL (1+) - ${total} NFTs`);

    console.log('\n\n✅ Integrated class check test complete!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
  }
};

testIntegratedClassCheck();
