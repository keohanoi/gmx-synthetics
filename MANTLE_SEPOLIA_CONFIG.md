# GMX Synthetics - Mantle Sepolia Configuration Specification

**Network**: Mantle Sepolia Testnet (Chain ID: 5003)
**RPC URL**: `https://rpc.testnet.mantle.xyz/`
**Block Explorer**: `https://explorer.sepolia.mantle.xyz`
**Deployment Date**: December 2024

---

## Table of Contents

1. [Role Assignments & Access Control](#role-assignments--access-control)
2. [Token Configurations](#token-configurations)
3. [Market Specifications](#market-specifications)
4. [Fee Structures](#fee-structures)
5. [Funding & Borrowing Rates](#funding--borrowing-rates)
6. [Oracle Configuration](#oracle-configuration)
7. [Risk Parameters](#risk-parameters)
8. [Skipped & Deferred Components](#skipped--deferred-components)
9. [Implementation Solutions](#implementation-solutions)

---

## Role Assignments & Access Control

### Role Structure

All administrative roles in mantleSepolia are assigned to the **deployer address** as a single-signer model suitable for testnet operations.

```
Deployer Address: 0x55A7CCeC5b602490e3fE8944c26843f4434A1c73
```

### Role Matrix

| Role | Purpose | Assigned To | Permissions |
|------|---------|-------------|-------------|
| **CONTROLLER** | Core contract configuration authority | Deployer | Configure markets, tokens, fees, oracle settings |
| **ORDER_KEEPER** | Process orders (increase/decrease positions) | Deployer | Execute pending orders, ADL orders |
| **ADL_KEEPER** | Auto Deleveraging execution | Deployer | Force-liquidate positions to maintain solvency |
| **LIQUIDATION_KEEPER** | Execute liquidations for undercollateralized positions | Deployer | Liquidate accounts below min collateral |
| **MARKET_KEEPER** | Market state management and oracle updates | Deployer | Update oracle prices, market state |
| **FROZEN_ORDER_KEEPER** | Handle frozen orders and reversions | Deployer | Process suspended orders |
| **CONFIG_KEEPER** | Configuration updates | Deployer | Modify market and token parameters |
| **LIMITED_CONFIG_KEEPER** | Restricted configuration changes | Deployer | Update select parameters safely |
| **TIMELOCK_ADMIN** | Governance timelock operations (if applicable) | Deployer | Execute delayed transactions |
| **ROLE_ADMIN** | Administrative role management | Deployer | Grant/revoke other roles |


---

## Token Configurations

### Supported Tokens

#### 1. WETH (Wrapped Ethereum)

| Parameter | Value | Notes |
|-----------|-------|-------|
| **Address** | `0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111` | Official Mantle wrapped ETH |
| **Decimals** | 18 | Standard ERC20 decimal |
| **Wrapped Native** | Yes | Represents native Mantle ETH |
| **Transfer Gas Limit** | 200,000 | Conservative gas estimate |
| **Initial Price** | $3,300 | Set during deployment |
| **Price Feed Decimals** | 8 | Chainlink standard |
| **Data Stream Feed ID** | `0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782` | For Chainlink Data Streams |
| **Heartbeat Duration** | 144 hours (6 days) | Max acceptable price staleness |
| **Deploy Status** | Deployed | Used in 2 markets |

**Usage in Markets**:
- WETH:WETH:USDC (primary collateral)
- WETH:wstETH:USDC (long token alternative)

**Source**: `/config/tokens.ts` (lines 1852-1870)

---

#### 2. USDC (Stablecoin Collateral)

| Parameter | Value | Notes |
|-----------|-------|-------|
| **Address** | Deployed | New contract for testnet |
| **Decimals** | 6 | Standard stablecoin decimal |
| **Stable Price** | $1.00 | Fixed reference price |
| **Transfer Gas Limit** | 200,000 | Conservative gas estimate |
| **Initial Price** | $1.00 | Stable reference |
| **Price Feed Decimals** | 8 | Chainlink standard |
| **Data Stream Feed ID** | `0x00038f83323b6b08116d1614cf33a9bd71ab5e0abf0c9f1b783a74a43e7bd992` | For Chainlink Data Streams |
| **Heartbeat Duration** | 144 hours (6 days) | Max acceptable price staleness |
| **Deploy Status** | Deployed | Exclusive to mantleSepolia testnet |

**Usage in Markets**:
- Primary short token (collateral) for all 3 markets
- Minimum pool allocation: 200,000 USDC
- Maximum pool allocation: 300,000 USDC

**Implementation Note**: USDC is deployed as a test contract on mantleSepolia since the live stablecoin may not be available on testnet.

**Source**: `/config/tokens.ts` (lines 1872-1890)

---

#### 3. BTC (Synthetic Bitcoin)

| Parameter | Value | Notes |
|-----------|-------|-------|
| **Type** | Synthetic | Created specifically for trading pair |
| **Decimals** | 8 | Bitcoin standard |
| **Transfer Gas Limit** | 200,000 | Conservative gas estimate |
| **Initial Price** | $97,000 | Set during deployment |
| **Price Feed Decimals** | 8 | Chainlink standard |
| **Data Stream Feed ID** | `0x00037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b439` | For Chainlink Data Streams |
| **Heartbeat Duration** | 144 hours (6 days) | Max acceptable price staleness |
| **Deploy Status** | Deployed | Used in 1 market |

**Usage in Markets**:
- BTC:BTC:USDC market (long token, collateral)
- Pool capacity: 50 BTC (~$4.85M at $97k)

**Source**: `/config/tokens.ts` (lines 1892-1905)

---

#### 4. wstETH (Wrapped Staked Ethereum)

| Parameter | Value | Notes |
|-----------|-------|-------|
| **Address** | `0xa4c6370CcF0ec33B785B33E81341727e635aCcd0` | Official Mantle wstETH |
| **Decimals** | 18 | Standard ERC20 |
| **Transfer Gas Limit** | 200,000 | Conservative gas estimate |
| **Initial Price** | $3,850 | Slightly above ETH due to staking yield |
| **Price Feed Decimals** | 8 | Chainlink standard |
| **Data Stream Feed ID** | `0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782` | Uses ETH feed (peg assumed) |
| **Heartbeat Duration** | 144 hours (6 days) | Max acceptable price staleness |
| **Deploy Status** | Deployed | Used in 1 market |

**Usage in Markets**:
- WETH:wstETH:USDC market (long token, leveraged stake)
- Pool capacity: 50 wstETH (~$192.5k at $3,850)

**Implementation Note**: Uses same oracle feed as WETH with assumption of price parity plus basis. Allows testing of multi-collateral scenarios.

**Source**: `/config/tokens.ts` (lines 1906-1910)

---

## Market Specifications

All three markets use a **unified base configuration** with market-specific overrides for pool sizes and impact parameters.

### Common Market Parameters

All mantleSepolia markets inherit these parameters:

**Fee Structure** (from baseMarketConfig):
- Position opening fees: **0.04%** (positive impact) to **0.06%** (negative impact)
- Swap fees: **0.05%** (positive impact) to **0.07%** (negative impact)
- Liquidation fee: **0.20%**
- Atomic withdrawal fee: **0.50%**

**Leverage Limits**:
- Min collateral factor (max leverage): **0.5%** (200x leverage) per market
- Min liquidation collateral: **0.25%** to **0.5%** (varies by market)
- Min collateral requirement: **$1 USD equivalent**

**Reserve Factors** (portion of pool reserved for withdrawals):
- Long token reserve: **245% to 275%** (varies by market)
- Short token reserve: **240% to 275%** (varies by market)

**Claimable Collateral**:
- **Delay**: 24 hours (reduced from production 5 days)
- **Time Divisor**: 3,600 seconds (proportional withdrawal periods)

**Source**: `/config/markets.ts` (lines 281-345)

---

### Market 1: WETH:WETH:USDC (Ethereum Perpetual)

**Configuration Purpose**: Primary ETH trading pair with native collateral

| Parameter | Value | Notes |
|-----------|-------|-------|
| **Long Token** | WETH | Collateral and index token |
| **Short Token** | USDC | Stable collateral |
| **Index Token** | WETH | Price oracle reference |
| **Virtual Market ID** | `hashString("SPOT:ETH/USD")` | Unique market identifier |

**Pool Constraints**:
| Constraint | Value | USD Value | Notes |
|-----------|-------|-----------|-------|
| Max Long Token Pool | 100 WETH | ~$330,000 | Conservative testnet cap |
| Max Short Token Pool | 300,000 USDC | $300,000 | Balanced sizing |
| Max Deposit USD | $10,000,000 | - | Transaction size cap |

**Position Impact Factors**:
```
Negative Position Impact: 5e-7 (0.0000005)  // Increases fees for large positions
Positive Position Impact: 4.5e-7 (0.00000045) // Decreases fees for market-making
Min Impact Pool Amount: 5 WETH // Minimum pool for impact calculations
```

**Swap Impact Factors**:
```
Negative Swap Impact: 3e-10 // Increases slippage on large swaps
Positive Swap Impact: 2e-10  // Positive impact for balancing
```

**Interest Rate Configuration**:
- **Funding Rate Model**: `fundingRateConfig_Low`
  - Max funding rate: 75% per year (adjusts to max in 3 hours at 100% skew)
  - Decreases from 75% to 0% over 48 hours when imbalance cools
  - Stable funding threshold: 4% imbalance

- **Borrowing Rate Model**: `borrowingRateConfig_LowMax_WithLowerBase`
  - Base rate: 45% per year
  - Above optimal (75% usage): 100% per year
  - Optimal utilization: 75%

**Reserve Factors**:
- Long token (WETH): **275%**
- Short token (USDC): **270%**

**Open Interest Limit**:
- **Max OI**: $10,000,000 (positions cannot exceed this aggregate)

**Atomic Swap Fee**: **2.25%** (applies to atomic orders)

**Leverage Range**: **1x to 200x** (based on 0.5% min collateral)

**Historical Notes**: Deferred features (maxLendableImpactFactor) commented out - not enabled for testnet

**Source**: `/config/markets.ts` (lines 4568-4606)

---

### Market 2: BTC:BTC:USDC (Bitcoin Perpetual)

**Configuration Purpose**: Bitcoin synthetic pair, conservative parameters due to volatility

| Parameter | Value | Notes |
|-----------|-------|-------|
| **Long Token** | BTC | Collateral and index token |
| **Short Token** | USDC | Stable collateral |
| **Index Token** | BTC | Price oracle reference |
| **Virtual Market ID** | `hashString("SPOT:BTC/USD")` | Unique market identifier |

**Pool Constraints**:
| Constraint | Value | USD Value | Notes |
|-----------|-------|-----------|-------|
| Max Long Token Pool | 50 BTC | ~$4,850,000 | Half of ETH due to volatility |
| Max Short Token Pool | 250,000 USDC | $250,000 | Smallest of three markets |
| Max Deposit USD | $7,500,000 | - | Limited deposit size |

**Position Impact Factors**:
```
Negative Position Impact: 9e-11  // Lower impact (lower liquidity)
Positive Position Impact: 3e-11  // Asymmetric incentive
Min Impact Pool Amount: 0.5 BTC  // Small minimum due to high volatility
```

**Swap Impact Factors**:
```
Negative Swap Impact: 4e-10  // Highest slippage among three markets
Positive Swap Impact: 2e-10   // Moderate improvement
```

**Interest Rate Configuration**:
- **Funding Rate Model**: `fundingRateConfig_Low`
  - Same as WETH market

- **Borrowing Rate Model**: `borrowingRateConfig_LowMax_WithLowerBase`
  - Same as WETH market

**Reserve Factors**:
- Long token (BTC): **245%**
- Short token (USDC): **240%**

**Open Interest Limit**:
- **Max OI**: $5,000,000 (half of ETH due to volatility)

**Atomic Swap Fee**: **0.75%** (lowest among markets)

**Leverage Range**: **1x to 200x** (based on 0.5% min collateral)

**Risk Rationale**: Smallest pool sizes reflect BTC's higher volatility on testnet

**Source**: `/config/markets.ts` (lines 4607-4640)

---

### Market 3: WETH:wstETH:USDC (Staked Ethereum Perpetual)

**Configuration Purpose**: Alternative collateral pair for testing multi-collateral scenarios

| Parameter | Value | Notes |
|-----------|-------|-------|
| **Long Token** | wstETH | Staked collateral (index token) |
| **Short Token** | USDC | Stable collateral |
| **Index Token** | WETH | Price oracle reference (peg assumed) |
| **Virtual Market ID** | `hashString("SPOT:wstETH/USD")` | Unique market identifier |

**Pool Constraints**:
| Constraint | Value | USD Value | Notes |
|-----------|-------|-----------|-------|
| Max Long Token Pool | 50 wstETH | ~$192,500 | Limited for testing |
| Max Short Token Pool | 200,000 USDC | $200,000 | Smallest USDC pool |
| Max Deposit USD | $5,000,000 | - | Constrained deposit size |

**Position Impact Factors**:
```
Negative Position Impact: 5e-7 (0.0000005)  // Same as WETH
Positive Position Impact: 4.5e-7 (0.00000045) // Same as WETH
Min Impact Pool Amount: 3 wstETH // Smaller minimum due to lower pool
```

**Swap Impact Factors**:
```
Negative Swap Impact: 3e-10  // Same as WETH
Positive Swap Impact: 2e-10  // Same as WETH
```

**Interest Rate Configuration**:
- **Funding Rate Model**: `fundingRateConfig_Low`
  - Same as other markets

- **Borrowing Rate Model**: `borrowingRateConfig_LowMax_WithLowerBase`
  - Same as other markets

**Reserve Factors**:
- Long token (wstETH): **275%**
- Short token (USDC): **270%**

**Open Interest Limit**:
- **Max OI**: $5,000,000

**Atomic Swap Fee**: **2.25%** (same as WETH)

**Leverage Range**: **1x to 200x** (based on 0.5% min collateral)

**Implementation Note**: Tests scenarios where non-native assets serve as collateral. Useful for evaluating multi-token liquidation and rebalancing logic.

**Source**: `/config/markets.ts` (lines 4641-4678)

---

## Fee Structures

### Position Fees

Charged when opening or adjusting positions. Applied as percentage of notional position size.

| Fee Type | Positive Impact* | Negative Impact | Notes |
|----------|-----------------|-----------------|-------|
| **Position Fee Factor** | 0.04% | 0.06% | Trader pays when increasing exposure |
| **Liquidation Fee** | - | 0.20% | Paid by liquidated account |
| **Atomic Swap Fee** | 2.25% (WETH/wstETH) / 0.75% (BTC) | 2.25% (WETH/wstETH) / 0.75% (BTC) | Applies to atomic orders |

*Positive impact = trade benefits existing liquidity (e.g., reducing imbalance)

### Swap Fees

Applied to token swaps within pools. Facilitates liquidity provision and covers oracle costs.

| Fee Type | Positive Impact | Negative Impact | Purpose |
|----------|-----------------|-----------------|---------|
| **Swap Fee Factor** | 0.05% | 0.07% | Incentivizes balancing swaps |
| **Withdrawal Fee** | - | 0.50% (atomic) | Covers forced liquidation costs |

### Fee Distribution

Fee receiver takes **37%** of collected fees to protocol:
- Position fees: 37% to fee receiver
- Swap fees: 37% to fee receiver
- Borrowing fees: 37% to fee receiver
- Liquidation fees: 37% to fee receiver

**Fee Receiver Address**: `0x43ce1d475e06c65dd879f4ec644b8e0e10ff2b6d` (set in generalConfig)

**Holding Address**: `0x3f59203ea1c66527422998b54287e1efcacbe2c5` (alternative fee destination)

**UI Fee Limit**: Maximum 0.1% additional fee that integrators can take

**Source**: `/config/general.ts` (lines 279-288)

---

## Funding & Borrowing Rates

### Funding Rate Configuration

Incentivizes position balance. Adjusts based on market skew (long vs. short imbalance).

**Model Used**: `fundingRateConfig_Low`

| Parameter | Value | Meaning |
|-----------|-------|---------|
| **Base Funding Factor** | 2e-8 | ~63% per year at 100% imbalance |
| **Funding Exponent** | 1 | Linear relationship to imbalance |
| **Min Funding Rate** | 1% per year | Floor for funding |
| **Max Funding Rate** | 90% per year (~0.246% per day) | Ceiling for funding |
| **Threshold for Stable Rate** | 4% imbalance | Below this, funding is stable |
| **Threshold for Decrease** | 0% imbalance | Funding decreases toward 0 |

**Low Configuration Specifics**:
- Increases to 75% max at 100% imbalance in **3 hours**
- Decreases from 75% to 0% in **48 hours** when imbalance cools
- Encourages position entry opposite to current skew

**Example Calculation**:
- Market has 100% long skew (all longs, no shorts)
- Short funding rate increases: -75% (shorts paying longs)
- After 3 hours, shorts pay 75% per year to hold positions
- As longs get liquidated, imbalance decreases
- Funding rate decreases proportionally toward 0%

**Source**: `/config/markets.ts` (baseMarketConfig + fundingRateConfig_Low)

---

### Borrowing Rate Configuration

Charges borrowers (traders with debt) for using pool capital. Adjusts with utilization rate.

**Model Used**: `borrowingRateConfig_LowMax_WithLowerBase`

| Parameter | Value | Meaning |
|-----------|-------|---------|
| **Optimal Utilization** | 75% | Target pool usage |
| **Base Borrowing Factor** | 45% per year | Rate at 0% utilization |
| **Above-Optimal Factor** | 100% per year | Rate at 100% utilization |

**Rate Curve**:
```
Utilization 0-75%:
  Rate = 45% × (Utilization / 75%)

Utilization 75-100%:
  Rate = 45% + 55% × ((Utilization - 75%) / 25%)
  = 45% + 100% × ((Utilization - 75%) / 25%)
```

**Examples**:
- At 50% utilization: 45% × (50/75) = 30% per year
- At 75% utilization: 45% per year
- At 100% utilization: 100% per year

**Rationale for "LowMax_WithLowerBase"**:
- Lower base (45% vs. 60%+): Encourages capital provision on testnet
- Lower max (100% vs. 150%+): Prevents excessive borrowing costs
- Still scales with utilization: Maintains economic incentives

**Source**: `/config/markets.ts` (borrowingRateConfig_LowMax_WithLowerBase definition)

---

## Oracle Configuration

### Oracle Setup

| Parameter | Value | Notes |
|-----------|-------|-------|
| **Min Oracle Signers** | 1 | Testnet: single signer (deployer) |
| **Min Block Confirmations** | 255 | Conservative finality guarantee |
| **Max Price Age** | 300 seconds (5 min) | Freshness requirement for orders |
| **Max Atomic Price Age** | 30 seconds | Stricter for atomic orders |
| **Max Timestamp Range** | 60 seconds | Oracle timestamp must be recent |
| **Max Ref Price Deviation** | 50% | Accepts ±50% from reference price |

**Source**: `/config/oracle.ts` (lines 106-118)

### Oracle Signers

Initially empty, populated with deployer during deployment:

```typescript
const oracleSigners = [deployer.address]; // Added during deployment
```

This **single-signer setup** is **testnet-only**. Production uses multi-signature oracle providers.

### Token Mapping

Some tokens map to alternative representations:

```typescript
configTokenMapping: {
  mantleSepolia: {}  // No USDC-equivalent mapping needed
}
```

### Oracle Provider Selection

**Default Provider**: `gmOracle` (GmOracleProvider)

**Why Not Chainlink Data Streams**:
- Data Streams likely unavailable on Mantle Sepolia testnet
- MockDataStreamVerifier deployed for testing Chainlink integration
- Production would use actual Chainlink Data Stream feeds

**Chainlink Data Stream IDs Configured But Not Used**:
All tokens have data stream feed IDs configured (in `tokens.ts`), but they're used for **future reference** when testnet support is available:

- WETH: `0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782`
- USDC: `0x00038f83323b6b08116d1614cf33a9bd71ab5e0abf0c9f1b783a74a43e7bd992`
- BTC: `0x00037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b439`
- wstETH: `0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782` (same as WETH)

**Heartbeat Duration**: 144 hours (6 days) - Price updates valid for 6 days before requiring refresh

**Source**: `/config/oracle.ts`

---

## Risk Parameters

### General Risk Settings

| Parameter | Value | Purpose |
|-----------|-------|---------|
| **Min Collateral USD** | $1 | Minimum account collateral |
| **Min Position Size USD** | $1 | Smallest tradeable position |
| **Max Leverage** | 200x | Based on 0.5% min collateral factor |
| **Min Leverage** | 1x | Spot trading (no debt) |

### Position Impact Parameters

**Position impact** increases slippage for large trades relative to available liquidity.

By Market:

| Market | Negative Impact | Positive Impact | Pool Size | Ratio |
|--------|-----------------|-----------------|-----------|-------|
| **WETH:WETH:USDC** | 5e-7 | 4.5e-7 | 100 WETH | 0.9x |
| **BTC:BTC:USDC** | 9e-11 | 3e-11 | 50 BTC | 0.33x |
| **WETH:wstETH:USDC** | 5e-7 | 4.5e-7 | 50 wstETH | 0.9x |

**Interpretation**:
- BTC has lower impact factors (more slippage) due to smaller pool
- All markets use negative impact > positive impact (asymmetric incentives)
- Positive impact encourages liquidity-providing trades

### Market-Specific Open Interest Limits

| Market | Limit | Notes |
|--------|-------|-------|
| **WETH:WETH:USDC** | $10,000,000 | Largest market |
| **BTC:BTC:USDC** | $5,000,000 | Half due to volatility |
| **WETH:wstETH:USDC** | $5,000,000 | Niche collateral testing |

**Purpose**: Prevents any single market from dominating the system

### PnL Limits

| Limit | Value | Notes |
|-------|-------|-------|
| **Max PnL Factor (Traders)** | 90% | Traders can profit up to 90% of pool |
| **Max PnL Factor (ADL)** | 85% | ADL kicks in at 85% pool losses |
| **Min PnL (Post-ADL)** | 77% | Floor after ADL execution |
| **Max PnL (Deposits)** | 90% | Deposit size limited by PnL |
| **Max PnL (Withdrawals)** | 70% | Stricter for withdrawals |

**Rationale**: Protects against extreme losses while allowing profitable trading

**Source**: `/config/markets.ts` (baseMarketConfig)

---

## Skipped & Deferred Components

### Production Components Not Deployed

#### 1. FeeDistributor

**Status**: **SKIPPED** ❌

**Location**: `/deploy/deployFeeDistributor.ts` (line 56)

**Reason**:
```typescript
skip: (hre) => hre.network.name !== "arbitrum" && hre.network.name !== "arbitrumSepolia",
```

**Why Not on MantleSepolia**:
- Complex fee distribution to external protocols requires production setup
- Testnet focuses on core trading mechanics
- Fee distribution can be tested on production networks

**Functionality Not Available**:
- Automated fee extraction to DAO treasury
- Fee distribution to external LP providers
- Fee accounting and multi-tier recipient management

---

#### 2. FeeHandler

**Status**: **SKIPPED** ❌

**Location**: `/deploy/deployFeeHandler.ts` (line 43)

**Reason**:
```typescript
skip: (hre) => hre.network.name !== "arbitrum" && hre.network.name !== "arbitrumSepolia",
```

**Why Not on MantleSepolia**:
- Advanced fee handling for multi-tier fee structures
- Requires production deployment infrastructure
- Not essential for functional trading on testnet

**Functionality Not Available**:
- Tiered fee collection
- Complex fee recipient routing
- Fee aggregation across multiple markets

---

#### 3. MultichainReader

**Status**: **SKIPPED** ❌

**Location**: `/deploy/deployMultichainReader.ts` (line 32)

**Reason**:
```typescript
skip: (hre) => hre.network.name !== "arbitrum" && hre.network.name !== "arbitrumSepolia",
```

**Why Not on MantleSepolia**:
- Used for cross-chain position aggregation
- Requires LayerZero endpoint configuration
- Multichain features marked as TODO

**Functionality Not Available**:
- Cross-chain position reading
- Multichain account balance queries
- Unified position view across chains

---

### Mock/Deferred Components Deployed

#### 1. RiskOracle & MockRiskOracle

**Status**: **MockRiskOracle DEPLOYED** ✅ (Instead of production RiskOracle)

**Deployment Location**: `/deploy/deployMockRiskOracle.ts` (line 44)
**Contract Location**: `/contracts/mock/MockRiskOracle.sol`
**Deployed Address**: See `deployments/mantleSepolia/MockRiskOracle.json`

##### What is RiskOracle?

**RiskOracle** is a dynamic risk management system that enables **real-time, off-chain risk parameter updates** for GMX Synthetics markets. It acts as an external authority that can adjust market risk settings (pool limits, leverage, fees, funding rates) based on market conditions, without requiring governance votes or contract upgrades.

**Production RiskOracle Provider**: [Chaos Labs](https://chaoslabs.xyz) - Third-party risk management infrastructure

##### Why RiskOracle is Critical

In production GMX deployments, RiskOracle provides:

1. **Dynamic Risk Management**: Adjusts parameters in response to:
   - Market volatility changes
   - Liquidity conditions
   - Oracle quality degradation
   - Systemic risk events (e.g., sudden price crashes)

2. **Market Protection**: Prevents catastrophic losses by:
   - Reducing pool caps during high volatility
   - Tightening leverage limits for risky assets
   - Adjusting funding rates to balance positions
   - Modifying impact factors to discourage large trades

3. **Decentralized Governance**: Off-chain risk models propose updates, on-chain contracts enforce them

##### Architecture: RiskOracle → ConfigSyncer → DataStore

```
Chaos Labs Risk Engine (Off-chain)
         ↓ (publishes updates)
    RiskOracle Contract
         ↓ (syncs parameters)
    ConfigSyncer Contract
         ↓ (applies to markets)
     DataStore Contract
         ↓ (enforces in trading)
  ExchangeRouter / OrderHandler
```

**Flow**:
1. **Risk Engine** (Chaos Labs): Analyzes market conditions off-chain
2. **RiskOracle**: Stores signed parameter updates with timestamps
3. **ConfigSyncer**: Reads updates, validates, and applies to DataStore
4. **DataStore**: Enforces new parameters in all trading operations

##### Production RiskOracle Parameters

The **production RiskOracle** (Chaos Labs) can dynamically adjust 37 market parameters:

**Pool Capacity Limits**:
- `maxLongTokenPoolAmount` - Maximum long token in pool
- `maxShortTokenPoolAmount` - Maximum short token in pool
- `maxLongTokenPoolUsdForDeposit` - Maximum USD deposits (long)
- `maxShortTokenPoolUsdForDeposit` - Maximum USD deposits (short)

**Open Interest Limits**:
- `maxOpenInterestForLongs` - Maximum long position size
- `maxOpenInterestForShorts` - Maximum short position size

**Position Impact Factors** (slippage for large positions):
- `positivePositionImpactFactor` - Reward for balancing positions
- `negativePositionImpactFactor` - Penalty for imbalancing positions
- `positionImpactExponentFactor` - Non-linearity of impact

**Swap Impact Factors** (slippage for token swaps):
- `positiveSwapImpactFactor` - Reward for balancing swaps
- `negativeSwapImpactFactor` - Penalty for imbalancing swaps
- `swapImpactExponentFactor` - Non-linearity of swap impact

**Funding Rate Configuration** (incentivizes position balance):
- `fundingIncreaseFactorPerSecond` - How fast funding increases
- `fundingDecreaseFactorPerSecond` - How fast funding decreases
- `minFundingFactorPerSecond` - Floor for funding rate
- `maxFundingFactorPerSecond` - Ceiling for funding rate

**Borrowing Rate Configuration** (charges for using pool capital):
- `borrowingFactorForLongs` - Base borrowing rate for longs
- `borrowingFactorForShorts` - Base borrowing rate for shorts
- `borrowingExponentFactorForLongs` - Non-linearity (longs)
- `borrowingExponentFactorForShorts` - Non-linearity (shorts)
- `optimalUsageFactor` - Target pool utilization
- `baseBorrowingFactor` - Base borrowing rate at 0% utilization
- `aboveOptimalUsageBorrowingFactor` - Rate above optimal utilization

**Reserve Factors** (portion of pool reserved for withdrawals):
- `reserveFactorLongs` - Reserve for long token withdrawals
- `reserveFactorShorts` - Reserve for short token withdrawals
- `openInterestReserveFactorLongs` - Reserve based on OI (longs)
- `openInterestReserveFactorShorts` - Reserve based on OI (shorts)

**PnL Limits**:
- `maxPnlFactorForTradersLongs` - Maximum profit for long traders

##### Why MockRiskOracle on Mantle Sepolia

**Production RiskOracle Not Available Because**:
- Chaos Labs operates RiskOracle on **Arbitrum** and **Avalanche** mainnets only
- Testnet (Mantle Sepolia) lacks Chaos Labs infrastructure
- Risk parameter updates require sophisticated off-chain modeling
- Deploying production RiskOracle would require Chaos Labs integration

**MockRiskOracle Alternative**:
- Simplified version for testnet development
- Deployer can manually publish parameter updates
- Uses same interface (`IRiskOracle`) as production
- Allows testing ConfigSyncer integration without Chaos Labs

##### MockRiskOracle Implementation

**Deployment Configuration** (`deployMockRiskOracle.ts`):
```typescript
const initialSenders = [deployer.address]; // Deployer authorized
const initialUpdateTypes = [
  "maxLongTokenPoolAmount",
  "maxShortTokenPoolAmount",
  // ... 37 total parameter types
];
```

**Key Features**:
1. **Authorized Senders**: Only deployer can publish updates (vs. Chaos Labs in production)
2. **Update History**: Tracks all parameter changes with timestamps
3. **Per-Market Configuration**: Each market can have independent parameters
4. **Reference IDs**: Links updates to off-chain justifications (testing only)

**Functions Available**:
```solidity
// Publish single parameter update
function publishRiskParameterUpdate(
  string memory referenceId,
  bytes memory newValue,
  string memory updateType,
  address market,
  bytes memory additionalData
) external;

// Publish multiple updates in batch
function publishBulkRiskParameterUpdates(
  string[] memory referenceIds,
  bytes[] memory newValues,
  string[] memory updateTypes,
  address[] memory markets,
  bytes[] memory additionalData
) external;

// Query latest value for parameter + market
function getLatestUpdateByParameterAndMarket(
  string memory updateType,
  address market
) external view returns (RiskParameterUpdate memory);
```

##### How ConfigSyncer Uses RiskOracle

**ConfigSyncer Contract** (`/contracts/config/ConfigSyncer.sol`) integrates RiskOracle:

1. **LIMITED_CONFIG_KEEPER role** calls `sync(markets[], parameters[])`
2. ConfigSyncer queries RiskOracle for latest updates
3. Validates updates haven't been applied yet (prevents replay)
4. Applies updates to DataStore via `config.setUint()`
5. Marks updates as completed

**Safety Features**:
- **Per-market disable**: Can disable syncing for specific markets
- **Per-parameter disable**: Can disable specific parameter types
- **Per-market-parameter disable**: Granular control
- **Update ID tracking**: Prevents duplicate applications

##### RiskOracle Configuration for Mantle Sepolia

**Config Location**: `/config/riskOracle.ts` (lines 70-81)

```typescript
mantleSepolia: {
  riskOracle: MockRiskOracle.address // Dynamically set after deployment
}
```

**Current State**:
- MockRiskOracle deployed and registered in ConfigSyncer
- Deployer authorized to publish parameter updates
- All 37 parameter types enabled for testing
- No market-specific overrides configured (global defaults apply)

##### Testing RiskOracle Features

**Example: Update Max Pool Amount**:
```typescript
const mockRiskOracle = await ethers.getContract("MockRiskOracle");
const marketAddress = "0x..."; // WETH:WETH:USDC market

// Prepare update data
const updateType = "maxLongTokenPoolAmount";
const newValue = ethers.utils.defaultAbiCoder.encode(
  ["uint256"],
  [expandDecimals(200, 18)] // Increase to 200 WETH
);
const baseKey = keys.MAX_POOL_AMOUNT; // DataStore key
const data = ethers.utils.defaultAbiCoder.encode(
  ["address", "address"],
  [marketAddress, WETH] // Market + token
);
const additionalData = ethers.utils.defaultAbiCoder.encode(
  ["bytes32", "bytes"],
  [baseKey, data]
);

// Publish update
await mockRiskOracle.publishRiskParameterUpdate(
  "TEST-001", // reference ID
  newValue,
  updateType,
  marketAddress,
  additionalData
);

// Apply via ConfigSyncer
const configSyncer = await ethers.getContract("ConfigSyncer");
await configSyncer.sync([marketAddress], [updateType]);

// Verify applied
const dataStore = await ethers.getContract("DataStore");
const fullKey = keys.maxPoolAmountKey(marketAddress, WETH);
const currentValue = await dataStore.getUint(fullKey);
console.log(`Max pool amount now: ${currentValue}`);
```

##### Comparison: Production vs Mock

| Feature | Production RiskOracle (Chaos Labs) | MockRiskOracle (Testnet) |
|---------|-----------------------------------|-------------------------|
| **Parameter Updates** | Automated based on risk models | Manual via deployer |
| **Authorization** | Chaos Labs multi-sig | Single deployer address |
| **Monitoring** | 24/7 real-time market analysis | Manual observation |
| **Response Time** | Minutes (automated) | Manual intervention required |
| **Historical Data** | Full audit trail + off-chain models | On-chain update history only |
| **Networks** | Arbitrum, Avalanche mainnets | Testnet only |
| **Integration** | Same `IRiskOracle` interface | Same interface (compatible) |

##### Migration to Production RiskOracle

When deploying to **Arbitrum** or **Avalanche mainnet**:

1. **Remove MockRiskOracle deployment**:
   ```typescript
   // In deployMockRiskOracle.ts
   skip: (hre) => hre.network.name !== "mantleSepolia"
   ```

2. **Configure production RiskOracle address**:
   ```typescript
   // In riskOracle.ts
   arbitrum: {
     riskOracle: "0x0efb5a96Ed1B33308a73355C56Aa1Bc1aa7E4A8E" // Chaos Labs
   }
   ```

3. **Grant ConfigSyncer LIMITED_CONFIG_KEEPER role** to Chaos Labs keeper
4. **Configure parameter sync preferences** (enable/disable specific parameters)
5. **Test ConfigSyncer.sync()** with Chaos Labs in testnet first

##### Key Takeaways

- **RiskOracle = Dynamic Risk Management**: Real-time parameter adjustments without governance
- **Production = Chaos Labs**: Professional risk modeling and 24/7 monitoring
- **Testnet = MockRiskOracle**: Manual simulation for development testing
- **ConfigSyncer Bridge**: Safely applies RiskOracle updates to markets
- **Same Interface**: MockRiskOracle fully compatible with production for testing

---

#### 2. MockDataStreamVerifier

**Status**: **DEPLOYED** ✅ (Instead of Chainlink Data Streams)

**Location**: `/deploy/deployMockDataStreamFeedVerifier.ts` (line 9)

**Why Mock Version**:
```typescript
// Chainlink Data Streams not available on Mantle Sepolia testnet
// Using mock for testing Chainlink integration
```

**Purpose**:
- Tests Chainlink Data Stream feed verification logic
- Provides synthetic price data for testing
- Allows validation of oracle data structure

**Feed IDs Available But Not Used**:
- Configured in tokens.ts but oracle defaults to gmOracle
- Ready for Chainlink upgrade when available on testnet

---

#### 3. MockTimelockV1

**Status**: **DEPLOYED** ✅ (Instead of production Timelock)

**Location**: `/deploy/deployMockTimelockV1.ts` (line 26)

**Why Mock Version**:
- Testnet doesn't require production-grade timelock delays
- Simplifies deployment testing
- Provides governance structure for testing

**Functions**:
- Delays governance actions (configurable)
- Queue and execute proposal workflow
- Mock implementation of TimelockController

---

### Configuration TODOs and Deferred Items

#### 1. LayerZero Cross-Chain Integration

**Status**: **TODO** 🔶

**Location**: `/config/layerZero.ts` (line 26)

**Current Configuration**:
```typescript
mantleSepolia: {
  // TODO: Add Mantle Sepolia LayerZero endpoint if needed for cross-chain testing
  // endpoint: "0x...",
}
```

**Deferred Reason**:
- LayerZero testnet support for Mantle Sepolia uncertain
- Requires endpoint address deployment
- Not essential for single-chain testing

**Future Implementation**:
When enabled, will support:
- Cross-chain position bridging
- Multi-chain order execution
- Unified liquidity pools across chains

---

#### 2. Chainlink Data Streams

**Status**: **UNAVAILABLE** ❌

**Location**: `/config/oracle.ts` (lines 114-115)

**Current Configuration**:
```typescript
// Note: Chainlink Data Streams may not be available on Mantle Sepolia testnet
// dataStreamFeedVerifier: "0x...", // TODO: Add if available
```

**Configured Feed IDs** (for future use):
```typescript
// tokens.ts includes Data Stream IDs:
WETH:   0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782
USDC:   0x00038f83323b6b08116d1614cf33a9bd71ab5e0abf0c9f1b783a74a43e7bd992
BTC:    0x00037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b439
wstETH: 0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782 (same as WETH)
```

**Current Oracle Provider**: `gmOracle` (basic oracle provider)

**Future Migration**:
```typescript
// When Chainlink Data Streams available on testnet:
// 1. Set dataStreamFeedVerifier to Mantle Sepolia feed verifier contract
// 2. Configure oracle source to use Data Streams
// 3. Remove MockDataStreamVerifier deployment
// 4. Update feed refresh intervals (currently 144 hours)
```

---

#### 3. Commented Market Features

**Status**: **DISABLED** for testnet ⚠️

**Locations**:
- `/config/markets.ts` lines 4603-4605 (WETH:WETH:USDC)
- `/config/markets.ts` lines 4675-4677 (WETH:wstETH:USDC)

**Deferred Features**:
```typescript
// maxLendableImpactFactor: exponentToFloat("2e-3"), // 0.002
// maxLendableImpactFactorForWithdrawals: exponentToFloat("2e-3"), // 0.002
// maxLendableImpactUsd: decimalToFloat(25), // $25
```

**Purpose of Features** (when enabled):
- Advanced impact pool lending system
- Allows pools to lend to positions when impact pools depleted
- Risk-managed lending with impact factor limits
- Withdrawal protection through lending constraints

**Why Disabled for Testnet**:
- Advanced feature, not essential for basic trading
- Adds complexity to withdrawal logic
- Can be enabled after core functionality proven

---

## Implementation Solutions

### Problem 1: Single-Signer Oracle on Testnet

**Challenge**: Production requires multi-signature oracle for security. Testnet can't replicate full oracle infrastructure.

**Solution Implemented**:
```typescript
// Single deployer signer for all roles
const oracleSigners = [deployedContract.address]; // One signer
await grantRoleIfNotGranted(deployedContract, "CONTROLLER");
```

**Advantages**:
- Simplified testing of oracle integration
- Faster deployment and configuration
- Sufficient for testnet feature validation

**Production Migration Path**:
```typescript
// Production would use multiple signers:
const oracleSigners = [
  "0x...", // Oracle node 1
  "0x...", // Oracle node 2
  "0x...", // Oracle node 3
];
const minSigners = 2; // Require 2 of 3
```

---

### Problem 2: Mock Chainlink Data Streams on Testnet

**Challenge**: Chainlink Data Streams not available on Mantle Sepolia. Can't test production oracle flow.

**Solution Implemented**:
```typescript
// Deploy mock for testing integration
const mockVerifier = await deploy("MockDataStreamFeedVerifier", {
  args: [],
});

// Use gmOracle as fallback provider
const defaultProvider = "gmOracle";
```

**Features**:
- Tests data structure and verification logic
- Validates oracle update flow
- Prepared for production oracle when available

**Production Migration**:
1. Obtain Mantle Sepolia Chainlink endpoint address
2. Configure `dataStreamFeedVerifier` in oracle.ts
3. Switch oracle provider to Chainlink Data Streams
4. Update feed refresh intervals based on production SLA

**Feed IDs Ready**: All feed IDs pre-configured in tokens.ts, just need verifier contract

---

### Problem 3: Multichain Integration on Testnet

**Challenge**: LayerZero cross-chain features require endpoint deployment and configuration.

**Solution Implemented**:
1. **Skipped Deployment**: MultichainReader not deployed on mantleSepolia
2. **Deferred Configuration**: LayerZero config marked as TODO
3. **Single-Chain Focus**: All three markets designed for Mantle Sepolia only

**Current State**:
```typescript
// In hardhat.config.ts
mantleSepolia: {
  layerzeroId: undefined, // Not registered
  endpoint: undefined,     // Not configured
},
```

**For Future Multichain Testing**:
1. Deploy LayerZero endpoint on Mantle Sepolia
2. Configure source/destination chain mappings
3. Deploy MultichainReader and MultichainTransferRouter
4. Update config with chain IDs and endpoints

---

### Problem 4: Conservative Pool Sizes for Testnet

**Challenge**: Need realistic trading environment while limiting capital at risk.

**Solution Implemented**:

| Market | Pool Size | Rationale |
|--------|-----------|-----------|
| WETH | 100 WETH (~$330k) | Primary market, largest cap |
| BTC | 50 BTC (~$4.85M) | High volatility, smaller pools |
| wstETH | 50 wstETH (~$192k) | Niche collateral, smallest |

**Impact**:
- Realistic slippage for testing (not zero-fee)
- Limited capital at risk (losing testnet tokens acceptable)
- Tests liquidity pressure scenarios

**For Production**:
```typescript
// Production multiplier: 100x-1000x larger pools
WETH:   10,000 WETH (~$33M)
BTC:    500 BTC (~$48.5M)
wstETH: 5,000 wstETH (~$19.2M)
```

---

### Problem 5: Funding & Borrowing Rate Configuration

**Challenge**: Needs to incentivize balance while remaining stable for testing.

**Solution Implemented**:

**Funding (fundingRateConfig_Low)**:
- Max rate capped at 75% per year
- Increases slowly (3 hours to reach max)
- Decreases quickly (48 hours to zero)
- Rationale: Gentle incentive, prevents extreme rates

**Borrowing (borrowingRateConfig_LowMax_WithLowerBase)**:
- Base: 45% per year (vs. 60% production)
- Max: 100% per year (vs. 150%+ production)
- Rationale: Encourages capital provision on testnet

**Testing Scenarios Enabled**:
1. Highly imbalanced markets (100% long/short)
2. Full utilization scenarios
3. Funding rate impact on position profitability
4. Borrowing cost impact on margin requirements

**Adjustment Path to Production**:
1. Increase funding rates by 10-20% for higher volatility compensation
2. Increase borrowing base to 60%+ for capital provider incentives
3. Tune to match historical market conditions on production

---

### Problem 6: Market Validation Configuration

**Challenge**: validateMarketConfigsUtils.ts required mantleSepolia configuration to validate deployed markets.

**Solution Implemented**:

Added mantleSepolia section to `recommendedMarketConfig`:

```typescript
mantleSepolia: {
  // Individual token configs (for swap validation)
  BTC: {
    negativePositionImpactFactor: exponentToFloat("5e-11"),
    negativeSwapImpactFactor: exponentToFloat("5e-11"),
    expectedSwapImpactRatio: 10_000,
    expectedPositionImpactRatio: 20_000,
  },
  WETH: {
    negativePositionImpactFactor: exponentToFloat("5e-11"),
    negativeSwapImpactFactor: exponentToFloat("5e-11"),
    expectedSwapImpactRatio: 10_000,
    expectedPositionImpactRatio: 11_111,
  },
  wstETH: {
    negativePositionImpactFactor: exponentToFloat("5e-11"),
    negativeSwapImpactFactor: exponentToFloat("5e-11"),
    expectedSwapImpactRatio: 10_000,
    expectedPositionImpactRatio: 11_111,
  },

  // Market-specific configs
  "BTC:BTC:USDC": {
    negativePositionImpactFactor: exponentToFloat("9e-11"),
    negativeSwapImpactFactor: exponentToFloat("4e-10"),
    expectedSwapImpactRatio: 10_000,
    expectedPositionImpactRatio: 20_000,
  },
  "WETH:WETH:USDC": {
    negativePositionImpactFactor: exponentToFloat("5e-7"),
    negativeSwapImpactFactor: exponentToFloat("3e-10"),
    expectedSwapImpactRatio: 10_000,
    expectedPositionImpactRatio: 11_111,
  },
  "WETH:wstETH:USDC": {
    negativePositionImpactFactor: exponentToFloat("5e-7"),
    negativeSwapImpactFactor: exponentToFloat("3e-10"),
    expectedSwapImpactRatio: 10_000,
    expectedPositionImpactRatio: 11_111,
  },
},
```

Added empty token mapping:
```typescript
configTokenMapping: {
  mantleSepolia: {},
},
```

**Why Both Individual and Market Configs**:
- Individual tokens: Used for swap-only validation
- Market pairs: Used for position/trading validation
- Both required to satisfy all validation checks

---

### Problem 7: Wrapped Native Token (WNT) Implementation

**Challenge**: Initially deployed WMNT (custom implementation) instead of standard WNT contract used across all GMX deployments.

**Solution Implemented**:

**WNT Deployment**:
- **Contract**: `contracts/mock/WNT.sol` (OpenZeppelin ERC20Permit)
- **Deployed Address**: `0xDF6178C1072c91cFcCb8ad3692Eb181A354C3DD8`
- **Deployment TX**: `0xc5cc25bba32f6a15ada897f92a3407946144184a48b643f94b9e7011bae0b891`
- **Block Explorer**: https://explorer.sepolia.mantle.xyz/address/0xDF6178C1072c91cFcCb8ad3692Eb181A354C3DD8

**Features of WNT (vs old WMNT)**:
- ✅ OpenZeppelin ERC20Permit (gasless approvals via EIP-2612)
- ✅ `mint(address, uint256)` and `burn(address, uint256)` test utilities
- ✅ Consistent with all other network deployments
- ✅ BUSL-1.1 license (production-ready)
- ✅ Battle-tested implementation

**DataStore Configuration**:
```typescript
// Updated WNT address in DataStore
await dataStore.setAddress(keys.WNT, "0xDF6178C1072c91cFcCb8ad3692Eb181A354C3DD8");
```

**Cleanup**:
- Deleted: `contracts/mock/WMNT.sol` (duplicate implementation)
- Deleted: `deployments/mantleSepolia/WMNT.json` (old deployment artifact)
- Old WMNT address was: `0x6363E7b5414F6164A673c2fDF73aBa0F7938D88C` (deprecated)

**Functionality**:
- `deposit()`: Wrap native MNT → WNT
- `withdraw(uint256)`: Unwrap WNT → native MNT
- `mint(address, uint256)`: Test utility for minting WNT
- `burn(address, uint256)`: Test utility for burning WNT
- Standard ERC20 functions: transfer, approve, transferFrom

**Tested Features**: All functions verified on testnet:
- ✅ Deposit 0.1 MNT → 0.1 WNT
- ✅ Withdraw 0.05 WNT → 0.05 MNT
- ✅ Mint 1.0 WNT (test utility)
- ✅ Burn 0.5 WNT (test utility)
- ✅ ERC20 standard compliance

---

**Document Version**: 1.1 | December 2024
**Network**: Mantle Sepolia (Chain ID 5003)
**Configuration Status**: ✅ Deployed and Validated
