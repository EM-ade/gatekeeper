/**
 * MKIN Token Transfer Utility
 * Handles sending MKIN tokens from the hot wallet to users
 */

import { Connection, PublicKey, Transaction, Keypair, sendAndConfirmTransaction } from '@solana/web3.js';
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
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

  const connection = new Connection(solanaRpcUrl, 'confirmed');
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

  // MKIN has 9 decimals (adjust if different)
  const decimals = 9;
  const amountInSmallestUnit = amount * Math.pow(10, decimals);

  console.log('[MKIN Transfer] From: ' + fromTokenAccount.toBase58());
  console.log('[MKIN Transfer] To: ' + toTokenAccount.toBase58());
  console.log('[MKIN Transfer] Amount (raw): ' + amountInSmallestUnit);

  // Create transfer instruction
  const transferInstruction = createTransferCheckedInstruction(
    fromTokenAccount,
    mkinMint,
    toTokenAccount,
    gatekeeperKeypair.publicKey,
    amountInSmallestUnit,
    decimals
  );

  const transaction = new Transaction().add(transferInstruction);
  transaction.feePayer = gatekeeperKeypair.publicKey;

  // Send transaction
  const txHash = await sendAndConfirmTransaction(
    connection,
    transaction,
    [gatekeeperKeypair],
    {
      commitment: 'confirmed',
      skipPreflight: false,
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
