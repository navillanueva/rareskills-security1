// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title ISimpleERC20
 * @dev Minimal interface for ERC20 tokens
 */
interface ISimpleERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title TokenBank
 * @author RareSkills 
 * @dev A token bank contract that allows users to deposit and withdraw ERC20 tokens.
 * WARNING: This contract contains a reentrancy vulnerability for educational purposes.
 * The vulnerability is in the withdraw function where state is updated after the external call.
 */
contract TokenBank {
    // Mapping from token address => user address => balance
    mapping(address => mapping(address => uint256)) public tokenBalances;
    
    // Events
    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    
    /**
     * @dev Deposits ERC20 tokens into the bank
     * @param token The address of the ERC20 token to deposit
     * @param amount The amount of tokens to deposit
     */
    function deposit(address token, uint256 amount) external {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");
        
        // Transfer tokens from user to this contract
        bool success = ISimpleERC20(token).transferFrom(msg.sender, address(this), amount);
        require(success, "Token transfer failed");
        
        // Update user's balance
        tokenBalances[token][msg.sender] += amount;
        
        emit Deposited(msg.sender, token, amount);
    }
    
    /**
     * @dev Withdraws ERC20 tokens from the bank
     * @param token The address of the ERC20 token to withdraw
     * @param amount The amount of tokens to withdraw
     * 
     * VULNERABILITY: This function is vulnerable to reentrancy attacks!
     * The state update happens AFTER the external call, allowing an attacker
     * to re-enter and drain funds.
     */
    function withdraw(address token, uint256 amount) external {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");
        
        uint256 userBalance = tokenBalances[token][msg.sender];
        require(userBalance >= amount, "Insufficient balance");
        
        // VULNERABILITY: External call before state update
        bool success = ISimpleERC20(token).transfer(msg.sender, amount);
        require(success, "Token transfer failed");
        
        // State update happens AFTER the external call (vulnerable to reentrancy)
        tokenBalances[token][msg.sender] -= amount;
        
        emit Withdrawn(msg.sender, token, amount);
    }
    
    /**
     * @dev Returns the balance of a user for a specific token
     * @param token The address of the ERC20 token
     * @param user The address of the user
     * @return The user's balance of the specified token
     */
    function getBalance(address token, address user) external view returns (uint256) {
        return tokenBalances[token][user];
    }
    
    /**
     * @dev Returns the total balance of a specific token held by the bank
     * @param token The address of the ERC20 token
     * @return The total balance of the token in the bank
     */
    function getTotalBalance(address token) external view returns (uint256) {
        return ISimpleERC20(token).balanceOf(address(this));
    }
}

/**
 * @title SecureTokenBank
 * @dev A secure version of TokenBank that prevents reentrancy attacks
 */
contract SecureTokenBank {
    // Mapping from token address => user address => balance
    mapping(address => mapping(address => uint256)) public tokenBalances;
    
    // Reentrancy guard
    bool private locked;
    
    // Events
    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    
    /**
     * @dev Reentrancy guard modifier
     */
    modifier noReentrant() {
        require(!locked, "No reentrancy allowed");
        locked = true;
        _;
        locked = false;
    }
    
    /**
     * @dev Deposits ERC20 tokens into the bank
     * @param token The address of the ERC20 token to deposit
     * @param amount The amount of tokens to deposit
     */
    function deposit(address token, uint256 amount) external {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");
        
        // Transfer tokens from user to this contract
        bool success = ISimpleERC20(token).transferFrom(msg.sender, address(this), amount);
        require(success, "Token transfer failed");
        
        // Update user's balance
        tokenBalances[token][msg.sender] += amount;
        
        emit Deposited(msg.sender, token, amount);
    }
    
    /**
     * @dev Securely withdraws ERC20 tokens from the bank
     * @param token The address of the ERC20 token to withdraw
     * @param amount The amount of tokens to withdraw
     * 
     * This version is protected against reentrancy attacks using:
     * 1. Reentrancy guard modifier
     * 2. Checks-Effects-Interactions pattern (state update before external call)
     */
    function withdraw(address token, uint256 amount) external noReentrant {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");
        
        uint256 userBalance = tokenBalances[token][msg.sender];
        require(userBalance >= amount, "Insufficient balance");
        
        // SECURE: Update state BEFORE making external call
        tokenBalances[token][msg.sender] -= amount;
        
        // Make the external call after state update
        bool success = ISimpleERC20(token).transfer(msg.sender, amount);
        require(success, "Token transfer failed");
        
        emit Withdrawn(msg.sender, token, amount);
    }
    
    /**
     * @dev Returns the balance of a user for a specific token
     * @param token The address of the ERC20 token
     * @param user The address of the user
     * @return The user's balance of the specified token
     */
    function getBalance(address token, address user) external view returns (uint256) {
        return tokenBalances[token][user];
    }
    
    /**
     * @dev Returns the total balance of a specific token held by the bank
     * @param token The address of the ERC20 token
     * @return The total balance of the token in the bank
     */
    function getTotalBalance(address token) external view returns (uint256) {
        return ISimpleERC20(token).balanceOf(address(this));
    }
}
