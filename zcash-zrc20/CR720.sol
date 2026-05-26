// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CR720 (Confidential Receipt 720)
 * @dev Zcash-style confidential receipt NFT (ERC-721). Receipt payloads are opaque bytes
 *      emitted in events for off-chain encryption; on-chain state stores only token ownership + URI.
 */
contract CR720 is ERC721, ERC721URIStorage, Ownable2Step, Pausable, ReentrancyGuard {
    uint256 private _nextTokenId;

    event MintWithEncryptedReceipt(
        address indexed to,
        uint256 indexed tokenId,
        bytes encryptedReceipt
    );

    event TransferWithEncryptedMemo(
        address indexed from,
        address indexed to,
        uint256 indexed tokenId,
        bytes encryptedMemo
    );

    error ZeroAddress();
    error NotAuthorized();
    error EmptyReceipt();

    constructor() ERC721("CR720", "CR720") Ownable(msg.sender) {}

    // ----- Views -----

    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    // ----- Owner -----

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Mint a receipt NFT and emit an encrypted receipt payload (off-chain ciphertext).
     */
    function mintWithEncryptedReceipt(
        address to,
        string calldata uri,
        bytes calldata encryptedReceipt
    ) external onlyOwner whenNotPaused nonReentrant returns (uint256 tokenId) {
        if (to == address(0)) revert ZeroAddress();
        if (encryptedReceipt.length == 0) revert EmptyReceipt();

        tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);

        emit MintWithEncryptedReceipt(to, tokenId, encryptedReceipt);
    }

    /**
     * @notice Standard safe transfer with optional encrypted memo in the event log.
     */
    function safeTransferWithEncryptedMemo(
        address from,
        address to,
        uint256 tokenId,
        bytes calldata encryptedMemo
    ) external nonReentrant whenNotPaused {
        if (to == address(0)) revert ZeroAddress();
        if (!_isAuthorized(from, msg.sender, tokenId)) revert NotAuthorized();

        _safeTransfer(from, to, tokenId, "");

        if (encryptedMemo.length > 0) {
            emit TransferWithEncryptedMemo(from, to, tokenId, encryptedMemo);
        }
    }

    /// @inheritdoc ERC721
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /// @inheritdoc ERC721
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        whenNotPaused
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }
}
