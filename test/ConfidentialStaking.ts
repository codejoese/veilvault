import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { ConfidentialStaking, ConfidentialStaking__factory, ConfidentialZama, ConfidentialZama__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const tokenFactory = (await ethers.getContractFactory("ConfidentialZama")) as ConfidentialZama__factory;
  const token = (await tokenFactory.deploy()) as ConfidentialZama;
  const tokenAddress = await token.getAddress();

  const stakingFactory = (await ethers.getContractFactory("ConfidentialStaking")) as ConfidentialStaking__factory;
  const staking = (await stakingFactory.deploy(tokenAddress)) as ConfidentialStaking;
  const stakingAddress = await staking.getAddress();

  return { token, tokenAddress, staking, stakingAddress };
}

describe("ConfidentialStaking", function () {
  let signers: Signers;
  let token: ConfidentialZama;
  let tokenAddress: string;
  let staking: ConfidentialStaking;
  let stakingAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ token, tokenAddress, staking, stakingAddress } = await deployFixture());
  });

  it("stakes encrypted amount and withdraws after unlock", async function () {
    const mintAmount = 1_000_000n;
    const stakeAmount = 250_000n;
    const lockDuration = 60;

    await token.connect(signers.deployer).mint(signers.alice.address, mintAmount);

    const operatorUntil = BigInt("281474976710655");
    await token.connect(signers.alice).setOperator(stakingAddress, operatorUntil);

    const encryptedInput = await fhevm
      .createEncryptedInput(tokenAddress, signers.alice.address)
      .add64(stakeAmount)
      .encrypt();

    const stakeTx = await staking
      .connect(signers.alice)
      .stake(encryptedInput.handles[0], encryptedInput.inputProof, lockDuration);
    await stakeTx.wait();

    const stakeData = await staking.getStake(signers.alice.address);
    expect(stakeData[2]).to.eq(true);

    const decryptedStakeAmount = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      stakeData[0],
      stakingAddress,
      signers.alice,
    );
    expect(decryptedStakeAmount).to.eq(stakeAmount);

    const encryptedBalanceAfterStake = await token.confidentialBalanceOf(signers.alice.address);
    const balanceAfterStake = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalanceAfterStake,
      tokenAddress,
      signers.alice,
    );
    expect(balanceAfterStake).to.eq(mintAmount - stakeAmount);

    await expect(staking.connect(signers.alice).withdraw()).to.be.revertedWithCustomError(staking, "StakeLocked");

    await ethers.provider.send("evm_increaseTime", [lockDuration + 1]);
    await ethers.provider.send("evm_mine", []);

    const withdrawTx = await staking.connect(signers.alice).withdraw();
    await withdrawTx.wait();

    const stakeDataAfter = await staking.getStake(signers.alice.address);
    expect(stakeDataAfter[2]).to.eq(false);

    const encryptedBalanceAfterWithdraw = await token.confidentialBalanceOf(signers.alice.address);
    const balanceAfterWithdraw = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalanceAfterWithdraw,
      tokenAddress,
      signers.alice,
    );
    expect(balanceAfterWithdraw).to.eq(mintAmount);
  });
});
