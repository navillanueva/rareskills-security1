## Guess The Secret Number

First thing that stands out is the answerHash is not private, then we can try to reverse engineer the solution possibly.

The number, which is a uint8, is between 0-255 meaning we could bruteforce, therefore we loop through all of the possible numbers applying keccak256 and comparing whether its the solution number.



