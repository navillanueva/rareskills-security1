// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Minimal slices of ERC-3643 (T-REX) for educational / RWA demos — not a full audit-ready implementation.

interface IAgentRole {
    event AgentAdded(address indexed agent);
    event AgentRemoved(address indexed agent);

    function addAgent(address agent) external;
    function removeAgent(address agent) external;
    function isAgent(address agent) external view returns (bool);
}

interface IIdentityRegistry {
    function isVerified(address wallet) external view returns (bool);
}

interface ICompliance {
    function canTransfer(address from, address to, uint256 amount) external view returns (bool);
    function transferred(address from, address to, uint256 amount) external;
}
