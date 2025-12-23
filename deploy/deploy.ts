import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedToken = await deploy("ConfidentialZama", {
    from: deployer,
    log: true,
  });

  const deployedStaking = await deploy("ConfidentialStaking", {
    from: deployer,
    log: true,
    args: [deployedToken.address],
  });

  console.log(`ConfidentialZama contract: `, deployedToken.address);
  console.log(`ConfidentialStaking contract: `, deployedStaking.address);
};
export default func;
func.id = "deploy_confidential_staking"; // id required to prevent reexecution
func.tags = ["ConfidentialZama", "ConfidentialStaking"];
