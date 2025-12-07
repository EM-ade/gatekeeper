/**
 * MKIN Token Transfer Utility
 * Handles sending MKIN tokens from the hot wallet to users
 */

import { Connection, PublicKey, Transaction, Keypair, sendAndConfirmTransaction } from '@solana/web3.js';
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from '@solana/spl-token';

/**
 * Send MKIN tokens to a user's wallet
 * @param {string} recipientWalletAddress - Destination wallet address
 * @param {number} amount - Amount of MKIN to send (in whole tokens, not lamports)
 * @returns {Promise<string>} Transaction hash
 */
async function sendMkinTokens(recipientWalletAddress, amount) {
  const solanaRpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const mkinTokenMint = process.env.MKIN_TOKEN_MINT;
  const gatekeeperKeypairJson = process.env.GATEKEEPER_KEYPAIR;

  if (!mkinTokenMint || !gatekeeperKeypairJson) {
    throw new Error('Missing MKIN_TOKEN_MINT or GATEKEEPER_KEYPAIR environment variables');
  }

  console.log('[MKIN Transfer] Sending ' + amount + ' MKIN to ' + recipientWalletAddress);

  // Create connection with better settings to prevent timeouts
  const connection = new Connection(solanaRpcUrl, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000, // 60 seconds timeout
  });
  const gatekeeperKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(gatekeeperKeypairJson))
  );
  const mkinMint = new PublicKey(mkinTokenMint);
  const recipientPubkey = new PublicKey(recipientWalletAddress);

  // Get token accounts
  const fromTokenAccount = await getAssociatedTokenAddress(
    mkinMint,
    gatekeeperKeypair.publicKey
  );

  const toTokenAccount = await getAssociatedTokenAddress(
    mkinMint,
    recipientPubkey,
    false // allowOwnerOffCurve
  );

  console.log('[MKIN Transfer] From: ' + fromTokenAccount.toBase58());
  console.log('[MKIN Transfer] To: ' + toTokenAccount.toBase58());

  // Create transaction
  const transaction = new Transaction();
  transaction.feePayer = gatekeeperKeypair.publicKey;

  // Check if recipient token account exists, create if not
  let recipientAccountExists = true;
  try {
    const accountInfo = await getAccount(connection, toTokenAccount);
    console.log('[MKIN Transfer] Recipient token account exists with balance: ' + 
                (parseInt(accountInfo.amount) / Math.pow(10, 9)));
  } catch (error) {
    recipientAccountExists = false;
    console.log('[MKIN Transfer] Recipient token account does not exist - will create it');
    console.log('[MKIN Transfer] Account creation will cost ~0.00203928 SOL (paid by hot wallet)');
    
    // Add instruction to create recipient's token account
    transaction.add(
      createAssociatedTokenAccountInstruction(
        gatekeeperKeypair.publicKey, // payer (gatekeeper pays for account creation)
        toTokenAccount,              // token account address
        recipientPubkey,             // owner of the new account
        mkinMint                     // mint
      )
    );
  }

  // MKIN has 9 decimals (adjust if different)
  const decimals = 9;
  const amountInSmallestUnit = amount * Math.pow(10, decimals);
  console.log('[MKIN Transfer] Amount (raw): ' + amountInSmallestUnit);

  // Add transfer instruction
  transaction.add(
    createTransferCheckedInstruction(
      fromTokenAccount,
      mkinMint,
      toTokenAccount,
      gatekeeperKeypair.publicKey,
      amountInSmallestUnit,
      decimals
    )
  );

  // Get recent blockhash (CRITICAL: prevents "Blockhash not found" errors)
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;

  console.log('[MKIN Transfer] Blockhash: ' + blockhash);
  console.log('[MKIN Transfer] Last valid block height: ' + lastValidBlockHeight);

  // Send transaction with retry logic
  const txHash = await sendAndConfirmTransaction(
    connection,
    transaction,
    [gatekeeperKeypair],
    {
      commitment: 'confirmed',
      skipPreflight: false,
      maxRetries: 3, // Retry up to 3 times if it fails
    }
  );

  console.log('[MKIN Transfer] Success! TX: ' + txHash);
  return txHash;
}

/**
 * Check hot wallet MKIN balance
 * @returns {Promise<number>} Available MKIN balance
 */
async function getHotWalletBalance() {
  const solanaRpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const mkinTokenMint = process.env.MKIN_TOKEN_MINT;
  const gatekeeperKeypairJson = process.env.GATEKEEPER_KEYPAIR;

  if (!mkinTokenMint || !gatekeeperKeypairJson) {
    throw new Error('Missing MKIN_TOKEN_MINT or GATEKEEPER_KEYPAIR environment variables');
  }

  const connection = new Connection(solanaRpcUrl, 'confirmed');
  const gatekeeperKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(gatekeeperKeypairJson))
  );
  const mkinMint = new PublicKey(mkinTokenMint);

  const tokenAccount = await getAssociatedTokenAddress(
    mkinMint,
    gatekeeperKeypair.publicKey
  );

  const balance = await connection.getTokenAccountBalance(tokenAccount);
  const availableMkin = parseInt(balance.value.amount) / Math.pow(10, balance.value.decimals);

  return availableMkin;
}

export { sendMkinTokens, getHotWalletBalance };
