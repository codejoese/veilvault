import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:token-address", "Prints the ConfidentialZama token address").setAction(
  async function (_taskArguments: TaskArguments, hre) {
    const { deployments } = hre;
    const token = await deployments.get("ConfidentialZama");
    console.log("ConfidentialZama address is " + token.address);
  },
);

task("task:staking-address", "Prints the ConfidentialStaking contract address").setAction(
  async function (_taskArguments: TaskArguments, hre) {
    const { deployments } = hre;
    const staking = await deployments.get("ConfidentialStaking");
    console.log("ConfidentialStaking address is " + staking.address);
  },
);

task("task:stake", "Stake cZama with an encrypted amount")
  .addParam("amount", "Stake amount in token base units")
  .addParam("lock", "Lock duration in seconds")
  .addOptionalParam("staking", "Optional staking contract address override")
  .addOptionalParam("token", "Optional token contract address override")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const tokenDeployment = taskArguments.token
      ? { address: taskArguments.token }
      : await deployments.get("ConfidentialZama");
    const stakingDeployment = taskArguments.staking
      ? { address: taskArguments.staking }
      : await deployments.get("ConfidentialStaking");

    const amount = BigInt(taskArguments.amount);
    const lockDuration = BigInt(taskArguments.lock);
    if (amount <= 0n || lockDuration <= 0n) {
      throw new Error("Amount and lock duration must be positive");
    }

    const [signer] = await ethers.getSigners();
    const token = await ethers.getContractAt("ConfidentialZama", tokenDeployment.address);
    const staking = await ethers.getContractAt("ConfidentialStaking", stakingDeployment.address);

    const operatorUntil = BigInt("281474976710655");
    const operatorTx = await token.connect(signer).setOperator(stakingDeployment.address, operatorUntil);
    await operatorTx.wait();

    const encryptedInput = await fhevm
      .createEncryptedInput(tokenDeployment.address, signer.address)
      .add64(amount)
      .encrypt();

    const tx = await staking
      .connect(signer)
      .stake(encryptedInput.handles[0], encryptedInput.inputProof, Number(lockDuration));
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("task:decrypt-stake", "Decrypts the caller stake amount")
  .addOptionalParam("staking", "Optional staking contract address override")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const stakingDeployment = taskArguments.staking
      ? { address: taskArguments.staking }
      : await deployments.get("ConfidentialStaking");

    const [signer] = await ethers.getSigners();
    const staking = await ethers.getContractAt("ConfidentialStaking", stakingDeployment.address);

    const stakeData = await staking.getStake(signer.address);
    const encryptedAmount = stakeData[0];
    const unlockTime = stakeData[1];
    const active = stakeData[2];

    if (!active) {
      console.log("No active stake");
      return;
    }

    const clearAmount = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedAmount,
      stakingDeployment.address,
      signer,
    );

    console.log(`Encrypted stake amount: ${encryptedAmount}`);
    console.log(`Clear stake amount    : ${clearAmount}`);
    console.log(`Unlock time           : ${unlockTime.toString()}`);
  });

task("task:decrypt-balance", "Decrypts the caller token balance")
  .addOptionalParam("token", "Optional token contract address override")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const tokenDeployment = taskArguments.token
      ? { address: taskArguments.token }
      : await deployments.get("ConfidentialZama");

    const [signer] = await ethers.getSigners();
    const token = await ethers.getContractAt("ConfidentialZama", tokenDeployment.address);

    const encryptedBalance = await token.confidentialBalanceOf(signer.address);
    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      tokenDeployment.address,
      signer,
    );

    console.log(`Encrypted balance: ${encryptedBalance}`);
    console.log(`Clear balance    : ${clearBalance}`);
  });
