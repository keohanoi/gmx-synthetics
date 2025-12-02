# GMX Synthetics - Mantle L2 Deployment Guide

Complete guide for deploying GMX Synthetics to Mantle L2.

## Table of Contents
1. [Overview](#overview)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Configuration Changes](#configuration-changes)
4. [Environment Setup](#environment-setup)
5. [Deployment Process](#deployment-process)
6. [Post-Deployment](#post-deployment)
7. [Troubleshooting](#troubleshooting)
8. [Mantle L2 Specifics](#mantle-l2-specifics)

---

## Overview

### What Gets Deployed

GMX Synthetics deployment includes **~140 contracts**:
- Core infrastructure (DataStore, RoleStore, EventEmitter, Oracle)
- Factories (MarketFactory, GlvFactory)
- Handlers (Order, Deposit, Withdrawal, Liquidation, ADL, Shift)
- Routers (ExchangeRouter, SubaccountRouter, GlvRouter)
- Utility libraries and supporting contracts

### Prerequisites

- **Node.js**: v16+ required
- **Deployer Account**: Funded with sufficient MNT for gas (~5-10 MNT estimated)
- **RPC Access**: Reliable Mantle RPC endpoint
- **Block Explorer API**: Mantle Explorer API key for verification
- **Time Estimate**: 30-60 minutes for full deployment
- **Technical Knowledge**: Solidity, Hardhat, and deployment experience

### Mantle L2 Information

**Mantle Mainnet:**
- Chain ID: `5000`
- RPC: `https://rpc.mantle.xyz`
- Explorer: `https://explorer.mantle.xyz`
- Native Token: MNT
- Block Time: ~1 second

**Mantle Sepolia Testnet:**
- Chain ID: `5003`
- RPC: `https://rpc.sepolia.mantle.xyz`
- Explorer: `https://explorer.sepolia.mantle.xyz`
- Faucet: Available via Mantle Discord

---

## Pre-Deployment Checklist

### 1. Account Preparation

- [ ] Generate or import deployer private key
- [ ] Fund deployer account with 5-10 MNT (mainnet) or testnet MNT
- [ ] Obtain Mantle Explorer API key from https://explorer.mantle.xyz

### 2. Token Information Gathering

Collect contract addresses for tokens on Mantle:

- [ ] **wMNT** (Wrapped MNT) - Native wrapped token
- [ ] **USDC** - Circle USD Coin (or bridged USDC.e)
- [ ] **USDT** - Tether USD
- [ ] **WETH** - Wrapped Ethereum
- [ ] **WBTC** - Wrapped Bitcoin
- [ ] **Other tokens** - Additional collateral/index tokens

### 3. Oracle Configuration

- [ ] Identify available Chainlink price feeds on Mantle
- [ ] Check Chainlink Data Streams availability
- [ ] Prepare oracle signer addresses (for GMX keepers)
- [ ] Determine backup oracle strategies

### 4. Operational Addresses

Prepare addresses for roles:

- [ ] **Order Keepers** - Execute orders (can use GMX keeper network)
- [ ] **Liquidation Keepers** - Execute liquidations
- [ ] **ADL Keepers** - Execute auto-deleveraging
- [ ] **Config Keeper** - Update configurations
- [ ] **Multisig/Timelock Admin** - Governance address
- [ ] **Fee Receivers** - Protocol fee recipient addresses

### 5. Infrastructure

- [ ] Set up reliable Mantle RPC (own node or service like Ankr, QuickNode)
- [ ] Configure monitoring/alerting for deployment
- [ ] Prepare backup RPC endpoints

---

## Configuration Changes

### 1. Hardhat Configuration

**File**: `hardhat.config.ts`

**Add Mantle Network** (around line 205):

```typescript
networks: {
  // ... existing networks

  mantle: {
    url: getRpcUrl("mantle"),
    chainId: 5000, // Mantle mainnet
    accounts: getEnvAccounts(),
    verify: {
      etherscan: {
        apiUrl: "https://api.mantlescan.xyz/api", // Or explorer.mantle.xyz API
        apiKey: process.env.MANTLE_SCAN_API_KEY || "",
      },
    },
    blockGasLimit: 30_000_000, // Mantle block gas limit
    gasPrice: "auto",
  },

  mantleSepolia: {
    url: getRpcUrl("mantleSepolia"),
    chainId: 5003, // Mantle Sepolia testnet
    accounts: getEnvAccounts(),
    verify: {
      etherscan: {
        apiUrl: "https://api-sepolia.mantlescan.xyz/api",
        apiKey: process.env.MANTLE_SCAN_API_KEY || "",
      },
    },
    blockGasLimit: 30_000_000,
  },
},
```

**Update RPC URL Helper** (around line 46):

```typescript
const defaultRpcs: { [network: string]: string } = {
  // ... existing RPCs
  mantle: "https://rpc.mantle.xyz",
  mantleSepolia: "https://rpc.sepolia.mantle.xyz",
};
```

**Update Explorer URL Helper** (around line 72):

```typescript
function getExplorerUrl(network: string) {
  // ... existing cases
  if (network === "mantle") {
    return "https://api.mantlescan.xyz/api";
  }
  if (network === "mantleSepolia") {
    return "https://api-sepolia.mantlescan.xyz/api";
  }
  // ...
}
```

**Update Block Explorer URL** (around line 95):

```typescript
function getBlockExplorerUrl(network: string) {
  // ... existing cases
  if (network === "mantle") {
    return "https://explorer.mantle.xyz";
  }
  if (network === "mantleSepolia") {
    return "https://explorer.sepolia.mantle.xyz";
  }
  // ...
}
```

**Update API Key Helper** (around line 115):

```typescript
function getEtherscanApiKey(network: string) {
  // ... existing cases
  if (network === "mantle" || network === "mantleSepolia") {
    return process.env.MANTLE_SCAN_API_KEY || "";
  }
  // ...
}
```

**Add Custom Chain Config** (around line 335):

```typescript
customChains: [
  // ... existing chains
  {
    network: "mantle",
    chainId: 5000,
    urls: {
      apiURL: "https://api.mantlescan.xyz/api",
      browserURL: "https://explorer.mantle.xyz",
    },
  },
  {
    network: "mantleSepolia",
    chainId: 5003,
    urls: {
      apiURL: "https://api-sepolia.mantlescan.xyz/api",
      browserURL: "https://explorer.sepolia.mantle.xyz",
    },
  },
],
```

---

### 2. Chain Configuration

**File**: `config/chains.ts`

**Add Mantle to Mainnet Deployments**:

```typescript
export const EXISTING_MAINNET_DEPLOYMENTS = [
  "arbitrum",
  "avalanche",
  "botanix",
  "mantle" // Add this
];
```

---

### 3. Token Configuration

**File**: `config/tokens.ts`

**Add Mantle Token Configurations** (add to exports object):

```typescript
mantle: {
  // Wrapped Native Token
  wMNT: {
    address: "0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8", // Example: Replace with actual wMNT address
    decimals: 18,
    wrappedNative: true,
    transferGasLimit: 200 * 1000,

    // Chainlink Price Feed (if available)
    priceFeed: {
      address: "0x...", // MNT/USD Chainlink feed address
      decimals: 8,
      heartbeatDuration: (24 + 1) * 60 * 60, // 25 hours
    },

    // Chainlink Data Streams (if available)
    dataStreamFeedId: "0x...", // MNT Data Stream ID
    dataStreamFeedDecimals: 18,

    // Alternative: Use Edge oracle or other oracle
    edge: {
      address: "0x...", // Edge oracle address for MNT
    },
  },

  // USDC (Native or Bridged)
  USDC: {
    address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9", // Example: Replace with actual
    decimals: 6,
    transferGasLimit: 200 * 1000,

    priceFeed: {
      address: "0x...", // USDC/USD feed
      decimals: 8,
      heartbeatDuration: (24 + 1) * 60 * 60,
    },

    dataStreamFeedId: "0x...",
    dataStreamFeedDecimals: 8,
  },

  // USDT
  USDT: {
    address: "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE", // Example: Replace with actual
    decimals: 6,
    transferGasLimit: 200 * 1000,

    priceFeed: {
      address: "0x...", // USDT/USD feed
      decimals: 8,
      heartbeatDuration: (24 + 1) * 60 * 60,
    },
  },

  // Wrapped Ethereum
  WETH: {
    address: "0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111", // Example: Replace with actual
    decimals: 18,
    transferGasLimit: 200 * 1000,

    priceFeed: {
      address: "0x...", // ETH/USD feed
      decimals: 8,
      heartbeatDuration: (1 + 1) * 60 * 60, // 2 hours
    },

    dataStreamFeedId: "0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782", // ETH/USD
    dataStreamFeedDecimals: 18,
  },

  // Wrapped Bitcoin
  WBTC: {
    address: "0xCAbAE6f6Ea1ecaB08Ad02fE02ce9A44F09aebfA2", // Example: Replace with actual
    decimals: 8,
    transferGasLimit: 200 * 1000,

    priceFeed: {
      address: "0x...", // BTC/USD feed
      decimals: 8,
      heartbeatDuration: (1 + 1) * 60 * 60,
    },

    dataStreamFeedId: "0x00036fe43f87884450b4c7e093cd5ed99cac6640d8c2000e6afc02c8838d0265", // BTC/USD
    dataStreamFeedDecimals: 8,
  },

  // Add more tokens as needed (ARB, LINK, etc.)
},
```

**Important Notes:**
- Replace example addresses with actual Mantle token addresses
- Verify all token decimals
- Check Chainlink feed availability on Mantle
- If Chainlink Data Streams not available, use price feeds or Edge oracle
- Set appropriate `heartbeatDuration` for each feed

---

### 4. Market Configuration

**File**: `config/markets.ts`

**Add Mantle Markets** (add to exports object):

```typescript
mantle: {
  // ETH/USD Perpetual Market
  "ETH/USD": {
    // Tokens
    tokens: {
      indexToken: "WETH",
      longToken: "WETH",
      shortToken: "USDC",
    },

    // Virtual IDs for cross-market inventory tracking
    virtualTokenIdForIndexToken: hashString("PERP:ETH/USD"),
    virtualMarketId: hashString("SPOT:ETH/USD"),

    // Pool Limits
    maxLongTokenPoolAmount: expandDecimals(5_000, 18), // 5,000 WETH
    maxShortTokenPoolAmount: expandDecimals(15_000_000, 6), // $15M USDC
    maxLongTokenPoolUsdForDeposit: decimalToFloat(10_000_000), // $10M
    maxShortTokenPoolUsdForDeposit: decimalToFloat(10_000_000), // $10M

    // Open Interest Limits
    maxOpenInterestForLongs: decimalToFloat(10_000_000), // $10M
    maxOpenInterestForShorts: decimalToFloat(10_000_000), // $10M

    // Reserve Factors
    reserveFactorLongs: percentageToFloat("95%"),
    reserveFactorShorts: percentageToFloat("95%"),

    // Position Limits
    minCollateralUsd: decimalToFloat(1), // $1 minimum
    minCollateralFactor: decimalToFloat(1, 2), // 1%

    // Position Fees (0.05% - 0.07%)
    positionFeeFactorForPositiveImpact: decimalToFloat(5, 4), // 0.05%
    positionFeeFactorForNegativeImpact: decimalToFloat(7, 4), // 0.07%

    // Swap Fees (0.05% - 0.06%)
    swapFeeFactorForPositiveImpact: decimalToFloat(5, 4), // 0.05%
    swapFeeFactorForNegativeImpact: decimalToFloat(6, 4), // 0.06%

    // Price Impact
    positionImpactExponentFactor: decimalToFloat(2, 0), // 2.0 (quadratic)
    positionImpactFactor_positive: decimalToFloat(5, 11), // 0.00000005
    positionImpactFactor_negative: decimalToFloat(1, 10), // 0.0000001
    maxPositionImpactFactorForLiquidations: decimalToFloat(1, 2), // 1%

    swapImpactExponentFactor: decimalToFloat(2, 0),
    swapImpactFactor_positive: decimalToFloat(5, 10), // 0.0000005
    swapImpactFactor_negative: decimalToFloat(1, 9), // 0.000001

    // Borrowing Fees
    borrowingFactor: decimalToFloat(1, 7), // 0.0000001 per second (~3.15% per year)
    borrowingFactorForLongs: decimalToFloat(1, 7),
    borrowingFactorForShorts: decimalToFloat(1, 7),
    borrowingExponentFactor_long: decimalToFloat(1),
    borrowingExponentFactor_short: decimalToFloat(1),
    optimalUsageFactor: percentageToFloat("80%"),
    baseBorrowingFactor: decimalToFloat(5, 8), // 0.00000005

    // Funding Fees
    fundingFactor: decimalToFloat(16, 7), // 0.0000016 per second
    fundingExponentFactor: decimalToFloat(1),
    fundingIncreaseFactorPerSecond: 0,
    fundingDecreaseFactorPerSecond: 0,
    thresholdForStableFunding: 0,
    thresholdForDecreaseFunding: 0,
    minFundingFactorPerSecond: 0,
    maxFundingFactorPerSecond: decimalToFloat(3, 6), // 0.000003

    // PnL Factors
    maxPnlFactorForTraders_long: decimalToFloat(80, 2), // 80%
    maxPnlFactorForTraders_short: decimalToFloat(80, 2), // 80%
    maxPnlFactorForAdl_long: decimalToFloat(45, 2), // 45%
    maxPnlFactorForAdl_short: decimalToFloat(45, 2), // 45%
    minPnlFactorAfterAdl_long: decimalToFloat(40, 2), // 40%
    minPnlFactorAfterAdl_short: decimalToFloat(40, 2), // 40%
    maxPnlFactorForDeposits_long: decimalToFloat(80, 2),
    maxPnlFactorForDeposits_short: decimalToFloat(80, 2),
    maxPnlFactorForWithdrawals_long: decimalToFloat(80, 2),
    maxPnlFactorForWithdrawals_short: decimalToFloat(80, 2),

    // Position Impact Pool
    positionImpactPoolDistributionRate: expandDecimals(1, 30), // 1 token per second
    minPositionImpactPoolAmount: expandDecimals(1, 17), // 0.1 WETH

    // Collateral Limits
    maxCollateralSum_long: decimalToFloat(10_000_000), // $10M
    maxCollateralSum_short: decimalToFloat(10_000_000), // $10M
  },

  // BTC/USD Perpetual Market
  "BTC/USD": {
    tokens: {
      indexToken: "WBTC",
      longToken: "WBTC",
      shortToken: "USDC",
    },

    virtualTokenIdForIndexToken: hashString("PERP:BTC/USD"),
    virtualMarketId: hashString("SPOT:BTC/USD"),

    // Pool Limits (smaller due to higher BTC price)
    maxLongTokenPoolAmount: expandDecimals(500, 8), // 500 WBTC
    maxShortTokenPoolAmount: expandDecimals(25_000_000, 6), // $25M USDC
    maxLongTokenPoolUsdForDeposit: decimalToFloat(20_000_000),
    maxShortTokenPoolUsdForDeposit: decimalToFloat(20_000_000),

    // Open Interest
    maxOpenInterestForLongs: decimalToFloat(15_000_000), // $15M
    maxOpenInterestForShorts: decimalToFloat(15_000_000),

    // Use similar parameters to ETH/USD with adjustments
    // ... (copy and adjust parameters as needed)
  },

  // USDC/USDT Swap-Only Market (No perpetuals)
  "SWAP-ONLY:USDC/USDT": {
    swapOnly: true,

    tokens: {
      longToken: "USDC",
      shortToken: "USDT",
    },

    virtualMarketId: hashString("SPOT:USDC/USDT"),

    // Pool Limits
    maxLongTokenPoolAmount: expandDecimals(10_000_000, 6), // $10M USDC
    maxShortTokenPoolAmount: expandDecimals(10_000_000, 6), // $10M USDT

    // Swap Fees (lower for stablecoin swaps)
    swapFeeFactorForPositiveImpact: decimalToFloat(1, 5), // 0.001%
    swapFeeFactorForNegativeImpact: decimalToFloat(2, 5), // 0.002%

    // Price Impact (lower for stablecoins)
    swapImpactExponentFactor: decimalToFloat(2, 0),
    swapImpactFactor_positive: decimalToFloat(5, 11), // Very low
    swapImpactFactor_negative: decimalToFloat(1, 10),

    // No borrowing/funding for swap-only markets
  },
},
```

**Market Configuration Guidelines:**
- Start with conservative limits (can increase later)
- Set pool limits based on expected TVL
- Adjust fees based on market volatility
- Configure price impact to prevent manipulation
- Use virtual IDs for inventory tracking across markets

---

### 5. Oracle Configuration

**File**: `config/oracle.ts`

**Add Mantle Oracle Settings**:

```typescript
mantle: {
  // Oracle Signers (GMX keeper addresses that sign prices)
  signers: [
    "0x...", // Primary oracle signer
    "0x...", // Backup oracle signer (optional)
  ],

  // Minimum number of signers required
  minOracleSigners: 1, // Increase to 2-3 for mainnet

  // Price age limits
  maxOraclePriceAge: 5 * 60, // 5 minutes
  maxAtomicOraclePriceAge: 30, // 30 seconds for atomic orders
  maxOracleTimestampRange: 60, // 60 seconds

  // Price validation
  maxRefPriceDeviationFactor: decimalToFloat(5, 1), // 50% max deviation from reference

  // Block confirmations
  minOracleBlockConfirmations: 255, // Wait for block finality

  // Chainlink Data Streams (if available on Mantle)
  dataStreamFeedVerifier: "0x...", // Chainlink verifier contract address
  chainlinkPaymentToken: "0x...", // LINK token address on Mantle (if available)

  // Edge Oracle (alternative oracle)
  edgeOracleSigner: "0x...", // Edge oracle signer address
},
```

**Important:**
- Use GMX's keeper network addresses for signers
- Increase `minOracleSigners` to 2-3 for production
- Verify Chainlink Data Streams availability on Mantle
- Consider Edge oracle as backup if Chainlink limited

---

### 6. Role Configuration

**File**: `config/roles.ts`

**Import Mantle Roles**:

```typescript
import * as mantle from "./roleConfigs/mantle";

// ... existing imports

export default {
  // ... existing network roles
  mantle: mantle.default,
};
```

**Create New File**: `config/roleConfigs/mantle.ts`

```typescript
import { BigNumberish } from "ethers";

// Role identifiers
const CONTROLLER = "0x0000000000000000000000000000000000000000000000000000000000000001";
const ORDER_KEEPER = "0x..."; // keccak256("ORDER_KEEPER")
const ADL_KEEPER = "0x..."; // keccak256("ADL_KEEPER")
const LIQUIDATION_KEEPER = "0x..."; // keccak256("LIQUIDATION_KEEPER")
const MARKET_KEEPER = "0x..."; // keccak256("MARKET_KEEPER")
const CONFIG_KEEPER = "0x..."; // keccak256("CONFIG_KEEPER")
const LIMITED_CONFIG_KEEPER = "0x..."; // keccak256("LIMITED_CONFIG_KEEPER")
const FROZEN_ORDER_KEEPER = "0x..."; // keccak256("FROZEN_ORDER_KEEPER")
const TIMELOCK_ADMIN = "0x..."; // keccak256("TIMELOCK_ADMIN")
const TIMELOCK_MULTISIG = "0x..."; // keccak256("TIMELOCK_MULTISIG")
const ROLE_ADMIN = "0x..."; // keccak256("ROLE_ADMIN")
const ROUTER_PLUGIN = "0x..."; // keccak256("ROUTER_PLUGIN")

export default {
  // Admin/Governance
  [CONTROLLER]: {
    [TIMELOCK_MULTISIG]: true,
  },

  [TIMELOCK_ADMIN]: {
    [TIMELOCK_MULTISIG]: true,
  },

  [ROLE_ADMIN]: {
    [TIMELOCK_MULTISIG]: true,
  },

  // Keepers (use GMX keeper network addresses)
  [ORDER_KEEPER]: {
    "0x...": true, // GMX order keeper 1
    "0x...": true, // GMX order keeper 2
  },

  [LIQUIDATION_KEEPER]: {
    "0x...": true, // GMX liquidation keeper
  },

  [ADL_KEEPER]: {
    "0x...": true, // GMX ADL keeper
  },

  [FROZEN_ORDER_KEEPER]: {
    "0x...": true, // GMX frozen order keeper
  },

  // Configuration
  [CONFIG_KEEPER]: {
    [TIMELOCK_MULTISIG]: true,
    "0x...": true, // Config keeper address
  },

  [LIMITED_CONFIG_KEEPER]: {
    "0x...": true, // Limited config keeper
  },

  [MARKET_KEEPER]: {
    "0x...": true, // Market keeper
  },

  // Router plugins (granted during deployment)
  [ROUTER_PLUGIN]: {
    // Routers get this role automatically during deployment
  },
};
```

**Important:**
- Replace `TIMELOCK_MULTISIG` with actual multisig/governance address
- Use GMX's keeper network addresses or deploy own keepers
- For testnet, can use single EOA for all keeper roles
- For mainnet, use multiple independent keepers

---

### 7. General Configuration

**File**: `config/general.ts`

**Add Mantle-Specific Overrides** (if needed):

```typescript
export default async function (hre: HardhatRuntimeEnvironment) {
  const network = hre.network.name;

  // Default configuration (applies to all networks)
  const config = {
    // ... existing default config
  };

  // Network-specific overrides
  if (network === "mantle") {
    // Adjust gas limits if needed for Mantle
    config.singleSwapGasLimit = 1_000_000; // Example adjustment

    // Adjust fee factors if needed
    config.feeReceiverFactor = percentageToFloat("40%"); // Example

    // Add any Mantle-specific settings
  }

  return config;
}
```

**Typically No Changes Needed** - Defaults work for most networks.

---

### 8. LayerZero Configuration (Optional)

**File**: `config/layerZero.ts`

**Add Mantle LayerZero Endpoint** (if cross-chain functionality needed):

```typescript
mantle: {
  endpoint: "0x...", // LayerZero endpoint on Mantle (get from LayerZero docs)
},
```

**Note**: Only needed if enabling cross-chain operations between Mantle and other chains.

---

## Environment Setup

### 1. Create/Update .env File

Create `.env` in project root:

```bash
# Private Keys
ACCOUNT_KEY=0x... # Deployer private key (DO NOT COMMIT)
# Or use key file:
# ACCOUNT_KEY_FILE=deployer

# RPC URLs (or use .rpcs.json)
MANTLE_RPC_URL=https://rpc.mantle.xyz
MANTLE_SEPOLIA_RPC_URL=https://rpc.sepolia.mantle.xyz

# Block Explorer API Keys
MANTLE_SCAN_API_KEY=your_mantle_explorer_api_key_here

# Deployment Settings
SKIP_AUTO_HANDLER_REDEPLOYMENT=true
SKIP_NEW_MARKETS=false

# Optional: Network-specific keys
# MANTLE_ACCOUNT_KEY=0x...
```

### 2. Create .rpcs.json (Alternative)

Create `.rpcs.json` for RPC URLs:

```json
{
  "mantle": "https://rpc.mantle.xyz",
  "mantleSepolia": "https://rpc.sepolia.mantle.xyz"
}
```

### 3. Secure Key Storage (Recommended)

**Option A: Use Key File**

1. Create `keys/` directory
2. Create `keys/deployer` file with private key
3. Set in .env: `ACCOUNT_KEY_FILE=deployer`
4. Add `keys/` to `.gitignore`

**Option B: Use Hardware Wallet**
- Configure Hardhat Ledger plugin for production deployments

---

## Deployment Process

### Step 1: Verify Configuration

```bash
# Check network connectivity
npx hardhat run scripts/checkNetwork.ts --network mantle

# Verify deployer balance
npx hardhat run scripts/checkBalance.ts --network mantle
```

### Step 2: Deploy Core Infrastructure

```bash
# Set environment variable
export SKIP_AUTO_HANDLER_REDEPLOYMENT=true

# Deploy all contracts
npx hardhat deploy --network mantle

# This will deploy in order:
# 1. RoleStore
# 2. DataStore
# 3. EventEmitter
# 4. Core contracts (Oracle, MarketFactory, etc.)
# 5. Handlers (Order, Deposit, Withdrawal, etc.)
# 6. Routers (ExchangeRouter, GlvRouter, etc.)
# 7. Configure roles
# 8. Configure oracle
# 9. Create markets
```

**Deployment Time**: ~30-60 minutes depending on network

### Step 3: Monitor Deployment

Watch for errors in console output:

```
Deploying RoleStore...
✓ RoleStore deployed to: 0x...
Deploying DataStore...
✓ DataStore deployed to: 0x...
...
```

**If Deployment Fails:**
- Hardhat-deploy tracks deployments in `deployments/mantle/`
- Re-run `npx hardhat deploy --network mantle` to continue from failure point
- Deployment is idempotent (safe to re-run)

### Step 4: Deploy Specific Components (if needed)

```bash
# Deploy only specific tags
npx hardhat deploy --network mantle --tags DataStore
npx hardhat deploy --network mantle --tags Handlers
npx hardhat deploy --network mantle --tags Markets

# Skip market creation
SKIP_NEW_MARKETS=true npx hardhat deploy --network mantle
```

### Step 5: Verify Contracts

```bash
# Verify all contracts on block explorer
npx hardhat etherscan-verify --network mantle

# Verify specific contract
npx hardhat verify --network mantle 0x... [constructor args]
```

### Step 6: Generate Deployment Documentation

```bash
# Generate deployment docs
npx hardhat generate-deployment-docs --networks mantle

# Creates: docs/mantle-deployments.md
```

---

## Post-Deployment

### 1. Verification Checklist

- [ ] All contracts deployed successfully (check `deployments/mantle/`)
- [ ] Contracts verified on Mantle Explorer
- [ ] Roles assigned correctly (query RoleStore)
- [ ] Oracle configured with correct signers
- [ ] Markets created (check MarketFactory events)
- [ ] Market parameters set correctly (query DataStore)
- [ ] ExchangeRouter functions are callable
- [ ] Reader contract returns expected data

### 2. Test Basic Operations

**Query Market Info:**

```bash
npx hardhat run scripts/testMarket.ts --network mantle
```

```typescript
// scripts/testMarket.ts
import { ethers } from "hardhat";

async function main() {
  const reader = await ethers.getContract("Reader");
  const dataStore = await ethers.getContract("DataStore");

  // Get markets
  const markets = await reader.getMarkets(dataStore.address, 0, 10);
  console.log("Markets:", markets);

  // Get market info
  const market = markets[0];
  const marketInfo = await reader.getMarket(dataStore.address, market);
  console.log("Market Info:", marketInfo);
}

main();
```

**Test Order Creation:**

```bash
npx hardhat run scripts/testOrder.ts --network mantle
```

```typescript
// scripts/testOrder.ts
import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  const exchangeRouter = await ethers.getContract("ExchangeRouter");

  // Approve collateral token
  const weth = await ethers.getContractAt("IERC20", WETH_ADDRESS);
  await weth.approve(exchangeRouter.address, ethers.utils.parseEther("0.1"));

  // Create order params
  const orderParams = {
    addresses: {
      receiver: signer.address,
      callbackContract: ethers.constants.AddressZero,
      uiFeeReceiver: ethers.constants.AddressZero,
      market: MARKET_ADDRESS,
      initialCollateralToken: WETH_ADDRESS,
      swapPath: [],
    },
    numbers: {
      sizeDeltaUsd: ethers.utils.parseUnits("1000", 30), // $1000
      initialCollateralDeltaAmount: ethers.utils.parseEther("0.1"),
      triggerPrice: 0,
      acceptablePrice: ethers.constants.MaxUint256,
      executionFee: ethers.utils.parseEther("0.001"), // 0.001 MNT
      callbackGasLimit: 0,
      minOutputAmount: 0,
    },
    orderType: 2, // MarketIncrease
    decreasePositionSwapType: 0,
    isLong: true,
    shouldUnwrapNativeToken: false,
    referralCode: ethers.constants.HashZero,
  };

  // Create order
  const tx = await exchangeRouter.createOrder(
    orderParams,
    { value: ethers.utils.parseEther("0.001") }
  );

  console.log("Order created:", tx.hash);
  await tx.wait();
}

main();
```

### 3. Configure Monitoring

Set up monitoring for:

- Contract interactions
- Order executions
- Liquidations
- ADL events
- Oracle price updates
- Gas usage
- TVL and trading volume

**Tools:**
- Tenderly for transaction monitoring
- The Graph for subgraph indexing
- Custom monitoring scripts
- Sentry/DataDog for error tracking

### 4. Update Documentation

- [ ] Document all deployed contract addresses
- [ ] Update frontend configuration with new addresses
- [ ] Create operations runbook
- [ ] Document keeper setup

### 5. Security Review

- [ ] Review all role assignments
- [ ] Verify multisig has correct signers
- [ ] Test emergency pause mechanisms
- [ ] Audit market configurations
- [ ] Review oracle settings

---

## Troubleshooting

### Common Deployment Errors

#### 1. Insufficient Gas

**Error**: `Transaction ran out of gas`

**Solution**:
```typescript
// In hardhat.config.ts, increase gas limit
gasLimit: 30_000_000

// Or set gas price manually
gasPrice: ethers.utils.parseUnits("20", "gwei")
```

#### 2. RPC Connection Issues

**Error**: `Connection timeout`, `Network error`

**Solution**:
- Use reliable RPC (own node or premium service)
- Add backup RPCs in `.rpcs.json`
- Increase timeout in hardhat config

#### 3. Nonce Issues

**Error**: `Nonce too low`, `Transaction already imported`

**Solution**:
```bash
# Reset nonce
npx hardhat clean
rm -rf deployments/mantle/
npx hardhat deploy --network mantle --reset
```

#### 4. Contract Size Exceeded

**Error**: `Contract code size exceeds limit`

**Solution**:
- This shouldn't happen with current contracts
- If it does, libraries are split to reduce size
- Check solc optimizer settings in hardhat.config.ts

#### 5. Verification Failures

**Error**: `Contract verification failed`

**Solutions**:
```bash
# Check compiler settings match deployment
npx hardhat verify --network mantle 0x... [constructor args]

# Try manual verification on explorer
# Copy flattened source: npx hardhat flatten contracts/YourContract.sol
```

#### 6. Market Creation Fails

**Error**: `Market already exists`, `Invalid token`

**Solution**:
- Check token addresses in `config/tokens.ts`
- Verify tokens exist on Mantle
- Check market isn't already created
- Review logs: `deployments/mantle/.migrations.json`

#### 7. Role Assignment Fails

**Error**: `Access denied`, `Unauthorized`

**Solution**:
- Verify deployer has ROLE_ADMIN or CONTROLLER role
- Check addresses in `config/roleConfigs/mantle.ts`
- Use correct role hash (can get from `contracts/role/Role.sol`)

### Debugging Commands

```bash
# Check deployment status
npx hardhat deployments --network mantle

# Get contract address
npx hardhat run scripts/getAddress.ts --network mantle

# Call contract function
npx hardhat console --network mantle
> const dataStore = await ethers.getContract("DataStore")
> await dataStore.getAddress("SOME_KEY")

# Check transaction
npx hardhat run scripts/checkTx.ts --network mantle <txHash>

# Re-run specific deployment script
npx hardhat deploy --network mantle --tags Specific --reset
```

---

## Mantle L2 Specifics

### Gas Costs on Mantle

**Estimated Deployment Costs:**
- Total deployment: ~5-10 MNT
- Single contract: ~0.01-0.1 MNT
- Configuration transactions: ~0.001-0.01 MNT each

**Gas Optimization Tips:**
- Deploy during low network activity
- Use optimized compiler settings
- Batch configuration transactions

### Block Time & Finality

- **Block Time**: ~1 second (fast compared to Ethereum)
- **Finality**: ~12 seconds (L2 finality before L1 commitment)
- **Oracle Settings**: Set `minOracleBlockConfirmations` appropriately

### MNT Token Handling

**wMNT (Wrapped MNT)**:
- Used as collateral like wETH on Ethereum
- Ensure wMNT address is correct in token config
- Set `wrappedNative: true` flag
- Configure appropriate transfer gas limits

### Chainlink Oracle Availability

**Check Oracle Support on Mantle:**
- Price Feeds: https://docs.chain.link/data-feeds/price-feeds/addresses?network=mantle
- Data Streams: May have limited availability
- Backup: Use Edge oracle or custom oracle solution

### Mantle-Specific Considerations

1. **RPC Rate Limits**: Use own node or premium RPC for reliability
2. **Sequencer**: Mantle uses centralized sequencer (may have downtime)
3. **Bridge**: Consider Mantle native bridge for token availability
4. **Gas Token**: MNT is native gas token (not ETH)
5. **EVM Compatibility**: Fully EVM-compatible, but test thoroughly

### Testing on Mantle Sepolia

**Recommended Approach:**
1. Deploy to Mantle Sepolia testnet first
2. Test all operations (orders, deposits, withdrawals)
3. Verify keeper operations
4. Load test with volume
5. Deploy to mainnet after successful testing

**Testnet Faucets:**
- Get testnet MNT from Mantle Discord
- Bridge testnet tokens from Sepolia via Mantle bridge

---

## Appendix

### A. Deployed Contract Registry Template

Create `deployed-contracts-mantle.json`:

```json
{
  "network": "mantle",
  "chainId": 5000,
  "deployedAt": "2025-12-01T00:00:00Z",
  "contracts": {
    "core": {
      "DataStore": "0x...",
      "RoleStore": "0x...",
      "EventEmitter": "0x...",
      "Oracle": "0x...",
      "OracleStore": "0x...",
      "MarketFactory": "0x...",
      "GlvFactory": "0x..."
    },
    "handlers": {
      "OrderHandler": "0x...",
      "DepositHandler": "0x...",
      "WithdrawalHandler": "0x...",
      "LiquidationHandler": "0x...",
      "AdlHandler": "0x...",
      "ShiftHandler": "0x..."
    },
    "routers": {
      "ExchangeRouter": "0x...",
      "GlvRouter": "0x...",
      "SubaccountRouter": "0x..."
    },
    "reader": {
      "Reader": "0x..."
    },
    "markets": {
      "ETH-USD": "0x...",
      "BTC-USD": "0x..."
    }
  }
}
```

### B. Quick Deployment Checklist

- [ ] Mantle RPC access configured
- [ ] Deployer account funded (5-10 MNT)
- [ ] Token addresses researched and added to config
- [ ] Oracle feeds verified on Mantle
- [ ] Keeper addresses prepared
- [ ] Multisig/governance address ready
- [ ] hardhat.config.ts updated with Mantle network
- [ ] config/chains.ts updated
- [ ] config/tokens.ts populated with Mantle tokens
- [ ] config/markets.ts defined for initial markets
- [ ] config/oracle.ts configured
- [ ] config/roleConfigs/mantle.ts created
- [ ] .env file created with keys and settings
- [ ] Run: `npx hardhat deploy --network mantle`
- [ ] Verify contracts: `npx hardhat etherscan-verify --network mantle`
- [ ] Test basic operations
- [ ] Document deployed addresses
- [ ] Set up monitoring

### C. Useful Resources

**Mantle Documentation:**
- Official Docs: https://docs.mantle.xyz
- Developer Portal: https://developers.mantle.xyz
- Block Explorer: https://explorer.mantle.xyz
- Bridge: https://bridge.mantle.xyz

**GMX Resources:**
- GMX Docs: https://docs.gmx.io
- GitHub: https://github.com/gmx-io/gmx-synthetics
- Discord: https://discord.gg/gmx

**Chainlink on Mantle:**
- Price Feeds: https://docs.chain.link/data-feeds/price-feeds/addresses?network=mantle
- Data Streams: Check Chainlink docs for availability

**LayerZero:**
- Endpoints: https://layerzero.gitbook.io/docs/technical-reference/mainnet/supported-chain-ids

### D. Post-Deployment Operations

**Updating Market Configuration:**

```bash
# Update market parameters in config/markets.ts
# Then run:
npx hardhat update-market-config --network mantle --write

# Review changes first (without --write):
npx hardhat update-market-config --network mantle
```

**Adding New Markets:**

```bash
# Add market to config/markets.ts
# Deploy new market:
npx hardhat deploy --network mantle --tags Markets
```

**Updating Roles:**

```bash
# Update config/roleConfigs/mantle.ts
# Run role configuration:
npx hardhat deploy --network mantle --tags ConfigureRoles
```

---

## Support & Questions

For issues or questions:

1. **Check Logs**: Review `deployments/mantle/.migrations.json` for deployment history
2. **GMX Discord**: https://discord.gg/gmx
3. **GitHub Issues**: https://github.com/gmx-io/gmx-synthetics/issues
4. **Documentation**: Review docs in `/docs/` directory

---

*Last Updated: 2025-12-01*
*GMX Synthetics Version: Latest*
*Mantle L2 Chain ID: 5000 (mainnet), 5003 (testnet)*
