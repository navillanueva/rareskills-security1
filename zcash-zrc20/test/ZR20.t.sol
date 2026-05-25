// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ZR20} from "../src/zr20.sol";

/// @dev Fuzz + unit tests for ZR20 (Foundry: `forge test -vv` from `zcash-zrc20/`).
contract ZR20Test is Test {
    ZR20 internal token;
    address internal owner;
    address internal alice;
    address internal bob;

    uint256 internal constant INITIAL_SUPPLY = 1_000_000 * 10 ** 18;

    function setUp() public {
        owner = address(this);
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        token = new ZR20();
    }

    function test_InitialState() public view {
        assertEq(token.name(), "ZR20");
        assertEq(token.symbol(), "ZR20");
        assertEq(token.decimals(), 18);
        assertEq(token.totalSupply(), INITIAL_SUPPLY);
        assertEq(token.balanceOf(owner), INITIAL_SUPPLY);
        assertEq(token.MAX_SUPPLY(), INITIAL_SUPPLY);
        assertFalse(token.paused());
    }

    // ----- Fuzz: ERC-20 transfers -----

    function testFuzz_TransferPreservesTotalSupply(uint256 amount) public {
        amount = bound(amount, 1, INITIAL_SUPPLY);
        token.transfer(alice, amount);
        assertEq(token.totalSupply(), INITIAL_SUPPLY);
        assertEq(token.balanceOf(owner) + token.balanceOf(alice), INITIAL_SUPPLY);
    }

    function testFuzz_TransferBalances(address to, uint256 amount) public {
        vm.assume(to != address(0));
        vm.assume(to != owner);
        amount = bound(amount, 0, INITIAL_SUPPLY);

        token.transfer(to, amount);
        assertEq(token.balanceOf(to), amount);
        assertEq(token.balanceOf(owner), INITIAL_SUPPLY - amount);
    }

    function testFuzz_TransferRevertsOnZeroAddress(uint256 amount) public {
        amount = bound(amount, 1, INITIAL_SUPPLY);
        vm.expectRevert();
        token.transfer(address(0), amount);
    }

    function testFuzz_TransferRevertsWhenInsufficientBalance(uint256 amount) public {
        amount = bound(amount, INITIAL_SUPPLY + 1, type(uint256).max);
        vm.expectRevert();
        token.transfer(alice, amount);
    }

    // ----- Fuzz: transferWithEncryptedMemo -----

    function testFuzz_TransferWithEncryptedMemo(uint256 amount, bytes calldata memo) public {
        amount = bound(amount, 1, INITIAL_SUPPLY);

        if (memo.length > 0) {
            vm.expectEmit(true, true, false, true);
            emit ZR20.TransferWithEncryptedMemo(owner, alice, amount, memo);
        }

        bool ok = token.transferWithEncryptedMemo(alice, amount, memo);
        assertTrue(ok);
        assertEq(token.balanceOf(alice), amount);
        assertEq(token.balanceOf(owner), INITIAL_SUPPLY - amount);
    }

    function testFuzz_TransferWithEncryptedMemoRevertsZeroAddress(uint256 amount, bytes calldata memo) public {
        amount = bound(amount, 1, INITIAL_SUPPLY);
        vm.expectRevert(ZR20.ZeroAddress.selector);
        token.transferWithEncryptedMemo(address(0), amount, memo);
    }

    function testFuzz_TransferWithEncryptedMemoRevertsWhenPaused(uint256 amount, bytes calldata memo) public {
        amount = bound(amount, 1, INITIAL_SUPPLY);
        token.pause();
        vm.expectRevert();
        token.transferWithEncryptedMemo(alice, amount, memo);
    }

    // ----- Fuzz: transferFromWithEncryptedMemo -----

    function testFuzz_TransferFromWithEncryptedMemo(uint256 amount, bytes calldata memo) public {
        amount = bound(amount, 1, INITIAL_SUPPLY);
        token.transfer(alice, amount);

        vm.prank(alice);
        token.approve(bob, amount);

        vm.prank(bob);
        bool ok = token.transferFromWithEncryptedMemo(alice, bob, amount, memo);
        assertTrue(ok);
        assertEq(token.balanceOf(bob), amount);
        assertEq(token.balanceOf(alice), 0);
    }

    function testFuzz_TransferFromWithEncryptedMemoRevertsInsufficientAllowance(uint256 approved, uint256 spent)
        public
    {
        approved = bound(approved, 0, INITIAL_SUPPLY - 1);
        spent = bound(spent, approved + 1, INITIAL_SUPPLY);
        token.transfer(alice, spent);

        vm.prank(alice);
        token.approve(bob, approved);

        vm.prank(bob);
        vm.expectRevert();
        token.transferFromWithEncryptedMemo(alice, bob, spent, "memo");
    }

    // ----- Fuzz: burn -----

    function testFuzz_BurnReducesSupply(uint256 burnAmount) public {
        burnAmount = bound(burnAmount, 1, INITIAL_SUPPLY);
        token.burn(burnAmount);
        assertEq(token.totalSupply(), INITIAL_SUPPLY - burnAmount);
        assertEq(token.balanceOf(owner), INITIAL_SUPPLY - burnAmount);
    }

    function testFuzz_BurnFromWithAllowance(uint256 amount) public {
        amount = bound(amount, 1, INITIAL_SUPPLY);
        token.transfer(alice, amount);

        vm.prank(alice);
        token.approve(bob, amount);

        vm.prank(bob);
        token.burnFrom(alice, amount);

        assertEq(token.balanceOf(alice), 0);
        assertEq(token.totalSupply(), INITIAL_SUPPLY - amount);
    }

    function testFuzz_BurnRevertsWhenExceedsBalance(uint256 burnAmount) public {
        burnAmount = bound(burnAmount, INITIAL_SUPPLY + 1, type(uint256).max);
        vm.expectRevert();
        token.burn(burnAmount);
    }

    // ----- Fuzz: pause -----

    function testFuzz_PauseBlocksTransfer(uint256 amount) public {
        amount = bound(amount, 1, INITIAL_SUPPLY);
        token.pause();
        vm.expectRevert();
        token.transfer(alice, amount);
    }

    function testFuzz_UnpauseAllowsTransfer(uint256 amount) public {
        amount = bound(amount, 1, INITIAL_SUPPLY);
        token.pause();
        token.unpause();
        token.transfer(alice, amount);
        assertEq(token.balanceOf(alice), amount);
    }

    function testFuzz_OnlyOwnerCanPause(address caller) public {
        vm.assume(caller != owner);
        vm.prank(caller);
        vm.expectRevert();
        token.pause();
    }

    // ----- Fuzz: EIP-2612 permit -----

    function testFuzz_PermitSetsAllowance(uint256 privateKey, uint256 amount, uint256 deadline) public {
        privateKey = bound(privateKey, 1, type(uint256).max / 2);
        amount = bound(amount, 1, INITIAL_SUPPLY);
        deadline = bound(deadline, block.timestamp, type(uint64).max);

        address holder = vm.addr(privateKey);
        token.transfer(holder, amount);

        uint256 nonce = token.nonces(holder);

        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                holder,
                bob,
                amount,
                nonce,
                deadline
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);

        token.permit(holder, bob, amount, deadline, v, r, s);
        assertEq(token.allowance(holder, bob), amount);
    }

    // ----- Fuzz: multi-hop transfers -----

    function testFuzz_RoundTripTransferChain(uint256 a, uint256 b) public {
        a = bound(a, 1, INITIAL_SUPPLY / 2);
        b = bound(b, 1, INITIAL_SUPPLY / 2);
        uint256 c = INITIAL_SUPPLY - a - b;
        vm.assume(c > 0);

        token.transfer(alice, a);
        token.transfer(bob, b);

        vm.prank(alice);
        token.transfer(bob, a);

        assertEq(token.balanceOf(alice), 0);
        assertEq(token.balanceOf(bob), a + b);
        assertEq(token.balanceOf(owner), c);
        assertEq(token.totalSupply(), INITIAL_SUPPLY);
    }
}
