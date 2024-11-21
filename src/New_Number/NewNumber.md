## Guess New Number

First thing noticed, again the answer comes wrapped as a uin8, so that means we have a 1 in 256 chance.

This time, the number is being derived from encoding into a 32 byte these two variables:
  - the last blockhash (e.g: 0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890)
  - current timestamp  (e.g: 1700000000)

The timestamp when transformed to hexadecimal could be something like 0x00000000653dd5c0 and then what would be hashed by keccak256 is 0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000653dd5c0

Now for guessing the right number we just have to execute the same operation before calling the guess function and giving it the answer we got.
