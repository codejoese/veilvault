import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { ConfidentialStaking, ConfidentialZama } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  alice: HardhatEthersSigner;
};

describe("ConfidentialStakingSepolia", function () {
  let signers: Signers;
  let token: ConfidentialZama;
  let staking: ConfidentialStaking;
  let tokenAddress: string;
  let stakingAddress: string;
  let step: number;
  let steps: number;

  function progress(message: string) {
    console.log(`${++step}/${steps} ${message}`);
  }

  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }

    try {
      const tokenDeployment = await deployments.get("ConfidentialZama");
      const stakingDeployment = await deployments.get("ConfidentialStaking");
      tokenAddress = tokenDeployment.address;
      stakingAddress = stakingDeployment.address;
      token = await ethers.getContractAt("ConfidentialZama", tokenAddress);
      staking = await ethers.getContractAt("ConfidentialStaking", stakingAddress);
    } catch (e) {
      (e as Error).message += ". Call 'npx hardhat deploy --network sepolia'";
      throw e;
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { alice: ethSigners[0] };
  });

  beforeEach(async () => {
    step = 0;
    steps = 0;
  });

  it("stakes and decrypts balance changes", async function () {
    steps = 9;
    this.timeout(4 * 40000);

    progress("Minting tokens...");
    const mintTx = await token.connect(signers.alice).mint(signers.alice.address, 500_000);
    await mintTx.wait();

    progress("Setting operator...");
    const operatorUntil = BigInt("281474976710655");
    const operatorTx = await token.connect(signers.alice).setOperator(stakingAddress, operatorUntil);
    await operatorTx.wait();

    progress("Encrypting stake amount...");
    const encryptedInput = await fhevm
      .createEncryptedInput(tokenAddress, signers.alice.address)
      .add64(200_000)
      .encrypt();

    progress("Staking...");
    const stakeTx = await staking
      .connect(signers.alice)
      .stake(encryptedInput.handles[0], encryptedInput.inputProof, 30);
    await stakeTx.wait();

    progress("Fetching stake...");
    const stakeData = await staking.getStake(signers.alice.address);
    expect(stakeData[2]).to.eq(true);

    progress("Decrypting stake...");
    const decryptedStakeAmount = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      stakeData[0],
      stakingAddress,
      signers.alice,
    );
    expect(decryptedStakeAmount).to.eq(200_000);

    progress("Decrypting balance...");
    const encryptedBalance = await token.confidentialBalanceOf(signers.alice.address);
    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      tokenAddress,
      signers.alice,
    );
    expect(clearBalance).to.be.greaterThan(0);
  });
});
