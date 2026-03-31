// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IIdentityRegistry} from "./interfaces/IERC3643Minimal.sol";

/// @dev Stand-in for ERC-3643’s on-chain identity + claims flow: here, “verified” is a simple allowlist.
contract SimpleIdentityRegistry is Ownable, IIdentityRegistry {
    mapping(address => bool) private _verified;

    event VerificationSet(address indexed wallet, bool verified);

    constructor() Ownable(msg.sender) {}

    function setVerified(address wallet, bool status) external onlyOwner {
        _verified[wallet] = status;
        emit VerificationSet(wallet, status);
    }

    function isVerified(address wallet) external view returns (bool) {
        return _verified[wallet];
    }
}
