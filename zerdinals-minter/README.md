# Zerdinals Transaction Builder

Tools for analyzing and creating Zerdinals (ZRC-20) inscriptions on Zcash.

## 📋 What Are Zerdinals?

Zerdinals are Zcash inscriptions similar to Bitcoin Ordinals. They use a **commit/reveal pattern** where inscription data is embedded in the **scriptSig** of a transaction.

### Inscription Format

```json
{
  "p": "zrc-20",
  "op": "mint",
  "tick": "ZERO",
  "amt": "1000"
}
```

This JSON is embedded in the **scriptSig** (unlocking script) of the reveal transaction:

```
[length] "ord" [mime_type] [inscription_json] [signature] [redeem_script]
```

Example from real transaction:
```
036f7264              → "ord" marker
51106170706c69...    → "application/json"
00                    → separator
357b2270223a...      → {"p":"zrc-20","op":"mint","tick":"ZERO","amt":"1000"}
473044022027...      → ECDSA signature
012921032dcd...      → public key + redeem script
```

## 🔧 What's In This Repo

### Analysis Tools (Working ✅)

- **`bot.js analyze <txid>`** - Decode any Zcash transaction
- **`test-rpc.js`** - Test GetBlock.io RPC capabilities

### Configuration

- **`env.example`** - Template for your environment variables
- **`package.json`** - Node.js dependencies

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp env.example .env
```

Edit `.env`:
```bash
ZCASH_RPC_URL=https://go.getblock.io/YOUR_ACCESS_TOKEN/
ZCASH_PRIVATE_KEY=your_wif_private_key
ZCASH_ADDRESS=your_zcash_address
```

### 3. Test RPC Connection

```bash
node test-rpc.js
```

### 4. Analyze Transactions

```bash
# Analyze a Zerdinals transaction
node bot.js analyze 4c05c7a8132ff482621eabe3ffba0d3126696a010d70cb5a5b655cdd931864dc
```

## 📝 How to Create & Send Zerdinals Transactions

### The Challenge

To create a Zerdinals inscription, you need to:

1. **Build commit transaction** - Creates P2SH output
2. **Build reveal transaction** - Spends commit with inscription in scriptSig
3. **Sign transactions** - Sign with your private key
4. **Broadcast** - Send to Zcash network

**The Problem:** 
- ✅ GetBlock.io can **broadcast** (`sendrawtransaction`)
- ❌ GetBlock.io cannot **sign** (`signrawtransaction` not available)
- ❌ No good JavaScript library for Zcash Sapling transactions

### The Solution: Three Approaches

#### Option 1: Manual with zcash-cli 🔨

If you have `zcashd` installed locally:

```bash
# 1. Get your UTXOs (from GetBlock.io or local)
node bot.js analyze <your_address>

# 2. Create commit transaction
zcash-cli createrawtransaction \
  '[{"txid":"utxo_txid","vout":0}]' \
  '{"t3P2SH_ADDRESS":0.0051}'

# 3. Sign it
zcash-cli signrawtransaction <raw_hex>

# 4. Broadcast (can use GetBlock.io!)
curl -X POST https://go.getblock.io/YOUR_TOKEN/ \
  -d '{"jsonrpc":"1.0","method":"sendrawtransaction","params":["<signed_hex>"]}'

# 5. Create reveal transaction (spends commit output)
zcash-cli createrawtransaction \
  '[{"txid":"commit_txid","vout":0}]' \
  '{"YOUR_ADDRESS":0.0001}'

# 6. Sign with inscription data in scriptSig
# (This is complex - requires custom script construction)
```

#### Option 2: Cloud Server ☁️ **Recommended**

Set up a small Linux VPS ($5/month) with zcashd:

1. **Get VPS** - Digital Ocean, AWS, etc.
2. **Install zcashd** (works great on Linux x86_64)
   ```bash
   # On Ubuntu
   wget https://z.cash/downloads/zcash-linux64.tar.gz
   tar xzf zcash-linux64.tar.gz
   sudo cp zcash-*/bin/* /usr/local/bin/
   ```
3. **Configure & start**
   ```bash
   zcashd -daemon -rpcuser=user -rpcpassword=pass
   zcash-cli importprivkey YOUR_WIF_KEY
   ```
4. **Use remotely** - Connect from your local machine
   ```bash
   # Set in .env:
   LOCAL_ZCASH_RPC=http://user:pass@your-vps-ip:8232/
   ```

#### Option 3: Wait for Official Sites 🌐

Official Zerdinals minting interfaces may come back online:
- https://mint.zerdinals.com (currently down)
- https://zinc.is (alternative protocol)

### Transaction Structure

#### Commit Transaction (Step 1)
```javascript
{
  inputs: [
    { txid: "your_utxo", vout: 0 }
  ],
  outputs: [
    {
      address: "t3P2SH_address",  // Special P2SH output
      amount: 0.0051              // Will be spent in reveal
    },
    {
      address: "your_address",    // Change
      amount: remaining
    }
  ]
}
```

#### Reveal Transaction (Step 2)
```javascript
{
  inputs: [
    {
      txid: "commit_txid",
      vout: 0,
      scriptSig: [
        "ord",                    // Protocol marker
        "application/json",       // MIME type
        inscription_json,         // Your ZRC-20 data
        signature,                // ECDSA signature
        redeem_script            // P2SH redeem script
      ]
    }
  ],
  outputs: [
    {
      address: "your_address",    // Receives inscribed satoshi
      amount: 0.0001
    }
  ]
}
```

## 📊 What GetBlock.io Provides

Based on `test-rpc.js` results:

### Available ✅
- `getblockchaininfo` - Blockchain status
- `getrawtransaction` - Get transaction data
- `getaddressutxos` - Get UTXOs for address
- `getaddresstxids` - Get all transactions for address
- `sendrawtransaction` - **Broadcast signed transactions**

### Not Available ❌
- `createrawtransaction` - Build transactions
- `signrawtransaction` - Sign with private key
- `importprivkey` - Import keys
- `decoderawtransaction` - Decode transaction (use verbose mode instead)

## 🎯 Practical Workflow

### For Analysis (Works Now)

```bash
# Analyze any Zerdinals transaction
node bot.js analyze <txid>

# Test your RPC connection
node test-rpc.js

# Understand the transaction structure
# Look at scriptSig for inscription data
```

### For Minting (Requires zcashd)

```bash
# Need zcashd installed (local or cloud)

# 1. Create commit transaction
zcash-cli createrawtransaction ...

# 2. Sign commit
zcash-cli signrawtransaction ...

# 3. Broadcast commit
curl GetBlock.io sendrawtransaction

# 4. Create reveal with inscription
# (Custom scriptSig construction)

# 5. Sign reveal
zcash-cli signrawtransaction ...

# 6. Broadcast reveal
curl GetBlock.io sendrawtransaction
```

## 🔍 Example: Analyzing a Real Zerdinals Mint

```bash
# Commit transaction
node bot.js analyze d2f017de80f338ca9cfcaf9c688781968d0d85790a8d23d5b34f6a7c3557d3d9

# Shows:
# - 5 outputs
# - Output 0: P2SH address (t3P7s...) - The special commitment
# - Outputs 1-3: Small dust amounts
# - Output 4: Change back to wallet

# Reveal transaction (contains inscription)
node bot.js analyze 4c05c7a8132ff482621eabe3ffba0d3126696a010d70cb5a5b655cdd931864dc

# Shows:
# - Input spends commit output 0
# - scriptSig contains inscription: {"p":"zrc-20","op":"mint","tick":"ZERO","amt":"999"}
# - Output: 0.0001 ZEC to address (the inscribed satoshi)
```

## 📚 ZRC-20 Operations

### Deploy Token
```json
{
  "p": "zrc-20",
  "op": "deploy",
  "tick": "ZYNC",
  "max": "21000000",
  "lim": "1000"
}
```

### Mint Token
```json
{
  "p": "zrc-20",
  "op": "mint",
  "tick": "ZERO",
  "amt": "1000"
}
```

### Transfer Token
```json
{
  "p": "zrc-20",
  "op": "transfer",
  "tick": "ZERO",
  "amt": "100",
  "to": "t1RecipientAddress"
}
```

## 🛠️ Technical Details

### Why This Is Complex

1. **Zcash Sapling Transactions** are different from Bitcoin:
   - Version 4 (not version 1/2)
   - Version group ID: `0x892f2085`
   - Expiry height field
   - Different signature hash (Blake2b, not SHA256)

2. **No JavaScript Libraries**:
   - Bitcoin has `bitcoinjs-lib` (mature, well-tested)
   - Zcash has no equivalent for Sapling v4 transactions

3. **P2SH Scripts**:
   - Commit output uses custom P2SH script
   - Redeem script must allow inscription data before signature
   - Complex script construction

### Why You Need zcashd

The `zcashd` daemon handles:
- ✅ Zcash Sapling transaction building
- ✅ Proper signature hash computation
- ✅ P2SH script creation
- ✅ ECDSA signing with your private key
- ✅ Transaction serialization

**Without it**, you'd need to implement all of this in JavaScript (~500+ lines of complex crypto code).

## 🚀 Next Steps

### To Just Analyze

You're all set! Use:
```bash
node bot.js analyze <txid>
node test-rpc.js
```

### To Mint

1. **Option A**: Set up cloud server with zcashd (recommended)
2. **Option B**: Build zcashd from source locally (~2-3 hours)
3. **Option C**: Wait for official sites to return

See individual files for details on each approach.

## 📖 Resources

- Zcash RPC Docs: https://zcash.github.io/rpc/
- GetBlock.io: https://getblock.io/
- Zinc Protocol: https://docs.zinc.is/docs/protocols/zrc20
- Bitcoin Ordinals: https://docs.ordinals.com/ (similar concept)

## 📄 License

MIT

---

**TL;DR:** 
- ✅ Analysis tools work great
- ✅ GetBlock.io can broadcast transactions
- ❌ Need zcashd to sign (no JS library exists)
- 💡 Best solution: Small cloud server with zcashd
