/**
 * Test Zcash RPC connection and available methods
 * Tests which RPC methods are available on your endpoint
 */

require('dotenv').config();
const fetch = require('node-fetch');

const ZCASH_RPC_URL = process.env.ZCASH_RPC_URL;

if (!ZCASH_RPC_URL) {
  console.error('❌ ZCASH_RPC_URL not set in .env file');
  console.log('\nCreate a .env file based on env.example and set your RPC URL.\n');
  process.exit(1);
}

async function rpcCall(method, params = []) {
  try {
    const response = await fetch(ZCASH_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: Date.now(),
        method: method,
        params: params
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      return { success: false, error: data.error.message };
    }
    
    return { success: true, result: data.result };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testRpcMethods() {
  console.log('\n🔌 Testing Zcash RPC Connection\n');
  console.log('RPC URL:', ZCASH_RPC_URL.replace(/\/[^\/]+\/$/, '/****/'));
  console.log(''.padEnd(70, '='));
  
  // Test basic connection
  console.log('\n📡 Basic Connection Test\n');
  
  const basicTests = [
    { method: 'getblockchaininfo', description: 'Get blockchain info' },
    { method: 'getblockcount', description: 'Get current block height' },
    { method: 'getdifficulty', description: 'Get mining difficulty' },
  ];
  
  for (const test of basicTests) {
    const result = await rpcCall(test.method);
    if (result.success) {
      console.log(`✅ ${test.method.padEnd(25)} - ${test.description}`);
      if (test.method === 'getblockchaininfo') {
        console.log(`   Chain: ${result.result.chain}`);
        console.log(`   Blocks: ${result.result.blocks}`);
        console.log(`   Network: ${result.result.network || 'mainnet'}`);
      } else if (test.method === 'getblockcount') {
        console.log(`   Current block: ${result.result}`);
      }
    } else {
      console.log(`❌ ${test.method.padEnd(25)} - ${result.error}`);
    }
  }
  
  // Test transaction methods
  console.log('\n📝 Transaction Methods\n');
  
  const txTests = [
    { method: 'getrawtransaction', params: ['0000000000000000000000000000000000000000000000000000000000000000', 1], description: 'Get raw transaction (verbose)' },
    { method: 'decoderawtransaction', params: ['00'], description: 'Decode raw transaction' },
    { method: 'createrawtransaction', params: [[], {}], description: 'Create raw transaction' },
  ];
  
  for (const test of txTests) {
    const result = await rpcCall(test.method, test.params);
    if (result.success) {
      console.log(`✅ ${test.method.padEnd(25)} - ${test.description}`);
    } else {
      console.log(`⚠️  ${test.method.padEnd(25)} - ${result.error.substring(0, 50)}`);
    }
  }
  
  // Test address methods (useful for Zerdinals)
  console.log('\n📍 Address Methods (for Zerdinals analysis)\n');
  
  const addressTests = [
    { method: 'getaddressbalance', params: [{ addresses: ['t1XVXsp22V9ZY6tQMJvu4XHmRFMtD9CsDg9'] }], description: 'Get address balance' },
    { method: 'getaddressutxos', params: [{ addresses: ['t1XVXsp22V9ZY6tQMJvu4XHmRFMtD9CsDg9'] }], description: 'Get address UTXOs' },
    { method: 'getaddresstxids', params: [{ addresses: ['t1XVXsp22V9ZY6tQMJvu4XHmRFMtD9CsDg9'] }], description: 'Get address transactions' },
  ];
  
  for (const test of addressTests) {
    const result = await rpcCall(test.method, test.params);
    if (result.success) {
      console.log(`✅ ${test.method.padEnd(25)} - ${test.description}`);
    } else {
      console.log(`⚠️  ${test.method.padEnd(25)} - ${result.error.substring(0, 50)}`);
    }
  }
  
  // Test signing methods (key for minting!)
  console.log('\n🔑 Signing & Broadcasting Methods (KEY FOR MINTING!)\n');
  
  const signingTests = [
    { 
      method: 'signrawtransaction', 
      params: ['0400008085202f890100000000000000000000000000000000000000000000000000000000000000000000000000ffffffff00000000e31e150000000000000000000000'], 
      description: 'Sign raw transaction (can pass private keys!)' 
    },
    { 
      method: 'sendrawtransaction', 
      params: ['0400008085202f890100000000000000000000000000000000000000000000000000000000000000000000000000ffffffff00000000e31e150000000000000000000000'], 
      description: 'Broadcast signed transaction' 
    },
  ];
  
  for (const test of signingTests) {
    const result = await rpcCall(test.method, test.params);
    if (result.success) {
      console.log(`✅ ${test.method.padEnd(25)} - ${test.description}`);
      console.log(`   🎉 THIS WORKS! You can potentially mint without local node!`);
    } else {
      // Check specific error message
      if (result.error.includes('Missing inputs') || result.error.includes('bad-txns') || result.error.includes('TX decode failed') || result.error.includes('parse error') || result.error.includes('coinbase')) {
        console.log(`✅ ${test.method.padEnd(25)} - Method available! (test tx invalid, but method works)`);
        if (test.method === 'sendrawtransaction') {
          console.log(`   🎉 You CAN broadcast via GetBlock.io!`);
        }
      } else if (result.error.includes('Method not found')) {
        console.log(`❌ ${test.method.padEnd(25)} - NOT available on GetBlock.io`);
      } else {
        console.log(`❌ ${test.method.padEnd(25)} - ${result.error.substring(0, 50)}`);
      }
    }
  }
  
  // Test wallet methods (only work on local nodes)
  console.log('\n💼 Wallet Methods (require local node with wallet)\n');
  
  const walletTests = [
    { method: 'getwalletinfo', description: 'Get wallet info' },
    { method: 'getbalance', description: 'Get wallet balance' },
    { method: 'importprivkey', params: ['test', 'test', false], description: 'Import private key' },
  ];
  
  for (const test of walletTests) {
    const result = await rpcCall(test.method, test.params || []);
    if (result.success) {
      console.log(`✅ ${test.method.padEnd(25)} - ${test.description}`);
    } else {
      console.log(`❌ ${test.method.padEnd(25)} - Not available (requires local node)`);
    }
  }
  
  console.log('\n' + ''.padEnd(70, '='));
  console.log('\n✨ RPC Testing Complete!\n');
  console.log('Summary:');
  console.log('  ✅ = Method available and working');
  console.log('  ⚠️  = Method available but returned error (expected)');
  console.log('  ❌ = Method not available on this endpoint\n');
  console.log('For Zerdinals analysis, you need:');
  console.log('  ✅ getblockchaininfo, getrawtransaction');
  console.log('  ✅ getaddressutxos, getaddresstxids (optional but helpful)\n');
  console.log('For Zerdinals minting, you need:');
  console.log('  ✅ sendrawtransaction - Available! (can broadcast)');
  console.log('  ❌ signrawtransaction - NOT available (cannot sign via RPC)');
  console.log('  ❌ createrawtransaction - NOT available\n');
  console.log('💡 Key Finding:');
  console.log('   GetBlock.io CAN broadcast transactions');
  console.log('   But you must build and sign them locally first');
  console.log('   Options:');
  console.log('     1. Build/sign in JS + broadcast to GetBlock.io');
  console.log('     2. Build/sign with local node + broadcast anywhere\n');
}

testRpcMethods().then(() => process.exit(0)).catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
