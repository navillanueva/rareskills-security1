# Denial of Service (DoS) Attack - Solution Explanation

## Overview 1
The `Denial` contract demonstrates a **Denial of Service (DoS) vulnerability** where an attacker can prevent the owner from withdrawing funds by consuming all available gas during the withdrawal process.

## Vulnerability Analysis

### The Problem
The vulnerability lies in the `withdraw()` function on line 19:

```solidity
partner.call{value: amountToSend}("");
```

### Key Issues:

1. **No Gas Limit**: The `call` function is used without specifying a gas limit
2. **No Return Value Check**: The function doesn't check if the call succeeded
3. **Sequential Execution**: The owner's transfer happens AFTER the partner call
4. **Unlimited Gas Consumption**: The partner can consume all available gas


## Attack Vector

### How the Attack Works:

1. **Attacker becomes partner**: The attacker calls `setWithdrawPartner()` with their malicious contract address
2. **Malicious receive function**: The attacker's contract implements a `receive()` function that consumes all available gas
3. **DoS execution**: When `withdraw()` is called:
   - The contract sends 1% to the attacker's contract
   - The attacker's `receive()` function consumes all remaining gas
   - The `payable(owner).transfer(amountToSend)` call runs out of gas and reverts
   - The owner cannot withdraw their funds

### Attack Contract Example:

```solidity
contract Attacker {
    receive() external payable {
        // Consume all available gas
        while(true) {
            // Infinite loop or expensive operations
        }
    }
}
```

## Impact

- **Complete DoS**: Owner cannot withdraw any funds
- **Fund Locking**: All contract funds become permanently locked
- **No Recovery**: No way to recover from the attack without contract upgrade

## Solution Strategies

### 1. Gas Limit Protection
```solidity
// Limit gas for external calls
(bool success,) = partner.call{value: amountToSend, gas: 2300}("");
require(success, "Partner transfer failed");
```

### 2. Use `transfer()` Instead of `call()`
```solidity
// transfer() has built-in gas limit of 2300
payable(partner).transfer(amountToSend);
```

### 3. Check Return Values
```solidity
(bool success,) = partner.call{value: amountToSend}("");
if (!success) {
    // Handle failure appropriately
    revert("Partner transfer failed");
}
```

### 4. Reorder Operations (Pull Over Push)
```solidity
function withdraw() public {
    uint256 amountToSend = address(this).balance / 100;
    
    // Transfer to owner first
    payable(owner).transfer(amountToSend);
    
    // Then attempt partner transfer
    (bool success,) = partner.call{value: amountToSend}("");
    if (!success) {
        // Owner already got their share, partner transfer failed
        // Could implement retry mechanism or logging
    }
    
    timeLastWithdrawn = block.timestamp;
    withdrawPartnerBalances[partner] += amountToSend;
}
```

### 5. Implement Circuit Breaker Pattern
```solidity
bool public emergencyStop = false;

modifier notStopped() {
    require(!emergencyStop, "Contract is stopped");
    _;
}

function withdraw() public notStopped {
    // ... withdrawal logic
}

function emergencyWithdraw() public {
    require(msg.sender == owner, "Only owner");
    emergencyStop = true;
    // Allow owner to withdraw in emergency
}
```

## Best Practices

1. **Always set gas limits** for external calls
2. **Check return values** of external calls
3. **Use pull over push** pattern when possible
4. **Implement circuit breakers** for emergency situations
5. **Consider using `transfer()`** for simple value transfers
6. **Test with malicious contracts** during development

## Real-World Examples

This vulnerability has been exploited in several DeFi protocols where:
- Yield farming contracts had similar withdrawal patterns
- Token distribution contracts used `call()` without gas limits
- Multi-signature wallets had similar partner withdrawal mechanisms

## Conclusion

The Denial attack demonstrates the importance of:
- **Gas management** in smart contracts
- **Defensive programming** against malicious actors
- **Proper error handling** for external calls
- **Testing with adversarial scenarios**

This vulnerability can completely lock contract funds, making it one of the most severe DoS attacks in smart contract security.