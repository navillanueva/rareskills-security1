/**
 * Zerdinals Auto-Minter Bot
 * 
 * Simple bot to automatically mint Zcash Zerdinals inscriptions
 */

require('dotenv').config();
const fetch = require('node-fetch');
const bitcoin = require('bitcoinjs-lib');
const ECPairFactory = require('ecpair').default;
const ecc = require('tiny-secp256k1');

// Initialize ECPair for signing
const ECPair = ECPairFactory(ecc);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Zcash RPC (public node - no auth required)
  rpcUrl: process.env.ZCASH_RPC_URL,
  
  // Wallet
  privateKey: process.env.ZCASH_PRIVATE_KEY,
  address: process.env.ZCASH_ADDRESS,
  
  // Bot settings
  checkInterval: parseInt(process.env.CHECK_INTERVAL) || 5000,
  autoMint: process.env.AUTO_MINT === 'true',
  mintAmount: parseInt(process.env.MINT_AMOUNT) || 1000,
  
  // Optional
  discordWebhook: process.env.DISCORD_WEBHOOK
};

// Track minted tokens
const mintedTokens = new Set();

// ============================================================================
// ZCASH RPC FUNCTIONS
// ============================================================================

/**
 * Call Zcash RPC (public node - no authentication)
 */
async function rpcCall(method, params = []) {
  try {
    const response = await fetch(CONFIG.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: Date.now(),
        method: method,
        params: params
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(`RPC Error: ${data.error.message}`);
    }
    
    return data.result;
    
  } catch (error) {
    throw new Error(`RPC call failed: ${error.message}`);
  }
}

/**
 * Get address balance (using getaddressbalance)
 */
async function getBalance() {
  try {
    // Try getaddressbalance for specific address
    const result = await rpcCall('getaddressbalance', [{ addresses: [CONFIG.address] }]);
    return result.balance / 100000000; // Convert satoshis to ZEC
  } catch (error) {
    console.log('Note: Could not fetch balance (normal for public nodes)');
    return null;
  }
}

/**
 * Get blockchain info to verify connection
 */
async function getBlockchainInfo() {
  try {
    const info = await rpcCall('getblockchaininfo');
    return info;
  } catch (error) {
    throw new Error(`Cannot connect to Zcash node: ${error.message}`);
  }
}

/**
 * Get raw transaction by txid
 */
async function getRawTransaction(txid) {
  try {
    const rawTx = await rpcCall('getrawtransaction', [txid, 0]); // 0 = return hex string
    return rawTx;
  } catch (error) {
    throw new Error(`Failed to get raw transaction: ${error.message}`);
  }
}

/**
 * Decode a raw transaction to analyze its structure
 */
async function decodeTransaction(rawTxHex) {
  try {
    const decoded = await rpcCall('decoderawtransaction', [rawTxHex]);
    return decoded;
  } catch (error) {
    throw new Error(`Failed to decode transaction: ${error.message}`);
  }
}

/**
 * Analyze a Zerdinals inscription transaction
 * Fetches and decodes a transaction, looking for OP_RETURN data
 */
async function analyzeInscriptionTx(txid) {
  try {
    console.log(`\n🔍 Analyzing transaction: ${txid}\n`);
    
    // Get decoded transaction (verbose=1 returns decoded JSON)
    console.log('   Fetching and decoding transaction...');
    const decoded = await rpcCall('getrawtransaction', [txid, 1]); // 1 = return decoded JSON
    console.log('   ✅ Transaction decoded');
    
    console.log('\n📊 Transaction Details:');
    console.log('   Version:', decoded.version);
    console.log('   Version Group ID:', decoded.versiongroupid);
    console.log('   Size:', decoded.size, 'bytes');
    console.log('   Inputs:', decoded.vin?.length || 0);
    console.log('   Outputs:', decoded.vout?.length || 0);
    console.log('   Lock time:', decoded.locktime);
    console.log('   Expiry height:', decoded.expiryheight);
    console.log('   Confirmations:', decoded.confirmations);
    
    // Look for OP_RETURN output
    console.log('\n📝 Outputs:');
    for (const output of decoded.vout || []) {
      console.log(`\n   Output ${output.n}:`);
      console.log('     Value:', output.value, 'ZEC');
      console.log('     Type:', output.scriptPubKey?.type || '(unknown)');
      console.log('     Script hex:', output.scriptPubKey?.hex);
      
      if (output.scriptPubKey?.hex) {
        const hex = output.scriptPubKey.hex;
        
        // Check if it starts with OP_RETURN (0x6a)
        if (hex.startsWith('6a')) {
          // This is OP_RETURN!
          console.log('     ✅ OP_RETURN FOUND!');
          
          let dataHex = hex.substring(2); // Remove 6a
          // Next byte is length
          const lengthByte = parseInt(dataHex.substring(0, 2), 16);
          dataHex = dataHex.substring(2); // Remove length byte
          console.log('     Data length:', lengthByte, 'bytes');
          console.log('     Data (hex):', dataHex);
          
          // Try to decode as UTF-8
          try {
            const dataBuffer = Buffer.from(dataHex, 'hex');
            const dataText = dataBuffer.toString('utf8');
            console.log('     Data (text):', dataText);
            
            // Try to parse as JSON
            try {
              const json = JSON.parse(dataText);
              console.log('\n     🎯 ZRC-20 Inscription Decoded:');
              console.log('        Protocol:', json.p);
              console.log('        Operation:', json.op);
              console.log('        Ticker:', json.tick);
              console.log('        Amount:', json.amt);
            } catch (e) {
              console.log('     (Not valid JSON)');
            }
          } catch (e) {
            console.log('     (Cannot decode as UTF-8)');
          }
        } else if (output.scriptPubKey?.type === 'nulldata') {
          console.log('     ✅ Type is nulldata but script doesn\'t start with 6a');
          console.log('     Script ASM:', output.scriptPubKey?.asm);
        } else {
          console.log('     Address:', output.scriptPubKey?.addresses?.[0]);
        }
      }
    }
    
    console.log('\n');
    return decoded;
    
  } catch (error) {
    console.error('Analysis failed:', error.message);
    throw error;
  }
}

/**
 * Get UTXOs for address
 */
async function getUTXOs() {
  try {
    // Get unspent transaction outputs
    const utxos = await rpcCall('getaddressutxos', [{ addresses: [CONFIG.address] }]);
    
    if (!utxos || utxos.length === 0) {
      throw new Error('No UTXOs available. Make sure your wallet is funded.');
    }
    
    // Sort by value descending (use largest UTXO first)
    utxos.sort((a, b) => b.satoshis - a.satoshis);
    
    return utxos;
  } catch (error) {
    throw new Error(`Failed to get UTXOs: ${error.message}`);
  }
}

/**
 * Sign Zcash transaction locally (client-side signing)
 * Falls back to this when RPC signing is not available
 */
async function signTransactionLocally(rawTxHex, utxo, privateKeyWIF) {
  try {
    console.log('   Attempting client-side signing...');
    
    const wif = require('wif');
    const crypto = require('crypto');
    
    // Decode private key
    const decoded = wif.decode(privateKeyWIF);
    const keyPair = ECPair.fromPrivateKey(decoded.privateKey, { compressed: decoded.compressed });
    
    // For Zcash Sapling (v4) transactions, we need to:
    // 1. Parse the unsigned transaction
    // 2. Create signature hash for each input
    // 3. Sign with ECDSA
    // 4. Replace scriptSig in transaction
    
    const txBuffer = Buffer.from(rawTxHex, 'hex');
    
    // Parse basic transaction structure
    let offset = 0;
    
    // Header (4 bytes version + 4 bytes version group)
    const header = txBuffer.slice(offset, offset + 8);
    offset += 8;
    
    // For now, we'll use a simpler approach:
    // Use bitcoinjs-lib TransactionBuilder with Zcash network parameters
    
    // Define Zcash network (similar to Bitcoin but different parameters)
    const zcashNetwork = {
      messagePrefix: '\x18Zcash Signed Message:\n',
      bech32: 'zs',
      bip32: {
        public: 0x0488B21E,
        private: 0x0488ADE4,
      },
      pubKeyHash: 0x1CB8,
      scriptHash: 0x1CBD,
      wif: 0x80,
    };
    
    // Build and sign transaction using bitcoinjs-lib
    const txb = new bitcoin.TransactionBuilder(zcashNetwork);
    
    // Set version to 4 (Sapling)
    txb.setVersion(4);
    
    // Add input
    txb.addInput(utxo.txid, utxo.vout || utxo.outputIndex);
    
    // Parse outputs from raw transaction
    // This is complex - for now return error
    throw new Error('Client-side signing for Zcash Sapling not yet fully implemented');
    
  } catch (error) {
    throw new Error(`Local signing failed: ${error.message}`);
  }
}

/**
 * Build inscription scriptSig data
 * Format: [length] "ord" [mime_length] [mime_type] OP_0 [data_length] [inscription_data]
 */
function buildInscriptionScript(inscriptionJSON, mimeType = 'application/json') {
  const mimeBuffer = Buffer.from(mimeType, 'utf8');
  const dataBuffer = Buffer.from(inscriptionJSON, 'utf8');
  
  // Build the inscription envelope
  const parts = [];
  
  // "ord" marker (3 bytes)
  const ordMarker = Buffer.from('ord', 'utf8');
  parts.push(Buffer.from([ordMarker.length])); // Length prefix
  parts.push(ordMarker);
  
  // MIME type with OP_PUSH
  parts.push(Buffer.from([0x51])); // OP_PUSH (adjust based on length)
  parts.push(Buffer.from([mimeBuffer.length]));
  parts.push(mimeBuffer);
  
  // OP_0 separator
  parts.push(Buffer.from([0x00]));
  
  // Inscription data
  parts.push(Buffer.from([dataBuffer.length]));
  parts.push(dataBuffer);
  
  return Buffer.concat(parts);
}

/**
 * Create P2SH redeem script for inscription
 * This creates a script that can be spent by providing the inscription data + signature
 */
function createInscriptionRedeemScript(publicKeyHash) {
  // Build a simple script: OP_DUP OP_HASH160 <pubKeyHash> OP_EQUALVERIFY OP_CHECKSIG
  // Plus some OP_DROP to allow arbitrary data before the signature
  const script = bitcoin.script.compile([
    bitcoin.opcodes.OP_DROP,  // Drop inscription data
    bitcoin.opcodes.OP_DROP,  // Drop more data
    bitcoin.opcodes.OP_DROP,  // Drop more data  
    bitcoin.opcodes.OP_DROP,  // Drop more data
    bitcoin.opcodes.OP_DROP,  // Drop more data
    bitcoin.opcodes.OP_DROP,  // Drop more data
    bitcoin.opcodes.OP_1,     // Push 1 for signature verification
  ]);
  
  return script;
}

/**
 * Create COMMIT transaction
 * Creates a P2SH output that will be spent in the reveal transaction
 */
async function createCommitTransaction(inscriptionScript) {
  try {
    console.log('   Creating commit transaction...');
    
    // Get UTXOs
    const utxos = await getUTXOs();
    const utxo = utxos[0]; // Use largest UTXO
    
    console.log(`   Using UTXO: ${utxo.txid.substring(0, 16)}... (${utxo.satoshis} sats)`);
    
    // Build redeem script (this will be revealed when spending)
    const wif = require('wif');
    const decoded = wif.decode(CONFIG.privateKey);
    const keyPair = ECPair.fromPrivateKey(decoded.privateKey, { compressed: decoded.compressed });
    const pubKeyHash = bitcoin.crypto.hash160(keyPair.publicKey);
    
    // Create a P2SH script that allows inscription data
    const redeemScript = createInscriptionRedeemScript(pubKeyHash);
    const scriptHash = bitcoin.crypto.hash160(redeemScript);
    const p2shOutput = bitcoin.script.compile([
      bitcoin.opcodes.OP_HASH160,
      scriptHash,
      bitcoin.opcodes.OP_EQUAL
    ]);
    
    console.log('   ⚠️  IMPORTANT: Zerdinals requires complex P2SH transaction building');
    console.log('   This requires a local Zcash node with wallet or specialized tooling\n');
    
    throw new Error(
      'Commit/Reveal transaction creation requires:\n' +
      '   1. Local zcashd with wallet\n' +
      '   2. Or use the Zerdinals official minting interface\n' +
      '   3. Or implement full P2SH signing (complex)\n\n' +
      '   Recommendation: Use https://mint.zerdinals.com for minting'
    );
    
  } catch (error) {
    throw new Error(`Commit transaction failed: ${error.message}`);
  }
}

/**
 * Create REVEAL transaction
 * Spends the commit output with inscription data in scriptSig
 */
async function createRevealTransaction(commitTxid, inscriptionScript, inscriptionJSON) {
  try {
    console.log('   Creating reveal transaction...');
    
    // This would spend the commit output (output 0)
    // The scriptSig would contain: inscriptionScript + signature + redeemScript
    
    throw new Error('Reveal transaction creation not yet implemented');
    
  } catch (error) {
    throw new Error(`Reveal transaction failed: ${error.message}`);
  }
}

/**
 * Create and broadcast ZRC-20 inscription transaction
 * Uses commit/reveal pattern with inscription in scriptSig
 */
async function mintInscription(ticker, amount) {
  try {
    console.log(`\n[${new Date().toISOString()}] 🚀 Minting ${ticker}...`);
    console.log('   Using commit/reveal pattern\n');
    
    // Step 1: Create inscription data (ZRC-20 format)
    const inscriptionData = {
      p: 'zrc-20',           // Protocol
      op: 'mint',            // Operation
      tick: ticker,          // Token ticker (e.g., "ZERO")
      amt: amount.toString() // Amount as string (e.g., "1000")
    };
    
    const inscriptionJSON = JSON.stringify(inscriptionData);
    console.log('   Inscription:', inscriptionJSON);
    console.log('   Data size:', Buffer.from(inscriptionJSON, 'utf8').length, 'bytes');
    
    // Step 2: Build inscription script
    const inscriptionScript = buildInscriptionScript(inscriptionJSON);
    console.log('   Inscription script length:', inscriptionScript.length, 'bytes\n');
    
    // Step 3: Create COMMIT transaction
    console.log('═══ COMMIT TRANSACTION ═══\n');
    const commitTxid = await createCommitTransaction(inscriptionScript);
    console.log(`   ✅ Commit TX: ${commitTxid}`);
    console.log(`   Explorer: https://blockchair.com/zcash/transaction/${commitTxid}\n`);
    
    // Step 4: Wait for commit confirmation (optional, but safer)
    console.log('   Waiting for commit transaction to be broadcast...');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    
    // Step 5: Create REVEAL transaction
    console.log('\n═══ REVEAL TRANSACTION ═══\n');
    const revealTxid = await createRevealTransaction(commitTxid, inscriptionScript, inscriptionJSON);
    
    console.log(`\n✅ SUCCESS! Minted ${ticker}!`);
    console.log(`   Commit TX: ${commitTxid}`);
    console.log(`   Reveal TX: ${revealTxid}`);
    console.log(`   Inscription ID: ${revealTxid}:0`);
    console.log(`   Explorer: https://blockchair.com/zcash/transaction/${revealTxid}\n`);
    
    await notifyDiscord(
      `✅ **Successfully minted ${ticker}!**\n` +
      `Amount: ${amount}\n` +
      `Commit TX: \`${commitTxid}\`\n` +
      `Reveal TX: \`${revealTxid}\`\n` +
      `Inscription ID: \`${revealTxid}:0\``
    );
    
    return { commitTxid, revealTxid };
    
  } catch (error) {
    console.error(`\n❌ Minting failed:`, error.message);
    await notifyDiscord(`❌ Failed to mint **${ticker}**: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// MONITORING FUNCTIONS
// ============================================================================

/**
 * Fetch available tokens to mint
 * For now, returns hardcoded token list
 * TODO: Implement automatic detection of new tokens
 */
async function fetchAvailableTokens() {
  try {
    console.log(`[${new Date().toISOString()}] 🔍 Checking for new tokens...`);
    
    // For now, return known tokens
    // You can manually add tokens here as they're announced
    const knownTokens = [
      { ticker: 'ZERO', name: 'Zero Token' }
      // Add more tokens as they're announced:
      // { ticker: 'ZERD', name: 'Zerdinals' },
      // { ticker: 'ZRC', name: 'ZRC Token' },
    ];
    
    // TODO: Implement automatic detection:
    // Option 1: Parse mint.zerdinals.com for available tokens
    // Option 2: Monitor their API (if they have one)
    // Option 3: Monitor their Discord/Telegram for announcements
    // Option 4: Scan recent Zcash transactions for new ZRC-20 deploys
    
    return knownTokens;
    
  } catch (error) {
    console.error('Error fetching tokens:', error.message);
    return [];
  }
}

/**
 * Main monitoring loop
 */
async function monitor() {
  console.log('🤖 Zerdinals Auto-Minter Started\n');
  console.log('Configuration:');
  console.log(`  RPC: ${CONFIG.rpcUrl}`);
  console.log(`  Address: ${CONFIG.address}`);
  console.log(`  Auto-mint: ${CONFIG.autoMint}`);
  console.log(`  Check interval: ${CONFIG.checkInterval}ms\n`);
  
  // Test RPC connection
  try {
    console.log('🔌 Testing RPC connection...');
    const info = await getBlockchainInfo();
    console.log(`✅ Connected to Zcash node`);
    console.log(`   Chain: ${info.chain}`);
    console.log(`   Blocks: ${info.blocks}`);
    console.log(`   Network: ${info.network || 'mainnet'}\n`);
  } catch (error) {
    console.error('❌ RPC connection failed:', error.message);
    console.log('   Check your ZCASH_RPC_URL in .env file\n');
    process.exit(1);
  }
  
  // Try to check balance (may not work on all public nodes)
  const balance = await getBalance();
  if (balance !== null) {
    console.log(`💰 Current balance: ${balance} ZEC\n`);
    
    if (balance === 0) {
      console.log('⚠️  WARNING: Your wallet has 0 balance!');
      console.log(`   Send ZEC to: ${CONFIG.address}\n`);
    }
  } else {
    console.log('💰 Balance check not available (using public node)\n');
  }
  
  await notifyDiscord('🤖 Zerdinals Auto-Minter Started\nMonitoring for new tokens...');
  
  // Main loop
  while (true) {
    try {
      const tokens = await fetchAvailableTokens();
      
      for (const token of tokens) {
        const ticker = token.ticker || token.name;
        
        if (mintedTokens.has(ticker)) {
          continue; // Already minted
        }
        
        console.log(`\n🆕 New token detected: ${ticker}`);
        
        if (CONFIG.autoMint) {
          try {
            await mintInscription(ticker, CONFIG.mintAmount);
            mintedTokens.add(ticker);
          } catch (error) {
            console.error(`Failed to mint ${ticker}:`, error.message);
          }
        } else {
          console.log('   ⚠️  Auto-mint disabled. Manual action required.');
        }
      }
      
    } catch (error) {
      console.error('Monitor error:', error.message);
    }
    
    // Wait before next check
    await new Promise(resolve => setTimeout(resolve, CONFIG.checkInterval));
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Send Discord notification
 */
async function notifyDiscord(message) {
  if (!CONFIG.discordWebhook) return;
  
  try {
    await fetch(CONFIG.discordWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: '⚡ Zerdinals Minter',
          description: message,
          color: 0x00ff00,
          timestamp: new Date().toISOString()
        }]
      })
    });
  } catch (error) {
    // Silently fail Discord notifications
  }
}

// ============================================================================
// START BOT
// ============================================================================

// Check command line arguments first
const args = process.argv.slice(2);
const isAnalyzeMode = args[0] === 'analyze';

// Validate configuration (analyze mode only needs RPC URL)
if (isAnalyzeMode) {
  if (!CONFIG.rpcUrl) {
    console.error('❌ Missing ZCASH_RPC_URL!');
    console.log('\nFor analyze mode, only RPC URL is required.');
    console.log('Set ZCASH_RPC_URL in .env file or environment variable.\n');
    process.exit(1);
  }
} else {
  if (!CONFIG.rpcUrl || !CONFIG.privateKey || !CONFIG.address) {
    console.error('❌ Missing required configuration!');
    console.log('\nPlease create .env file and set:');
    console.log('  cp config.template .env');
    console.log('\nThen edit .env and fill in:');
    console.log('  - ZCASH_RPC_URL (public RPC endpoint)');
    console.log('  - ZCASH_PRIVATE_KEY (your funded wallet)');
    console.log('  - ZCASH_ADDRESS (your address)\n');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n👋 Shutting down...');
  await notifyDiscord('👋 Zerdinals Auto-Minter Stopped');
  process.exit(0);
});

// Execute based on command line arguments
if (args[0] === 'analyze' && args[1]) {
  // Analyze transaction mode: node bot.js analyze <txid>
  const txid = args[1];
  
  console.log('🔍 Transaction Analysis Mode\n');
  console.log(`   TXID: ${txid}\n`);
  
  (async () => {
    try {
      // Test RPC connection
      console.log('🔌 Testing RPC connection...');
      const info = await getBlockchainInfo();
      console.log(`✅ Connected to Zcash ${info.chain} (block ${info.blocks})`);
      
      // Analyze transaction
      await analyzeInscriptionTx(txid);
      
      console.log('✨ Analysis complete!\n');
      process.exit(0);
    } catch (error) {
      console.error('\n❌ Error:', error.message);
      process.exit(1);
    }
  })();
  
} else if (args[0] === 'mint' && args[1]) {
  // Manual mint mode: node bot.js mint ZERO 1000
  const ticker = args[1];
  const amount = args[2] ? parseInt(args[2]) : CONFIG.mintAmount;
  
  console.log('🎯 Manual Mint Mode\n');
  console.log(`   Ticker: ${ticker}`);
  console.log(`   Amount: ${amount}\n`);
  
  (async () => {
    try {
      // Test RPC connection
      console.log('🔌 Testing RPC connection...');
      const info = await getBlockchainInfo();
      console.log(`✅ Connected to Zcash ${info.chain} (block ${info.blocks})\n`);
      
      // Mint
      await mintInscription(ticker, amount);
      
      console.log('\n✨ Done!\n');
      process.exit(0);
    } catch (error) {
      console.error('\n❌ Error:', error.message);
      process.exit(1);
    }
  })();
  
} else {
  // Auto-monitoring mode
  monitor().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

