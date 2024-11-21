// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

contract ExploitContract {

    address payable public targetContract;
    bytes32 answerHash = 0xdb81b4d58595fbbbb592d3661a34cdca14d7ab379441400cbfa1b78bc447c365;


    function Exploiter() public pure returns (uint8) {
        for (uint8 i = 0; i < 256; i++) {
            if (keccak256(abi.encodePacked(i)) ==
                0xdb81b4d58595fbbbb592d3661a34cdca14d7ab379441400cbfa1b78bc447c365) {
                return i;
            }
        }

        revert("Secret number not found");
    }
}
