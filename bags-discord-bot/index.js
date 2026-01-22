require('dotenv').config();
const fetch = require('node-fetch');

// Configuration
const TARGET_TOKEN = 'Gc8VdRoCtset6SFErLKBcV5e4Ew8XwnTDYbtYXFTBAGS'; // Specific token to monitor
const JUPITER_SEARCH_URL = `https://datapi.jup.ag/v1/assets/search?query=${TARGET_TOKEN}`;
const BAGS_ALL_TOKENS_URL = 'https://api2.bags.fm/api/v1/token-launch/top-tokens/lifetime-fees';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const POLL_INTERVAL = 5000; // 5 seconds for claim monitoring
const HOUR_IN_MS = 3600000; // 1 hour in milliseconds

// Validate configuration
if (!DISCORD_WEBHOOK_URL) {
  console.error('❌ DISCORD_WEBHOOK_URL not set in .env file!');
  process.exit(1);
}

// Track claimed amounts for each token/creator
const claimedAmountsTracker = new Map();

// Track which creators have already had their FIRST claim alerted
const firstClaimAlerted = new Set();

// Track time of last claim and last gooning message
let lastClaimTime = Date.now();
let lastGooningMessageTime = 0;
let isFirstRun = true;

// Fetch token info from Jupiter
async function fetchJupiterTokenInfo() {
  try {
    const response = await fetch(JUPITER_SEARCH_URL);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data[0]; // Returns array, take first result
  } catch (error) {
    console.error(`   ❌ Jupiter error:`, error.message);
    return null;
  }
}

// Fetch creator/claim data from Bags.fm
async function fetchBagsCreatorData() {
  try {
    const response = await fetch(BAGS_ALL_TOKENS_URL);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    const tokens = data.response || data;
    
    // Find our target token in the list
    const targetToken = tokens.find(t => t.token === TARGET_TOKEN);
    return targetToken;
  } catch (error) {
    console.error(`   ❌ Bags.fm error:`, error.message);
    return null;
  }
}

// Fetch complete target token data
async function fetchTargetTokenData() {
  try {
    console.log(`[${new Date().toISOString()}] 🎯 Fetching token data...`);
    
    const [jupiterData, bagsData] = await Promise.all([
      fetchJupiterTokenInfo(),
      fetchBagsCreatorData()
    ]);
    
    if (!jupiterData) {
      console.log(`   ⚠️  Token not found in Jupiter`);
      return null;
    }
    
    console.log(`   ✅ Found: ${jupiterData.symbol} - ${jupiterData.name}`);
    
    // Combine data
    const tokenData = {
      tokenInfo: jupiterData,
      creators: bagsData?.creators || [],
      lifetimeFees: bagsData ? parseFloat(bagsData.lifetimeFees) : '0'
    };
    
    if (!bagsData) {
      console.log(`   ⚠️  Not in top 100 by fees yet - creator data unavailable`);
    } else {
      console.log(`   ✅ Has creator data from Bags.fm`);
    }
    
    return tokenData;
  } catch (error) {
    console.error(`   ❌ Error:`, error.message);
    throw error;
  }
}


// Build token data for specific target token
async function buildTokenData() {
  try {
    // Fetch target token
    const data = await fetchTargetTokenData();
    
    if (!data) {
      console.log(`   ⚠️  Target token not available\n`);
      return null;
    }
    
    const tokenInfo = data.tokenInfo;
    const token = {
      address: TARGET_TOKEN,
      symbol: tokenInfo?.symbol || 'Unknown',
      name: tokenInfo?.name || 'Unknown',
      icon: tokenInfo?.icon,
      price: tokenInfo?.usdPrice || 0,
      marketCap: tokenInfo?.mcap || 0,
      liquidity: tokenInfo?.liquidity || 0,
      volume24h: tokenInfo?.stats24h ? 
        (tokenInfo.stats24h.buyVolume + tokenInfo.stats24h.sellVolume) : 0,
      priceChange24h: tokenInfo?.stats24h?.priceChange || 0,
      lifetimeFees: parseFloat(data.lifetimeFees || 0) / 1e9,
      creators: data.creators || []
    };
    
    // Log token information
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`🎯 MONITORING: ${token.symbol} - ${token.name}`);
    console.log('═══════════════════════════════════════════════════════════════════\n');
    
    console.log(`   Contract: ${token.address}`);
    console.log(`   Symbol: ${token.symbol}`);
    console.log(`   Name: ${token.name}`);
    console.log(`   Price: $${token.price?.toFixed(8) || 'N/A'}`);
    console.log(`   Market Cap: $${token.marketCap?.toLocaleString() || 'N/A'}`);
    console.log(`   Lifetime Fees: ${token.lifetimeFees.toFixed(4)} SOL`);
    
    if (token.creators.length > 0) {
      const mainDev = token.creators.find(c => c.royaltyBps > 0) || token.creators[0];
      
      if (mainDev) {
        const twitter = mainDev.username || mainDev.twitterUsername || 'N/A';
        const claimed = parseFloat(mainDev.totalClaimed || 0) / 1e9;
        const hasClaimed = claimed > 0;
        
        console.log(`   Creator Twitter: ${twitter}`);
        console.log(`   Claimed: ${hasClaimed ? `✅ ${claimed.toFixed(4)} SOL` : '⏳ Not yet claimed'}`);
      }
    } else {
      console.log(`   ⚠️  No creator data (not in top 100 by fees)`);
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════════\n');
    
    return token; // Return token data
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error building token data:`, error.message);
    throw error;
  }
}

// Check for new fee claims
function checkForNewClaims(token) {
  const newClaims = [];
  
  if (!token || !token.creators || token.creators.length === 0) {
    return newClaims;
  }
  
  token.creators.forEach(creator => {
    
  const claimed = parseFloat(creator.totalClaimed || 0) / 1e9; // Convert from lamports
  
  // FILTER 1: Only track creators with royalties (the main dev getting paid)
  const hasRoyalties = creator.royaltyBps > 0;
  
  if (!hasRoyalties) {
    return; // Skip non-royalty holders
  }
  
  // Create unique key for this creator/token combo
  const key = `${token.address}-${creator.wallet}`;
  const previousClaimed = claimedAmountsTracker.get(key) || 0;
  
  // Check if there's a FIRST claim (previousClaimed === 0 and now has claimed)
  if (previousClaimed === 0 && claimed > 0) {
    newClaims.push({
      token: token,
      creator: creator,
      previousClaimed: 0,
      newClaimed: claimed,
      claimAmount: claimed,
      isFirstClaim: true
    });
    
    console.log(`   🚨 FIRST CLAIM DETECTED!`);
    console.log(`      Token: ${token.symbol} (${token.name})`);
    console.log(`      Creator: ${creator.username || creator.twitterUsername || creator.wallet.substring(0, 8)}`);
    console.log(`      Claimed: ${claimed.toFixed(4)} SOL`);
    console.log(`      ⭐ This is their FIRST EVER claim!`);
    
    // Update last claim time
    lastClaimTime = Date.now();
  }
  
  // Update tracker
  claimedAmountsTracker.set(key, claimed);
});
  
  return newClaims;
}


// Send claim alert to Discord
async function sendClaimAlert(claims) {
  try {
    console.log(`[${new Date().toISOString()}] 🚨 Sending claim alerts to Discord...`);
    
    for (const claim of claims) {
      const token = claim.token;
      const creator = claim.creator;
      
      const payload = {
        embeds: [{
          title: '🚨 FIRST FEE CLAIM DETECTED!',
          description: `**${creator.username || creator.twitterUsername || 'Creator'}** just claimed fees for the FIRST TIME!`,
          color: 0xff0000,
          fields: [
            {
              name: '💎 Token',
              value: `${token.symbol} - ${token.name}`,
              inline: false
            },
            {
              name: '💰 Claim Amount',
              value: `**${claim.claimAmount.toFixed(4)} SOL**`,
              inline: true
            },
            {
              name: '📊 Total Claimed',
              value: `${claim.newClaimed.toFixed(4)} SOL`,
              inline: true
            },
            {
              name: '👤 Creator',
              value: creator.username || creator.twitterUsername || `${creator.wallet.substring(0, 8)}...`,
              inline: true
            },
            {
              name: '🔗 Token Contract Address',
              value: `\`${token.address}\``,
              inline: false
            },
            {
              name: '👤 Creator Wallet',
              value: `\`${creator.wallet}\``,
              inline: false
            },
            {
              name: '📈 Token Stats',
              value: `Price: $${token.price?.toFixed(8) || 'N/A'}\n` +
                     `Market Cap: $${token.marketCap?.toLocaleString() || 'N/A'}\n` +
                     `24h Volume: $${token.volume24h?.toLocaleString() || 'N/A'}\n` +
                     `Liquidity: $${token.liquidity?.toLocaleString() || 'N/A'}\n` +
                     `Lifetime Fees: ${token.lifetimeFees?.toFixed(2) || 'N/A'} SOL`,
              inline: false
            }
          ],
          thumbnail: {
            url: token.icon || creator.pfp || 'https://bags.fun/favicon.ico'
          },
          footer: {
            text: `Token: ${token.address.substring(0, 16)}...`
          },
          timestamp: new Date().toISOString()
        }]
      };
      
      const response = await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      console.log(`   ✅ Alert sent for ${token.symbol} claim`);
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
  } catch (error) {
    console.error(`   ❌ Error sending alerts:`, error.message);
  }
}

// Send "gooning" message if no claims in past hour
async function sendGooningMessage() {
  try {
    const minutesSinceLastClaim = Math.floor((Date.now() - lastClaimTime) / 60000);
    
    const payload = {
      embeds: [{
        title: '😴 Everybody must be gooning...',
        description: '**No claims in the past hour**',
        color: 0xffaa00,
        fields: [
          {
            name: '⏰ Last Claim',
            value: new Date(lastClaimTime).toLocaleString(),
            inline: false
          },
          {
            name: '🕐 Time Since Last Claim',
            value: `${minutesSinceLastClaim} minutes`,
            inline: false
          }
        ],
        footer: {
          text: 'Monitoring continues every 5 seconds...'
        },
        timestamp: new Date().toISOString()
      }]
    };
    
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    console.log(`   😴 "Gooning" message sent (${minutesSinceLastClaim} min since last claim)`);
    lastGooningMessageTime = Date.now();
  } catch (error) {
    console.error(`   ❌ Error:`, error.message);
  }
}

// Check if should send hourly gooning message
async function checkAndSendGooningMessage() {
  const timeSinceLastClaim = Date.now() - lastClaimTime;
  const timeSinceLastGooningMessage = Date.now() - lastGooningMessageTime;
  
  // Only send gooning message if:
  // 1. Been over an hour since last claim
  // 2. Been over an hour since last gooning message (avoid spam)
  if (timeSinceLastClaim > HOUR_IN_MS && timeSinceLastGooningMessage > HOUR_IN_MS) {
    await sendGooningMessage();
  }
}

// Main monitoring loop
async function monitorFees() {
  try {
    // Get target token data
    const token = await buildTokenData();
    
    if (!token) {
      console.log(`[${new Date().toISOString()}] ⚠️  Target token not in top 100, skipping...\n`);
      return;
    }
    
    // Skip sending any messages on first run (just establish baseline)
    if (isFirstRun) {
      console.log(`   📝 First run - establishing baseline (no Discord messages)\n`);
      isFirstRun = false;
      
      // Check for new claims to populate tracker
      checkForNewClaims(token);
      
      console.log(`[${new Date().toISOString()}] ✅ Baseline established\n`);
      return;
    }
    
    // Check for FIRST claim
    const newClaims = checkForNewClaims(token);
    
    // If there's a FIRST claim, send alert
    if (newClaims.length > 0) {
      console.log(`\n🎯 FIRST CLAIM DETECTED!\n`);
      await sendClaimAlert(newClaims);
    } else {
      console.log(`   ℹ️  No first claim yet (still monitoring...)`);
      
      // Check if should send hourly gooning message
      await checkAndSendGooningMessage();
    }
    
    console.log(`[${new Date().toISOString()}] ✅ Monitoring cycle completed\n`);
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Monitoring cycle failed:`, error.message, '\n');
  }
}

// Start the service
console.log('🚀 Starting Bags.fun Fee Claim Monitor...');
console.log(`🎯 Monitoring specific token: ${TARGET_TOKEN}`);
console.log(`🚨 Will alert on Discord on FIRST claim by creator`);
console.log(`😴 Will send "gooning" message if no claims for 1 hour`);
console.log(`⏱️  Check interval: ${POLL_INTERVAL / 1000} seconds\n`);
console.log(''.padEnd(70, '='));
console.log('');

// Run immediately on start
monitorFees();

// Then run every minute
setInterval(monitorFees, POLL_INTERVAL);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down gracefully...');
  console.log(`📊 Tracked ${claimedAmountsTracker.size} creator/token combinations`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Shutting down gracefully...');
  process.exit(0);
});
