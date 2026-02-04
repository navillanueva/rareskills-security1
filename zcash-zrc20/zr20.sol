// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title ZR20
 * @dev ZRC-20 style ERC20 token for Zcash-bridged or Zcash-native use cases.
 */
contract ZR20 is ERC20 {
    uint256 public constant INITIAL_SUPPLY = 1_000_000 * 10 ** 18;

    constructor() ERC20("ZR20", "ZR20") {
        _mint(msg.sender, INITIAL_SUPPLY);
    }
}
