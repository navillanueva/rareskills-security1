pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";


contract ZR20 is ERC20 {
    uint256 public constant INITIAL_SUPPLY = 1_000_000 * 10 ** 18;

    constructor() ERC20("ZR20", "ZR20") {
        _mint(msg.sender, INITIAL_SUPPLY);
    }

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
