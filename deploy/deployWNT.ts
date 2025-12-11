import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "WNT",
  id: "WNT_mantleSepolia",
  getDeployArgs: async () => {
    return []; // WNT has no constructor args
  },
});

func.skip = async ({ network }) => {
  // Only deploy on mantleSepolia for now
  return network.name !== "mantleSepolia";
};

func.tags = ["WNT"];
func.dependencies = ["DataStore"];

export default func;
