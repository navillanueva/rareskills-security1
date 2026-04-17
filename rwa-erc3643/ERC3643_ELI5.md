# ERC-3643 (T-REX) & RWA tokens — ELI5

## What is this in one sentence?

**ERC-3643** is a way to put **regulated “security-style” tokens** on Ethereum: they still behave like **ERC-20** for wallets and apps, but **people can’t freely send them like meme coins** unless the rules say it’s OK.

## Why does RWA (real-world asset) stuff use it?

If you tokenize something like **a fund share, a bond, or a building slice**, the law usually cares about **who is allowed to own it**, **how many people can own it**, and **whether you can move it to random addresses**.

Normal ERC-20 says: “If you have tokens, you can transfer.”  
ERC-3643 says: “Transfers must pass **identity + compliance** checks first.”

## The LEGO pieces (the mental model)

Think of three helpers plus the token:

1. **Token (ERC-3643 / T-REX style)**  
   The ERC-20, but every `transfer` asks: “Is this allowed right now?”

2. **Identity registry (“who is allowed to play?”)**  
   In real ERC-3643 this connects to **on-chain identities** and **claims** (like KYC facts signed by trusted issuers).  
   In our simplified repo, it’s a **tiny allowlist**: an address is either **verified** or not.

3. **Compliance (“what are the extra rules?”)**  
   Examples in the real world: **max tokens per wallet**, **country rules**, **holder counts**, lockups, etc.  
   In our simplified repo, it’s one example rule: **cap how much one wallet can hold**.

4. **Agents + issuer controls**  
   **Owner** appoints **agents** (operations team). Agents can do regulated actions like **mint**, **burn**, or **forced transfers** (recovery / legal workflows), depending on the design.

## What happens on a normal transfer? (story time)

Alice wants to send tokens to Bob.

1. **Paused?** If the issuer paused the token (emergency / maintenance), stop.  
2. **Frozen?** If Alice or Bob is frozen, stop.  
3. **Verified?** Bob (and Alice) must be “allowed investors” in the identity registry.  
4. **Compliance?** The compliance module checks extra rules (like per-wallet limits).  
5. If everything passes, the token moves — and compliance may get a **hook** (`transferred`) for bookkeeping / analytics.

## Why is “mint” and “forced transfer” special?

In ERC-3643’s design, **minting** and **forced transfers** are **issuer/agent paths**. They still care about **who receives tokens** (receiver should be eligible), but they **don’t have to satisfy the same `canTransfer` rules** as a normal investor-to-investor transfer.

**Burn** is also special: it’s often treated as an **issuer/admin operation** that can bypass many checks (still dangerous if misused — that’s why roles matter).

## How this repo maps to the real standard

This folder is a **small teaching version**:

- `interfaces/IERC3643Minimal.sol` — the *idea* of Agent / Identity / Compliance interfaces.  
- `SimpleIdentityRegistry.sol` — pretend “KYC passed” = `setVerified(...)`.  
- `SimpleCompliance.sol` — one global rule: **max balance per wallet**.  
- `ERC3643RwaToken.sol` — ERC-20 + pause/freeze + agent mint/burn/forced transfer + checks on `transfer`.

The **real** ERC-3643 ecosystem (Tokeny T-REX, ONCHAINID claims, trusted issuers registries, etc.) is **much bigger** — use this to learn the *shape* of the system, not as a copy-paste for production.

## Deploy order (because of circular addresses)

1. Deploy `SimpleIdentityRegistry`  
2. Deploy `ERC3643RwaToken(name, symbol, registry)`  
3. Deploy `SimpleCompliance(tokenAddress, maxPerWallet)`  
4. Call `token.setCompliance(compliance)`  
5. `registry.setVerified(investor, true)` for each allowed wallet  
6. Optional: `token.addAgent(treasuryOps)` for extra operators

## Quick glossary

- **RWA**: “real-world asset” — something off-chain (or hybrid) represented on-chain.  
- **T-REX**: the implementation family behind **ERC-3643**.  
- **Permissioned ERC-20**: ERC-20 interface, but transfers are **gated** by rules.  
- **Agent**: operational role that can do regulated maintenance actions (mint/burn/forced transfer in our demo).
