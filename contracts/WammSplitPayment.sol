// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title WammSplitPayment
/// @notice Splits each payment between platform and artist in one transaction.
contract WammSplitPayment {
    uint16 public immutable platformFeeBps;
    address public immutable platformTreasury;

    event PaymentSplit(
        address indexed payer,
        address indexed artist,
        address indexed platform,
        uint256 totalAmountWei,
        uint256 artistAmountWei,
        uint256 platformAmountWei,
        bytes32 releaseRef
    );

    constructor(address _platformTreasury, uint16 _platformFeeBps) {
        require(_platformTreasury != address(0), "invalid treasury");
        require(_platformFeeBps <= 10_000, "invalid fee bps");
        platformTreasury = _platformTreasury;
        platformFeeBps = _platformFeeBps;
    }

    function payForRelease(address artist, bytes32 releaseRef) external payable {
        require(artist != address(0), "invalid artist");
        require(msg.value > 0, "no value");

        uint256 platformAmount = (msg.value * platformFeeBps) / 10_000;
        uint256 artistAmount = msg.value - platformAmount;

        (bool platformOk, ) = platformTreasury.call{value: platformAmount}("");
        require(platformOk, "platform transfer failed");

        (bool artistOk, ) = artist.call{value: artistAmount}("");
        require(artistOk, "artist transfer failed");

        emit PaymentSplit(
            msg.sender,
            artist,
            platformTreasury,
            msg.value,
            artistAmount,
            platformAmount,
            releaseRef
        );
    }
}

