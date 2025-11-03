# Denial of Service (DoS) Attack

## Overview

The `Denial` contract contains a **Denial of Service vulnerability** that allows an attacker to permanently prevent the owner from withdrawing funds by exploiting unbounded gas consumption in external calls.

## The Vulnerability

### Vulnerable Code

```solidity
function withdraw() public {
    uint256 amountToSend = address(this).balance / 100;
    partner.call{value: amountToSend}("");  // ⚠️ VULNERABLE
    payable(owner).transfer(amountToSend);
    // ...
}
```

### Critical Flaws

1. **Unbounded Gas** - `call()` forwards all available gas to external contract
2. **No Return Check** - Ignores whether the call succeeded or failed
3. **Wrong Order** - Owner withdrawal happens AFTER untrusted external call
4. **No Gas Limit** - Attacker can consume all gas, causing owner's transfer to fail

## Attack Mechanism

### Step-by-Step Exploit

**1. Setup**
```solidity
// Attacker deploys malicious contract
contract MaliciousPartner {
    receive() external payable {
        // Infinite loop consumes all gas
        while(true) {}
    }
}

// Attacker sets themselves as withdraw partner
denial.setWithdrawPartner(address(maliciousPartner));
```

**2. Execution**
- Owner calls `withdraw()`
- Contract sends 1% to attacker's contract
- Attacker's `receive()` enters infinite loop
- All remaining gas is consumed
- `payable(owner).transfer()` runs out of gas → **REVERTS**
- Entire transaction reverts
- Owner receives **nothing**

**3. Result**
- ✅ Attacker receives 1% fee every failed attempt (actually reverts, so no)
- ❌ Owner **cannot withdraw** - funds permanently locked
- 🔒 Contract is effectively bricked

## Impact

| Severity | Description |
|----------|-------------|
| 🔴 **Critical** | Complete denial of service for owner |
| 💰 **High** | All contract funds permanently locked |
| ⚠️ **Permanent** | No recovery mechanism exists |

## Solutions

### Fix #1: Gas Limit (Best Practice)

```solidity
function withdraw() public {
    uint256 amountToSend = address(this).balance / 100;
    
    // Limit gas to prevent DoS
    (bool success,) = partner.call{value: amountToSend, gas: 2300}("");
    require(success, "Partner transfer failed");
    
    payable(owner).transfer(amountToSend);
    timeLastWithdrawn = block.timestamp;
    withdrawPartnerBalances[partner] += amountToSend;
}
```

**Why 2300 gas?**
- Enough for a simple `receive()` or `fallback()`
- Too little for storage operations or loops
- Same limit used by `.transfer()`

### Fix #2: Use `transfer()` (Simplest)

```solidity
function withdraw() public {
    uint256 amountToSend = address(this).balance / 100;
    
    // transfer() automatically limits gas to 2300
    payable(partner).transfer(amountToSend);
    payable(owner).transfer(amountToSend);
    
    timeLastWithdrawn = block.timestamp;
    withdrawPartnerBalances[partner] += amountToSend;
}
```

**Trade-off:** `.transfer()` fails if partner cannot receive (e.g., multi-sig wallet).

### Fix #3: Reorder Operations (Defense in Depth)

```solidity
function withdraw() public {
    uint256 amountToSend = address(this).balance / 100;
    
    // Owner gets paid FIRST (can't be DoS'd)
    payable(owner).transfer(amountToSend);
    
    // Partner payment can fail without affecting owner
    (bool success,) = partner.call{value: amountToSend, gas: 2300}("");
    if (success) {
        withdrawPartnerBalances[partner] += amountToSend;
    }
    
    timeLastWithdrawn = block.timestamp;
}
```

**Advantage:** Owner withdrawal cannot be blocked, even if partner is malicious.

### Fix #4: Pull Payment Pattern (Advanced)

```solidity
mapping(address => uint256) public pendingWithdrawals;

function withdraw() public {
    uint256 amountToSend = address(this).balance / 100;
    
    // Record balances instead of pushing payments
    pendingWithdrawals[owner] += amountToSend;
    pendingWithdrawals[partner] += amountToSend;
    
    timeLastWithdrawn = block.timestamp;
}

function claimWithdrawal() external {
    uint256 amount = pendingWithdrawals[msg.sender];
    require(amount > 0, "Nothing to withdraw");
    
    pendingWithdrawals[msg.sender] = 0;
    payable(msg.sender).transfer(amount);
}
```

**Advantage:** Each user controls their own withdrawal, immune to DoS.

### Fix #5: Emergency Circuit Breaker

```solidity
bool public paused = false;
address public immutable OWNER;

modifier whenNotPaused() {
    require(!paused, "Contract paused");
    _;
}

function withdraw() public whenNotPaused {
    // ... normal logic
}

function emergencyPause() external {
    require(msg.sender == OWNER);
    paused = true;
}

function emergencyWithdraw() external {
    require(msg.sender == OWNER);
    require(paused, "Must be paused");
    payable(OWNER).transfer(address(this).balance);
}
```

## Defense Checklist

When making external calls:

- [ ] Set explicit gas limit (e.g., `gas: 2300`)
- [ ] Check return value: `(bool success,) = ...`
- [ ] Handle failure gracefully
- [ ] Execute critical operations BEFORE external calls
- [ ] Consider pull payment pattern for multiple recipients
- [ ] Add emergency recovery mechanism
- [ ] Test with malicious contract recipients

## Real-World Impact

### Historical Exploits

1. **GovernMental** (2016) - 1,100 ETH locked due to similar DoS
2. **King of the Ether** - Funds locked by rejecting payments
3. **Various ICOs** - Distribution mechanisms DoS'd by malicious participants

### Common Vulnerable Patterns

```solidity
// ❌ Vulnerable: Unbounded external call
for (uint i = 0; i < recipients.length; i++) {
    recipients[i].call{value: amount}("");  // Any recipient can DoS
}

// ❌ Vulnerable: Critical operation after external call
externalContract.doSomething();  // Malicious contract can revert
criticalStateUpdate();           // Never executes

// ❌ Vulnerable: No gas limit
winner.call{value: prize}("");   // Winner can prevent next round
```

## Testing for DoS

```solidity
// Test contract
contract DoSTest {
    Denial denial;
    
    function testDoS() public {
        // Deploy malicious partner
        MaliciousPartner attacker = new MaliciousPartner();
        
        // Set as partner
        denial.setWithdrawPartner(address(attacker));
        
        // Try to withdraw - should revert due to DoS
        vm.expectRevert();
        denial.withdraw();
    }
}

contract MaliciousPartner {
    receive() external payable {
        assembly {
            // Consume all gas
            invalid()
        }
    }
}
```

## Key Takeaways

1. **Never trust external contracts** - Always assume they're malicious
2. **Gas is a resource** - External calls can weaponize gas consumption
3. **Order matters** - Execute critical operations before external calls
4. **Defense in depth** - Use multiple protective measures
5. **Pull > Push** - Let users withdraw rather than pushing to them

## Summary

The Denial vulnerability shows how a single unbounded `call()` can permanently lock all contract funds. This is a **critical severity** issue that's simple to exploit but has devastating consequences.

**Fix:** Always limit gas for external calls or use the pull payment pattern.

---

**Severity:** 🔴 Critical  
**Likelihood:** 🟢 High (trivial to exploit)  
**Impact:** 🔴 Complete fund lockup