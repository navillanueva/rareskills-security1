// SPDX-License-Identifier: MIT
// Compile example:
//   solc --strict-assembly zcash-zrc20/EERC20.yul
//
// NOTE:
// - This is a minimal ERC20 implemented in Yul (EVM assembly), plus:
//     transferWithEncryptedMemo(address,uint256,bytes)
//   which emits TransferWithEncryptedMemo(from,to,amount,encryptedMemo) if memo non-empty.
// - name/symbol are exposed via getters returning dynamic strings.
// - decimals is fixed to 18.

object "EERC20" {
  code {
    // ---- constructor / deployment code ----
    // Store initial supply to deployer (caller) and totalSupply.
    // INITIAL_SUPPLY = 1_000_000 * 10^18
    let deployer := caller()
    let initialSupply := mul(1000000, exp(10, 18))

    sstore(totalSupplySlot(), initialSupply)
    sstore(balanceOfSlot(deployer), initialSupply)

    // Emit Transfer(address(0), deployer, initialSupply)
    // topic0 = keccak256("Transfer(address,address,uint256)")
    mstore(0, initialSupply)
    log3(0, 32, TRANSFER_TOPIC(), 0, deployer)

    // Return runtime code
    datacopy(0, dataoffset("Runtime"), datasize("Runtime"))
    return(0, datasize("Runtime"))
  }

  object "Runtime" {
    code {
      // ---- ABI dispatcher ----
      if lt(calldatasize(), 4) { revert(0, 0) }
      let sig := shr(224, calldataload(0))

      switch sig
      case 0x06fdde03 { // name()
        returnString(NAME_PTR(), NAME_LEN())
      }
      case 0x95d89b41 { // symbol()
        returnString(SYMBOL_PTR(), SYMBOL_LEN())
      }
      case 0x313ce567 { // decimals()
        mstore(0, 18)
        return(0, 32)
      }
      case 0x18160ddd { // totalSupply()
        mstore(0, sload(totalSupplySlot()))
        return(0, 32)
      }
      case 0x70a08231 { // balanceOf(address)
        let a := calldataload(4)
        mstore(0, sload(balanceOfSlot(a)))
        return(0, 32)
      }
      case 0xdd62ed3e { // allowance(address,address)
        let owner := calldataload(4)
        let spender := calldataload(36)
        mstore(0, sload(allowanceSlot(owner, spender)))
        return(0, 32)
      }
      case 0x095ea7b3 { // approve(address,uint256)
        let spender := calldataload(4)
        let amount := calldataload(36)
        sstore(allowanceSlot(caller(), spender), amount)
        // emit Approval(owner, spender, amount)
        mstore(0, amount)
        log3(0, 32, APPROVAL_TOPIC(), caller(), spender)
        mstore(0, 1)
        return(0, 32)
      }
      case 0xa9059cbb { // transfer(address,uint256)
        let to := calldataload(4)
        let amount := calldataload(36)
        transferInternal(caller(), to, amount)
        mstore(0, 1)
        return(0, 32)
      }
      case 0x23b872dd { // transferFrom(address,address,uint256)
        let from := calldataload(4)
        let to := calldataload(36)
        let amount := calldataload(68)
        spendAllowance(from, caller(), amount)
        transferInternal(from, to, amount)
        mstore(0, 1)
        return(0, 32)
      }
      case 0xdc10e239 { // transferWithEncryptedMemo(address,uint256,bytes)
        // calldata layout:
        // 0x00..0x03 selector
        // 0x04..0x23 to
        // 0x24..0x43 amount
        // 0x44..0x63 offset to bytes (relative to start of args, i.e. 0x04)
        let to := calldataload(4)
        let amount := calldataload(36)
        let rel := calldataload(68)       // relative offset (from args start)
        let argsStart := 4
        let memoHead := add(argsStart, rel)
        if lt(calldatasize(), add(memoHead, 32)) { revert(0, 0) }
        let memoLen := calldataload(memoHead)
        let memoData := add(memoHead, 32)
        if lt(calldatasize(), add(memoData, memoLen)) { revert(0, 0) }

        transferInternal(caller(), to, amount)

        // Emit memo event only if non-empty
        if gt(memoLen, 0) {
          // Copy memo bytes to memory and log with topic = TransferWithEncryptedMemo(...)
          // topic0 = keccak256("TransferWithEncryptedMemo(address,address,uint256,bytes)")
          // indexed: from, to ; data: amount + memo (abi encoded as (uint256, bytes))
          // We'll ABI-encode in memory as:
          // 0x00 amount
          // 0x20 offset to bytes = 0x40
          // 0x40 bytes length
          // 0x60 bytes data (padded)
          let p := 0
          mstore(p, amount)
          mstore(add(p, 32), 64)
          mstore(add(p, 64), memoLen)
          calldatacopy(add(p, 96), memoData, memoLen)
          // pad to 32-byte boundary
          let rounded := and(add(memoLen, 31), not(31))
          let dataSize := add(96, rounded)
          log3(p, dataSize, MEMO_TOPIC(), caller(), to)
        }

        mstore(0, 1)
        return(0, 32)
      }
      default {
        revert(0, 0)
      }

      // ---- helpers ----
      function transferInternal(from, to, amount) {
        if iszero(to) { revert(0, 0) }
        let fromSlot := balanceOfSlot(from)
        let fromBal := sload(fromSlot)
        if lt(fromBal, amount) { revert(0, 0) }
        sstore(fromSlot, sub(fromBal, amount))
        let toSlot := balanceOfSlot(to)
        sstore(toSlot, add(sload(toSlot), amount))
        // emit Transfer(from, to, amount)
        mstore(0, amount)
        log3(0, 32, TRANSFER_TOPIC(), from, to)
      }

      function spendAllowance(owner, spender, amount) {
        let slot := allowanceSlot(owner, spender)
        let allowed := sload(slot)
        // if allowance is max uint256, treat as infinite
        if iszero(eq(allowed, not(0))) {
          if lt(allowed, amount) { revert(0, 0) }
          sstore(slot, sub(allowed, amount))
        }
      }

      function returnString(ptr, len) {
        // ABI encode string: offset(0x20), length, bytes...
        mstore(0, 32)
        mstore(32, len)
        // copy bytes from code into memory
        codecopy(64, ptr, len)
        // round up to 32
        let rounded := and(add(len, 31), not(31))
        return(0, add(64, rounded))
      }

      // ---- storage slot calculations ----
      function totalSupplySlot() -> s { s := 0 }

      // balanceOf mapping at slot 1: keccak256(abi.encodePacked(key, slot))
      function balanceOfSlot(a) -> s {
        mstore(0, a)
        mstore(32, 1)
        s := keccak256(0, 64)
      }

      // allowance mapping (owner => (spender => amount)) at slot 2:
      // inner = keccak256(owner, 2) ; slot = keccak256(spender, inner)
      function allowanceSlot(owner, spender) -> s {
        mstore(0, owner)
        mstore(32, 2)
        let inner := keccak256(0, 64)
        mstore(0, spender)
        mstore(32, inner)
        s := keccak256(0, 64)
      }

      // ---- constants / embedded metadata ----
      function TRANSFER_TOPIC() -> t { t := 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef }
      function APPROVAL_TOPIC() -> t { t := 0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925 }
      // keccak256("TransferWithEncryptedMemo(address,address,uint256,bytes)")
      function MEMO_TOPIC() -> t { t := 0xcda0a98c0f676fdc210e106b9fb3c23164ef76605eebd21148d0166742906a1c }

      // Embed "EERC20" and "EERC20" as raw bytes in code.
      // Pointers are code offsets within the Runtime object.
      function NAME_PTR() -> p { p := dataoffset("NAME") }
      function NAME_LEN() -> l { l := datasize("NAME") }
      function SYMBOL_PTR() -> p { p := dataoffset("SYMBOL") }
      function SYMBOL_LEN() -> l { l := datasize("SYMBOL") }

      data "NAME" "EERC20"
      data "SYMBOL" "EERC20"
    }
  }
}

