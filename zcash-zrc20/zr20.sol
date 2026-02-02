import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ZR20 is ERC20 {
    constructor() ERC20("ZR20", "ZR20") {
        _mint(msg.sender, 1000000000000000000000000);
    }
}