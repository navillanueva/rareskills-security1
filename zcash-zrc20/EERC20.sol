// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title EERC20 (Encrypted ERC20)
 * @dev ERC20 with optional encrypted memo support for Zcash-style privacy.
 *      Standard transfers remain compatible; use transferWithEncryptedMemo to attach
 *      off-chain encrypted payloads that are emitted in events for the recipient.
 */
contract EERC20 is ERC20 {
    uint256 public constant INITIAL_SUPPLY = 1_000_000 * 10 ** 18;

    event TransferWithEncryptedMemo(
        address indexed from,
        address indexed to,
        uint256 amount,
        bytes encryptedMemo
    );

    constructor() ERC20("EERC20", "EERC20") {
        _mint(msg.sender, INITIAL_SUPPLY);
    }

    /**
     * @dev Transfer tokens and emit an encrypted memo (e.g. off-chain encrypted message).
     *      Encryption/decryption is done off-chain; this contract only stores and emits the payload.
     */
    function transferWithEncryptedMemo(
        address to,
        uint256 amount,
        bytes calldata encryptedMemo
    ) external returns (bool) {
        bool success = transfer(to, amount);
        if (success && encryptedMemo.length > 0) {
            emit TransferWithEncryptedMemo(msg.sender, to, amount, encryptedMemo);
        }
        return success;
    }
}
