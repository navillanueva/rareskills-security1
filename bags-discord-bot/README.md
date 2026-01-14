# Bags.fun Fee Claim Monitor

Monitors 100+ Bags.fun tokens and alerts Discord when creators claim fees.

## AWS Deployment (Amazon Linux 2023)

### 1. Install Node.js

```bash
# Install Node.js 18+
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Verify installation
node --version
npm --version
```

### 2. Clone and Setup

```bash
# Clone repo
git clone https://github.com/navillanueva/rareskills-security1.git
cd rareskills-security1/bags-discord-bot

# Install dependencies
npm install
```

### 3. Run with PM2 (keeps it running)

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the bot
pm2 start index.js --name bags-monitor

# Save PM2 config
pm2 save

# Setup PM2 to start on reboot
pm2 startup
# Follow the command it gives you (will use sudo)

# Check status
pm2 status
pm2 logs bags-monitor
```

### 4. Useful PM2 Commands

```bash
# View logs
pm2 logs bags-monitor

# View real-time logs
pm2 logs bags-monitor --lines 100

# Restart bot
pm2 restart bags-monitor

# Stop bot
pm2 stop bags-monitor

# Delete from PM2
pm2 delete bags-monitor

# Monitor CPU/Memory
pm2 monit
```

## Local Testing

```bash
npm install
node index.js
```

## What It Does

- ✅ Monitors **100+ tokens** with lifetime fee data
- ✅ Checks every **5 seconds** for new claims
- ✅ Sends **instant Discord alert** when fees are claimed
- ✅ Sends **"gooning" message** if no claims for 1 hour
- ✅ Shows token stats, creator info, and claim amounts

## Features

### Claim Alerts
When a creator claims fees:
```
🚨 FEE CLAIM DETECTED!
Creator just claimed X SOL from TOKEN
```

### Hourly Gooning Alert
If no claims for 1 hour:
```
😴 Everybody must be gooning...
No claims in the past hour
```

## Configuration

Edit `index.js` to change:
- `POLL_INTERVAL` - Check frequency (default: 5 seconds)
- `DISCORD_WEBHOOK_URL` - Your Discord webhook

## Requirements

- Node.js 16+
- Internet connection
- Discord webhook URL

## Monitoring on AWS

```bash
# View bot logs
pm2 logs bags-monitor

# Check resource usage
top

# Check disk space
df -h

# System updates (periodically)
sudo yum update -y
```

## Troubleshooting

### Bot not starting
```bash
pm2 logs bags-monitor --lines 50
```

### High CPU/Memory
```bash
pm2 monit
# If needed, restart: pm2 restart bags-monitor
```

### Network issues
```bash
# Test APIs
curl https://datapi.jup.ag/v1/assets/toptraded/24h?launchpads=bags.fun&limit=15
curl https://api2.bags.fm/api/v1/token-launch/top-tokens/lifetime-fees
```

### Update bot code
```bash
# Pull latest changes
git pull

# Restart bot
pm2 restart bags-monitor
```

## License

MIT
