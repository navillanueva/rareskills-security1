// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ICompliance} from "./interfaces/IERC3643Minimal.sol";

/// @dev Example global rule: cap how many tokens any single wallet may hold (RWA / concentration limits).
contract SimpleCompliance is Ownable, ICompliance {
    IERC20 public immutable token;
    uint256 public maxBalancePerWallet;

    event MaxBalancePerWalletUpdated(uint256 maxBalance);

    constructor(address token_, uint256 maxBalancePerWallet_) Ownable(msg.sender) {
        token = IERC20(token_);
        maxBalancePerWallet = maxBalancePerWallet_;
    }

    function setMaxBalancePerWallet(uint256 newMax) external onlyOwner {
        maxBalancePerWallet = newMax;
        emit MaxBalancePerWalletUpdated(newMax);
    }

    function canTransfer(address from, address to, uint256 amount) external view returns (bool) {
        if (to == address(0)) return false;
        uint256 balTo = token.balanceOf(to);
        // Mint: `from` is zero address in ERC-3643-style checks.
        if (from == address(0)) {
            return balTo + amount <= maxBalancePerWallet;
        }
        // Self-transfer: net balance unchanged.
        if (from == to) {
            return balTo <= maxBalancePerWallet;
        }
        uint256 newReceiverBal = balTo + amount;
        return newReceiverBal <= maxBalancePerWallet;
    }

    /// @dev Hook after a successful transfer (mirrors T-REX pattern); extend with counters / jurisdictions as needed.
    function transferred(address, address, uint256) external {
        require(msg.sender == address(token), "SimpleCompliance: only token");
    }
}
