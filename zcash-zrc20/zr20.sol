// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ZR20
 * @dev Production-oriented ZRC-20 style ERC20: fixed initial supply, EIP-2612 permit,
 *      optional burn, pause, and Zcash-style encrypted memo events on transfer.
 */
contract ZR20 is ERC20, ERC20Permit, ERC20Burnable, Ownable2Step, Pausable, ReentrancyGuard {
    uint256 public constant INITIAL_SUPPLY = 1_000_000 * 10 ** 18;
    uint256 public constant MAX_SUPPLY = INITIAL_SUPPLY;

    event TransferWithEncryptedMemo(
        address indexed from,
        address indexed to,
        uint256 amount,
        bytes encryptedMemo
    );

    error ZeroAddress();

    constructor() ERC20("ZR20", "ZR20") ERC20Permit("ZR20") Ownable(msg.sender) {
        _mint(msg.sender, INITIAL_SUPPLY);
    }

    // ----- Owner -----
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Transfer with an optional off-chain encrypted memo (emitted in logs only).
     * @dev Encryption/decryption happens off-chain; the chain stores only opaque `encryptedMemo` bytes.
     */
    function transferWithEncryptedMemo(
        address to,
        uint256 amount,
        bytes calldata encryptedMemo
    ) external nonReentrant whenNotPaused returns (bool) {
        if (to == address(0)) revert ZeroAddress();
        bool success = transfer(to, amount);
        if (success && encryptedMemo.length > 0) {
            emit TransferWithEncryptedMemo(msg.sender, to, amount, encryptedMemo);
        }
        return success;
    }

    /**
     * @notice `transferFrom` with optional encrypted memo (spender must have allowance).
     */
    function transferFromWithEncryptedMemo(
        address from,
        address to,
        uint256 amount,
        bytes calldata encryptedMemo
    ) external nonReentrant whenNotPaused returns (bool) {
        if (to == address(0)) revert ZeroAddress();
        bool success = transferFrom(from, to, amount);
        if (success && encryptedMemo.length > 0) {
            emit TransferWithEncryptedMemo(from, to, amount, encryptedMemo);
        }
        return success;
    }

    /// @inheritdoc ERC20
    function _update(address from, address to, uint256 value) internal virtual override whenNotPaused {
        super._update(from, to, value);
    }
}
