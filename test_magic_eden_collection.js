import axios from 'axios';
import 'dotenv/config';

const MAGIC_EDEN_API = 'https://api.magiceden.dev/v2';

// Test wallet
const TEST_WALLET = '98vJraBpTmT2hmFxfHchp1Bd7Wg5UN17ZKUuGQKfPi1r';

// Test collection symbol
const COLLECTION_SYMBOL = 'the_realmkin_kins';

const testMagicEdenCollection = async () => {
  try {
    console.log('🧪 Testing Magic Eden Collection Endpoint\n');
    console.log(`📦 Collection: ${COLLECTION_SYMBOL}`);
    console.log(`💼 Wallet: ${TEST_WALLET}\n`);

    // Fetch NFTs from collection by wallet
    const url = `${MAGIC_EDEN_API}/wallets/${TEST_WALLET}/tokens?collectionSymbol=${COLLECTION_SYMBOL}`;
    console.log(`📡 Fetching from: ${url}\n`);

    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    const nfts = response.data;
    console.log(`✅ Found ${nfts.length} NFTs\n`);

    if (nfts.length === 0) {
      console.log('⚠️  No NFTs found for this wallet in this collection');
      return;
    }

    // Display first 5 NFTs
    console.log('📋 First 5 NFTs:');
    console.log('═'.repeat(60));
    
    for (let i = 0; i < Math.min(5, nfts.length); i++) {
      const nft = nfts[i];
      console.log(`\n${i + 1}. ${nft.name}`);
      console.log(`   Mint: ${nft.mint}`);
      console.log(`   Collection: ${nft.collectionName}`);
      
      if (nft.attributes && nft.attributes.length > 0) {
        console.log(`   Attributes:`);
        nft.attributes.forEach(attr => {
          console.log(`     • ${attr.trait_type}: ${attr.value}`);
        });
      }
    }

    // Statistics
    console.log('\n\n📊 Statistics:');
    console.log('═'.repeat(60));
    console.log(`Total NFTs: ${nfts.length}`);

    // Count by attribute if available
    if (nfts[0]?.attributes) {
      const attributes = {};
      nfts.forEach(nft => {
        if (nft.attributes) {
          nft.attributes.forEach(attr => {
            if (!attributes[attr.trait_type]) {
              attributes[attr.trait_type] = {};
            }
            if (!attributes[attr.trait_type][attr.value]) {
              attributes[attr.trait_type][attr.value] = 0;
            }
            attributes[attr.trait_type][attr.value]++;
          });
        }
      });

      Object.entries(attributes).forEach(([traitType, values]) => {
        console.log(`\n${traitType}:`);
        Object.entries(values).forEach(([value, count]) => {
          console.log(`  • ${value}: ${count}`);
        });
      });
    }

    console.log('\n\n✅ Test complete!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
};

testMagicEdenCollection();
