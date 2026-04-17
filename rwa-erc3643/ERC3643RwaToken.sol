// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IAgentRole, IIdentityRegistry, ICompliance} from "./interfaces/IERC3643Minimal.sol";

/// @title ERC3643RwaToken
/// @notice Simplified ERC-3643 (T-REX) style security / RWA token for learning — not production-grade.
/// @dev Deploy order: IdentityRegistry → this token → SimpleCompliance(token) → token.setCompliance(compliance).
contract ERC3643RwaToken is ERC20, Ownable, Pausable, IAgentRole {
    IIdentityRegistry public immutable identityRegistry;
    ICompliance public compliance;

    mapping(address => bool) private _agents;
    mapping(address => bool) private _frozen;

    error ComplianceNotSet();
    error WalletFrozen();
    error NotVerified();
    error ComplianceBlocked();
    error NotAgent();

    constructor(
        string memory name_,
        string memory symbol_,
        IIdentityRegistry registry_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        identityRegistry = registry_;
        _agents[msg.sender] = true;
        emit AgentAdded(msg.sender);
    }

    /// @notice Wire compliance after token exists (compliance needs token address).
    function setCompliance(ICompliance compliance_) external onlyOwner {
        compliance = compliance_;
    }

    // ----- IAgentRole -----
    function addAgent(address agent) external onlyOwner {
        _agents[agent] = true;
        emit AgentAdded(agent);
    }

    function removeAgent(address agent) external onlyOwner {
        _agents[agent] = false;
        emit AgentRemoved(agent);
    }

    function isAgent(address agent) external view returns (bool) {
        return _agents[agent];
    }

    modifier onlyAgent() {
        if (!_agents[msg.sender]) revert NotAgent();
        _;
    }

    // ----- Issuer controls -----
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setFrozen(address wallet, bool frozen) external onlyAgent {
        _frozen[wallet] = frozen;
    }

    function frozen(address wallet) external view returns (bool) {
        return _frozen[wallet];
    }

    /// @notice Mint to a verified investor (agent only). Per ERC-3643, mint does not run `canTransfer` rules.
    function mint(address to, uint256 amount) external onlyAgent whenNotPaused {
        if (!identityRegistry.isVerified(to)) revert NotVerified();
        _mint(to, amount);
        _notifyCompliance(address(0), to, amount);
    }

    /// @notice Burn from any wallet (agent only) — full ERC-3643 allows regulated burn paths; simplified here.
    function burn(address from, uint256 amount) external onlyAgent {
        _burn(from, amount);
        _notifyCompliance(from, address(0), amount);
    }

    /// @notice Agent recovery / regulated move — receiver must still be verified; `canTransfer` is bypassed (ERC-3643).
    function forcedTransfer(address from, address to, uint256 amount) external onlyAgent whenNotPaused {
        if (!identityRegistry.isVerified(to)) revert NotVerified();
        _transfer(from, to, amount);
        _notifyCompliance(from, to, amount);
    }

    // ----- ERC-20 overrides -----
    function transfer(address to, uint256 amount) public override whenNotPaused returns (bool) {
        _transferChecked(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public override whenNotPaused returns (bool) {
        _spendAllowance(from, msg.sender, amount);
        _transferChecked(from, to, amount);
        return true;
    }

    function _transferChecked(address from, address to, uint256 amount) internal {
        if (_frozen[from] || _frozen[to]) revert WalletFrozen();
        if (!identityRegistry.isVerified(to)) revert NotVerified();
        if (!identityRegistry.isVerified(from)) revert NotVerified();
        _requireCompliance(from, to, amount);
        _transfer(from, to, amount);
        _notifyCompliance(from, to, amount);
    }

    function _requireCompliance(address from, address to, uint256 amount) internal view {
        address c = address(compliance);
        if (c == address(0)) revert ComplianceNotSet();
        if (!ICompliance(c).canTransfer(from, to, amount)) revert ComplianceBlocked();
    }

    function _notifyCompliance(address from, address to, uint256 amount) internal {
        address c = address(compliance);
        if (c != address(0)) {
            ICompliance(c).transferred(from, to, amount);
        }
    }
}
