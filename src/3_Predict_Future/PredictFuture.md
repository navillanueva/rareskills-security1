## Predict The Future

In this scenario, it is using the same way of calculcating the answe as the **Guess New Number** but it takes the module, meaning it can only be a value of 0-9.

It has more checks in place so we can't directly derive it, but we could still predict it.

Lets build an easy scenario:
  - we lock in our guess N at block number 1. Guess = N / settlementBlockNumber = 2
  - we call the settle function at block number 3

At this point the answer will be the keccak256 of:
  - block hash of 2 (we already have)
  - block.timestamp

In order to "predict" the future and guess the right answer, we need to calculate the block.timestamp at which we will call the settle function. In order to do this, we will use the same operation and feed it a timestamp value one minute in the future, lock in our guess, and then wait to call the settle function.


