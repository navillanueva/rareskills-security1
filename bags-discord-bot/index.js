const fetch = require('node-fetch');

// Configuration
const JUPITER_API_URL = 'https://datapi.jup.ag/v1/assets/toptraded/24h?launchpads=bags.fun&limit=15';
const BAGS_FEES_API_URL = 'https://api2.bags.fm/api/v1/token-launch/top-tokens/lifetime-fees';
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1431268776380334091/k9ImqNKCoShKplz70X6SWkl1wkUjOKdnsr3hoRC8nFcmJ8oL4rNv-EKzNAzsPludksKD';
const POLL_INTERVAL = 5000; // 5 seconds for claim monitoring
const HOUR_IN_MS = 3600000; // 1 hour in milliseconds

// Track claimed amounts for each token/creator
const claimedAmountsTracker = new Map();

// Track time of last claim
let lastClaimTime = Date.now();

// Fetch top traded tokens from Jupiter
async function fetchTopTradedTokens() {
  try {
    console.log(`[${new Date().toISOString()}] 📊 Fetching top 15 traded tokens...`);
    const response = await fetch(JUPITER_API_URL);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const tokens = await response.json();
    console.log(`   ✅ Got ${tokens.length} tokens`);
    return tokens;
  } catch (error) {
    console.error(`   ❌ Error:`, error.message);
    throw error;
  }
}

// Fetch lifetime fees from Bags.fm
async function fetchLifetimeFees() {
  try {
    console.log(`[${new Date().toISOString()}] 💰 Fetching lifetime fees data...`);
    const response = await fetch(BAGS_FEES_API_URL);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    const tokens = data.response || data;
    console.log(`   ✅ Got fee data for ${tokens.length} tokens`);
    return tokens;
  } catch (error) {
    console.error(`   ❌ Error:`, error.message);
    throw error;
  }
}

// Cross-reference tokens and build complete data
async function buildCompleteTokenData() {
  try {
    // Fetch both datasets
    const [topTraded, feesData] = await Promise.all([
      fetchTopTradedTokens(),
      fetchLifetimeFees()
    ]);
    
    console.log(`[${new Date().toISOString()}] 🔗 Cross-referencing token data...\n`);
    
    // Create a map of trading data by token address (for enrichment)
    const tradingMap = new Map();
    topTraded.forEach(token => {
      tradingMap.set(token.id, token);
    });
    
    // PRIMARY: Use ALL tokens from Bags.fm (100 tokens with fee data)
    // SECONDARY: Enrich with Jupiter trading data if available
    const enrichedTokens = feesData.map(feeItem => {
      const tradingData = tradingMap.get(feeItem.token);
      const tokenInfo = feeItem.tokenInfo;
      
      return {
        address: feeItem.token,
        symbol: tokenInfo?.symbol || 'Unknown',
        name: tokenInfo?.name || 'Unknown',
        icon: tokenInfo?.icon,
        // Use Jupiter data if available, otherwise use Bags.fm data
        price: tradingData?.usdPrice || tokenInfo?.usdPrice || 0,
        marketCap: tradingData?.mcap || tokenInfo?.mcap || 0,
        liquidity: tradingData?.liquidity || tokenInfo?.liquidity || 0,
        volume24h: tradingData?.stats24h ? 
          (tradingData.stats24h.buyVolume + tradingData.stats24h.sellVolume) : 0,
        priceChange24h: tradingData?.stats24h?.priceChange || tokenInfo?.stats24h?.priceChange || 0,
        lifetimeFees: parseFloat(feeItem.lifetimeFees) / 1e9, // Convert from lamports
        creators: feeItem.creators || tokenInfo?.creators || [],
        hasFeeData: true,
        isTopTraded: !!tradingData // Flag if it's in top 15 traded
      };
    });
    
    console.log(`   ✅ Built data for ${enrichedTokens.length} tokens`);
    console.log(`   📊 ${enrichedTokens.filter(t => t.isTopTraded).length} are in top 15 traded`);
    
    return enrichedTokens;
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error building token data:`, error.message);
    throw error;
  }
}

// Check for new fee claims
function checkForNewClaims(tokens) {
  const newClaims = [];
  
  tokens.forEach(token => {
    if (!token.creators || token.creators.length === 0) return;
    
    token.creators.forEach(creator => {
      const claimed = parseFloat(creator.totalClaimed || 0) / 1e9; // Convert from lamports
      
      if (claimed === 0) return; // Skip if nothing claimed
      
      // Create unique key for this creator/token combo
      const key = `${token.address}-${creator.wallet}`;
      const previousClaimed = claimedAmountsTracker.get(key) || 0;
      
      // Check if there's a new claim
      if (claimed > previousClaimed) {
        const newClaimAmount = claimed - previousClaimed;
        
        newClaims.push({
          token: token,
          creator: creator,
          previousClaimed: previousClaimed,
          newClaimed: claimed,
          claimAmount: newClaimAmount
        });
        
        console.log(`   🚨 NEW CLAIM DETECTED!`);
        console.log(`      Token: ${token.symbol} (${token.name})`);
        console.log(`      Creator: ${creator.username || creator.wallet.substring(0, 8)}`);
        console.log(`      Claimed: ${newClaimAmount.toFixed(4)} SOL (Total: ${claimed.toFixed(4)} SOL)`);
        
        // Update last claim time
        lastClaimTime = Date.now();
      }
      
      // Update tracker
      claimedAmountsTracker.set(key, claimed);
    });
  });
  
  return newClaims;
}

// Send summary to Discord
async function sendSummaryToDiscord(tokens) {
  try {
    console.log(`[${new Date().toISOString()}] 📨 Sending summary to Discord...`);
    
    // Take top 10 for display
    const topTokens = tokens.slice(0, 10);
    
    const fields = topTokens.map((token, index) => {
      const price = token.price ? `$${token.price.toFixed(8)}` : 'N/A';
      const volume = token.volume24h > 0 ? `$${token.volume24h.toLocaleString(undefined, {maximumFractionDigits: 0})}` : 'N/A';
      const change = token.priceChange24h ? `${token.priceChange24h.toFixed(2)}%` : 'N/A';
      const fees = token.lifetimeFees > 0 ? `${token.lifetimeFees.toFixed(2)} SOL` : 'N/A';
      const claimedTotal = token.creators.reduce((sum, c) => sum + parseFloat(c.totalClaimed || 0) / 1e9, 0);
      const claimed = claimedTotal > 0 ? `${claimedTotal.toFixed(2)} SOL` : 'None';
      
      return {
        name: `${index + 1}. ${token.symbol} - ${token.name}`,
        value: `💰 Price: ${price} | 📊 Vol: ${volume}\n` +
               `📈 24h: ${change} | 💸 Fees: ${fees}\n` +
               `✅ Claimed: ${claimed}`,
        inline: false
      };
    });
    
    const payload = {
      embeds: [{
        title: '💼 Bags.fun - Top Traded Tokens (24h)',
        description: `📊 Top ${topTokens.length} tokens with lifetime fees tracking`,
        color: 0x00ff88,
        fields: fields,
        footer: {
          text: 'Bags.fun Fee Monitor | Updates every minute'
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
    
    console.log(`   ✅ Summary sent to Discord`);
  } catch (error) {
    console.error(`   ❌ Error:`, error.message);
  }
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
          title: '🚨 FEE CLAIM DETECTED!',
          description: `**${creator.username || creator.twitterUsername || 'Creator'}** just claimed fees!`,
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
              name: '🔗 Wallet',
              value: `\`${creator.wallet}\``,
              inline: false
            },
            {
              name: '📈 Token Stats',
              value: `Price: $${token.price?.toFixed(8) || 'N/A'}\n` +
                     `24h Volume: $${token.volume24h?.toLocaleString() || 'N/A'}\n` +
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
            value: `${Math.floor((Date.now() - lastClaimTime) / 60000)} minutes`,
            inline: false
          }
        ],
        footer: {
          text: 'Monitoring continues...'
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
    
    console.log(`   😴 "Gooning" message sent (no claims in past hour)`);
  } catch (error) {
    console.error(`   ❌ Error:`, error.message);
  }
}

// Send "no claims" message to Discord
async function sendNoClaimsMessage(tokens) {
  try {
    // Check if it's been over an hour since last claim
    const timeSinceLastClaim = Date.now() - lastClaimTime;
    if (timeSinceLastClaim > HOUR_IN_MS) {
      await sendGooningMessage();
      return;
    }
    
    const totalTokens = tokens.length;
    const topTradedCount = tokens.filter(t => t.isTopTraded).length;
    const totalTracked = claimedAmountsTracker.size;
    
    // Calculate total fees being monitored
    const totalFees = tokens.reduce((sum, t) => sum + (t.lifetimeFees || 0), 0);
    const totalClaimed = tokens.reduce((sum, t) => {
      return sum + t.creators.reduce((s, c) => s + parseFloat(c.totalClaimed || 0) / 1e9, 0);
    }, 0);
    
    // Get top 5 tokens by unclaimed fees
    const topUnclaimed = [...tokens]
      .map(t => ({
        ...t,
        unclaimed: t.lifetimeFees - t.creators.reduce((s, c) => s + parseFloat(c.totalClaimed || 0) / 1e9, 0)
      }))
      .sort((a, b) => b.unclaimed - a.unclaimed)
      .slice(0, 5);
    
    const unclaimedList = topUnclaimed
      .map(t => `• ${t.symbol}: ${t.unclaimed.toFixed(2)} SOL`)
      .join('\n');
    
    const payload = {
      embeds: [{
        title: '✅ No New Claims',
        description: `Monitoring ${totalTokens} tokens - no fee claims detected this cycle`,
        color: 0x00ff00,
        fields: [
          {
            name: '📊 Monitoring Stats',
            value: `Total tokens: ${totalTokens}\n` +
                   `Top 15 traded: ${topTradedCount}\n` +
                   `Creators tracked: ${totalTracked}\n` +
                   `Total fees: ${totalFees.toFixed(2)} SOL\n` +
                   `Total claimed: ${totalClaimed.toFixed(2)} SOL`,
            inline: false
          },
          {
            name: '💰 Top 5 Unclaimed Fees',
            value: unclaimedList || 'None',
            inline: false
          }
        ],
        footer: {
          text: 'Next check in 5 seconds'
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
    
    console.log(`   ✅ "No claims" message sent to Discord`);
  } catch (error) {
    console.error(`   ❌ Error:`, error.message);
  }
}

// Main monitoring loop
async function monitorFees() {
  try {
    // Build complete token data
    const tokens = await buildCompleteTokenData();
    
    // Check for new claims
    const newClaims = checkForNewClaims(tokens);
    
    // If there are new claims, send alerts
    if (newClaims.length > 0) {
      console.log(`\n🎯 Found ${newClaims.length} new claim(s)!\n`);
      await sendClaimAlert(newClaims);
    } else {
      console.log(`   ℹ️  No new claims detected\n`);
      await sendNoClaimsMessage(tokens);
    }
    
    console.log(`[${new Date().toISOString()}] ✅ Monitoring cycle completed\n`);
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Monitoring cycle failed:`, error.message, '\n');
  }
}

// Start the service
console.log('🚀 Starting Bags.fun Fee Claim Monitor...');
console.log(`💰 Monitoring 100+ tokens with lifetime fees (Bags.fm API)`);
console.log(`📡 Enriching with top 15 traded data (Jupiter API)`);
console.log(`🚨 Will alert on Discord when ANY creator claims fees`);
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
