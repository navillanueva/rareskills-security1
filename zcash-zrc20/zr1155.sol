// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ZR1155
 * @dev ZRC-style ERC1155 multi-token for Zcash-bridged or Zcash-native use cases.
 *      Supports both fungible (token type) and non-fungible (unique id) assets in one contract.
 */
contract ZR1155 is ERC1155, Ownable {
    uint256 public constant FUNGIBLE_TOKEN_ID = 0;
    uint256 public constant INITIAL_FUNGIBLE_SUPPLY = 1_000_000 * 10 ** 18;

    constructor() ERC1155("") Ownable(msg.sender) {
        _mint(msg.sender, FUNGIBLE_TOKEN_ID, INITIAL_FUNGIBLE_SUPPLY, "");
    }

    function mint(address account, uint256 id, uint256 amount, bytes calldata data) external onlyOwner {
        _mint(account, id, amount, data);
    }

    function mintBatch(
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes calldata data
    ) external onlyOwner {
        _mintBatch(to, ids, amounts, data);
    }
}
