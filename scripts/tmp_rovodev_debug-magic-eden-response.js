/**
 * Debug Magic Eden API Response
 * Check what fields Magic Eden actually returns
 */

import fetch from 'node-fetch';

const walletAddress = '7o8D8FufvfWLWzmc6xhrM2XqZ7Y3Zuce5XZz8CL7taRD';
const collectionSymbol = 'therealmkin';

async function debugMagicEdenResponse() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 MAGIC EDEN API RESPONSE DEBUG');
  console.log('='.repeat(80));
  console.log(`\nWallet: ${walletAddress}`);
  console.log(`Collection Symbol: ${collectionSymbol}\n`);
  
  try {
    const url = `https://api-mainnet.magiceden.dev/v2/wallets/${walletAddress}/tokens?collectionSymbol=${encodeURIComponent(collectionSymbol)}`;
    console.log(`📡 Fetching from: ${url}\n`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' }
    });
    
    if (!response.ok) {
      console.error(`❌ API Error: ${response.status} ${response.statusText}`);
      return;
    }
    
    const data = await response.json();
    console.log(`✅ Found ${data.length} NFTs\n`);
    
    if (data.length > 0) {
      console.log('📋 Sample NFT (first result):\n');
      console.log(JSON.stringify(data[0], null, 2));
      
      console.log('\n' + '='.repeat(80));
      console.log('🔑 KEY FIELDS CHECK:');
      console.log('='.repeat(80));
      
      const sample = data[0];
      console.log(`\nmintAddress: ${sample.mintAddress || 'MISSING'}`);
      console.log(`tokenMint: ${sample.tokenMint || 'MISSING'}`);
      console.log(`name: ${sample.name || 'MISSING'}`);
      console.log(`collectionAddress: ${sample.collectionAddress || 'MISSING'}`);
      console.log(`collection: ${sample.collection ? JSON.stringify(sample.collection) : 'MISSING'}`);
      console.log(`collection.address: ${sample.collection?.address || 'MISSING'}`);
      console.log(`collection.symbol: ${sample.collection?.symbol || 'MISSING'}`);
      
      console.log('\n' + '='.repeat(80));
      console.log('📊 CHECKING ALL NFTs FOR COLLECTION ADDRESS:');
      console.log('='.repeat(80));
      
      let hasCollectionAddress = 0;
      let hasCollectionObject = 0;
      let uniqueCollectionAddresses = new Set();
      
      data.forEach((nft, idx) => {
        if (nft.collectionAddress) {
          hasCollectionAddress++;
          uniqueCollectionAddresses.add(nft.collectionAddress);
        }
        if (nft.collection) {
          hasCollectionObject++;
        }
      });
      
      console.log(`\nNFTs with collectionAddress field: ${hasCollectionAddress}/${data.length}`);
      console.log(`NFTs with collection object: ${hasCollectionObject}/${data.length}`);
      
      if (uniqueCollectionAddresses.size > 0) {
        console.log(`\nUnique collection addresses found:`);
        uniqueCollectionAddresses.forEach(addr => console.log(`  - ${addr}`));
      }
      
      console.log('\n' + '='.repeat(80));
      console.log('💡 EXPECTED COLLECTION ADDRESS:');
      console.log('='.repeat(80));
      console.log('\n89KnhXiCHb2eGP2jRGzEQX3B8NTyqHEVmu55syDWSnL8');
      
      console.log('\n' + '='.repeat(80));
    } else {
      console.log('⚠️  No NFTs returned from Magic Eden API');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

debugMagicEdenResponse()
  .then(() => console.log('\n✅ Debug complete\n'))
  .catch(err => console.error('\n❌ Debug failed:', err));
