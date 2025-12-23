// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";

contract ConfidentialStaking is ZamaEthereumConfig {
    struct StakeInfo {
        euint64 amount;
        uint64 unlockTime;
        bool active;
    }

    IERC7984 public immutable token;
    mapping(address account => StakeInfo) private _stakes;

    event Staked(address indexed account, euint64 amount, uint64 unlockTime);
    event Withdrawn(address indexed account, euint64 amount);

    error InvalidToken(address token);
    error InvalidLockDuration();
    error StakeAlreadyActive(address account);
    error NoActiveStake(address account);
    error StakeLocked(uint64 unlockTime);

    constructor(address tokenAddress) {
        if (tokenAddress == address(0)) {
            revert InvalidToken(tokenAddress);
        }
        token = IERC7984(tokenAddress);
    }

    function stake(externalEuint64 encryptedAmount, bytes calldata inputProof, uint64 lockDuration) external {
        if (lockDuration == 0) {
            revert InvalidLockDuration();
        }

        StakeInfo storage info = _stakes[msg.sender];
        if (info.active) {
            revert StakeAlreadyActive(msg.sender);
        }

        uint64 unlockTime = uint64(block.timestamp) + lockDuration;
        euint64 transferred = token.confidentialTransferFrom(msg.sender, address(this), encryptedAmount, inputProof);

        FHE.allowThis(transferred);
        FHE.allow(transferred, msg.sender);

        info.amount = transferred;
        info.unlockTime = unlockTime;
        info.active = true;

        emit Staked(msg.sender, transferred, unlockTime);
    }

    function withdraw() external {
        StakeInfo storage info = _stakes[msg.sender];
        if (!info.active) {
            revert NoActiveStake(msg.sender);
        }
        if (block.timestamp < info.unlockTime) {
            revert StakeLocked(info.unlockTime);
        }

        euint64 amount = info.amount;

        info.active = false;
        info.unlockTime = 0;
        info.amount = FHE.asEuint64(0);

        FHE.allowThis(info.amount);
        FHE.allow(info.amount, msg.sender);

        token.confidentialTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    function getStake(address account) external view returns (euint64 amount, uint64 unlockTime, bool active) {
        StakeInfo storage info = _stakes[account];
        return (info.amount, info.unlockTime, info.active);
    }

    function getStakeAmount(address account) external view returns (euint64) {
        return _stakes[account].amount;
    }

    function getStakeUnlockTime(address account) external view returns (uint64) {
        return _stakes[account].unlockTime;
    }

    function hasActiveStake(address account) external view returns (bool) {
        return _stakes[account].active;
    }
}
