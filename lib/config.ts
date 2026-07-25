/**
 * Centralized network configuration for PayGate.
 *
 * All Arc Testnet / Mainnet constants are defined here.
 * Switch between networks via the NEXT_PUBLIC_NETWORK env var.
 */

type NetworkConfig = {
  networkId: string;
  chainId: number;
  rpcUrl: string;
  usdcAddress: `0x${string}`;
  gatewayWallet: `0x${string}`;
  gatewayApiUrl: string;
  gatewayDomain: number;
  explorerBaseUrl: string;
  label: string;
};

const ARC_TESTNET: NetworkConfig = {
  networkId: "eip155:5042002",
  chainId: 5042002,
  rpcUrl: "https://rpc.testnet.arc.network",
  usdcAddress: "0x3600000000000000000000000000000000000000",
  gatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
  gatewayApiUrl: "https://gateway-api-testnet.circle.com/v1/balances",
  gatewayDomain: 26,
  explorerBaseUrl: "https://testnet.arcscan.app",
  label: "Arc Testnet",
};

const ARC_MAINNET: NetworkConfig = {
  networkId: "eip155:5042",
  chainId: 5042,
  rpcUrl: "https://rpc.arc.network",
  usdcAddress: "0x3600000000000000000000000000000000000000",
  gatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
  gatewayApiUrl: "https://gateway-api.circle.com/v1/balances",
  gatewayDomain: 26,
  explorerBaseUrl: "https://arcscan.app",
  label: "Arc Mainnet",
};

const NETWORKS: Record<string, NetworkConfig> = {
  testnet: ARC_TESTNET,
  mainnet: ARC_MAINNET,
};

const networkName =
  (typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_NETWORK
    : undefined) ?? "testnet";

export const network: NetworkConfig = NETWORKS[networkName] ?? ARC_TESTNET;

export const PROTOCOL_FEE_RATE = 0.01;
