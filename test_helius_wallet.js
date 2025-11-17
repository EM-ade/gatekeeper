import fetch from 'node-fetch';
import 'dotenv/config';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
// Testing with LOWERCASE (invalid) - should fail validation
const TEST_WALLET = '7nns74szxn8fnlm5648yuh8upjqrmfrlfimv767tkmfg';
const REALMKIN_COLLECTION_ADDRESS = '89KnhXiCHb2eGP2jRGzEQX3B8NTyqHEVmu55syDWSnL8';

const checkWalletWithHelius = async () => {
  try {
    console.log('🧪 Checking wallet with Helius DAS API\n');
    console.log(`💼 Wallet: ${TEST_WALLET}`);
    console.log(`📦 Looking for Realmkin collection: ${REALMKIN_COLLECTION_ADDRESS}\n`);

    if (!HELIUS_API_KEY) {
      console.error('❌ HELIUS_API_KEY not set in .env');
      return;
    }

    const url = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
    
    console.log('📡 Calling Helius DAS API with pagination...\n');
    
    let allAssets = [];
    let page = 1;
    let hasMore = true;
    const limit = 1000;

    while (hasMore) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'wallet-check',
          method: 'getAssetsByOwner',
          params: {
            ownerAddress: TEST_WALLET,
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
        console.error(`❌ API error: ${response.statusText}`);
        return;
      }

      const data = await response.json();

      if (data.error) {
        console.error('❌ JSON-RPC error:', data.error);
        return;
      }

      const assets = data.result?.items || [];
      console.log(`📄 Page ${page}: ${assets.length} assets (total so far: ${allAssets.length + assets.length})`);
      
      allAssets = allAssets.concat(assets);
      hasMore = assets.length === limit;
      
      if (hasMore) {
        page++;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    const assets = allAssets;
    console.log(`\n✅ Found ${assets.length} total assets\n`);

    // Filter for Realmkin NFTs
    const realmkinNfts = assets.filter(asset => 
      Array.isArray(asset.grouping) && 
      asset.grouping.some(group => 
        group.group_key === 'collection' && 
        group.group_value === REALMKIN_COLLECTION_ADDRESS
      )
    );

    console.log(`📊 Realmkin NFTs: ${realmkinNfts.length}\n`);

    if (realmkinNfts.length === 0) {
      console.log('⚠️  No Realmkin NFTs found in this wallet');
      
      // Show what they do have
      if (assets.length > 0) {
        console.log('\n📋 Other NFTs in wallet:');
        const otherCollections = {};
        assets.forEach(asset => {
          const collectionName = asset.grouping?.find(g => g.group_key === 'collection')?.group_value || 'Unknown';
          if (!otherCollections[collectionName]) {
            otherCollections[collectionName] = 0;
          }
          otherCollections[collectionName]++;
        });
        
        Object.entries(otherCollections).forEach(([collection, count]) => {
          console.log(`  • ${collection}: ${count} NFT${count !== 1 ? 's' : ''}`);
        });
      }
      return;
    }

    // Display Realmkin NFTs
    console.log('✅ Realmkin NFTs Found:');
    console.log('═'.repeat(60));
    
    realmkinNfts.forEach((nft, index) => {
      console.log(`\n${index + 1}. ${nft.content?.metadata?.name || 'Unknown'}`);
      console.log(`   Mint: ${nft.id}`);
      
      if (nft.content?.metadata?.attributes && Array.isArray(nft.content.metadata.attributes)) {
        console.log(`   Attributes:`);
        nft.content.metadata.attributes.forEach(attr => {
          console.log(`     • ${attr.trait_type}: ${attr.value}`);
        });
      }
    });

    console.log('\n\n📊 Summary:');
    console.log('═'.repeat(60));
    console.log(`Total Realmkin NFTs: ${realmkinNfts.length}`);
    
    // Count by class if available
    const classCounts = {};
    realmkinNfts.forEach(nft => {
      const classAttr = nft.content?.metadata?.attributes?.find(a => a.trait_type === 'Class');
      const className = classAttr?.value || 'Unknown';
      classCounts[className] = (classCounts[className] || 0) + 1;
    });

    if (Object.keys(classCounts).length > 0) {
      console.log('\nBy Class:');
      Object.entries(classCounts).forEach(([className, count]) => {
        console.log(`  • ${className}: ${count}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
};

checkWalletWithHelius();
