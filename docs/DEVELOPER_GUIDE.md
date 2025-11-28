# GMX Synthetics Developer Guide

A concise developer-friendly summary of GMX Synthetics - a decentralized perpetual and synthetic asset trading protocol.

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Core Mechanisms](#core-mechanisms)
4. [Key Contracts Reference](#key-contracts-reference)
5. [Oracle & Keeper Infrastructure](#oracle--keeper-infrastructure)
6. [Fees & Pricing](#fees--pricing)
7. [GLV (Liquidity Vaults)](#glv-gmx-liquidity-vaults)
8. [Deployment Requirements](#deployment-requirements)
9. [Integration Guide](#integration-guide)
10. [Security Considerations](#security-considerations)

---

## System Overview

GMX Synthetics is a decentralized AMM-style perpetual/synthetic exchange that supports:

- **Spot Trading** - Swaps between collateral tokens
- **Perpetual Trading** - Long/short leveraged positions
- **Liquidity Provision** - Deposit collateral to earn fees
- **Market/Limit/Stop-Loss/Take-Profit Orders**

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Market** | Trading pair defined by long token, short token, and index token |
| **MarketToken** | LP token representing share of a market's liquidity pool |
| **Position** | A leveraged long or short trade on an index token |
| **Keeper** | Off-chain bot that executes pending user requests |

---

## Architecture

### Contract Categories

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Interface                          │
├─────────────────────────────────────────────────────────────────┤
│  Router          │ Token approval and transfers                 │
│  ExchangeRouter  │ Create deposits, withdrawals, orders         │
│  GlvRouter       │ GLV-specific operations                      │
│  SubaccountRouter│ Subaccount management                        │
├─────────────────────────────────────────────────────────────────┤
│                        Exchange/Handlers                        │
├─────────────────────────────────────────────────────────────────┤
│  DepositHandler     │ Execute deposit requests                  │
│  WithdrawalHandler  │ Execute withdrawal requests               │
│  OrderHandler       │ Execute trade orders                      │
│  LiquidationHandler │ Handle position liquidations              │
│  AdlHandler         │ Auto-deleveraging                         │
├─────────────────────────────────────────────────────────────────┤
│                         Core Logic                              │
├─────────────────────────────────────────────────────────────────┤
│  Market/MarketUtils │ Market operations and calculations        │
│  Position/PositionUtils │ Position management                   │
│  Order/OrderUtils   │ Order processing                          │
│  Pricing/*Utils     │ Price impact calculations                 │
├─────────────────────────────────────────────────────────────────┤
│                         Data Layer                              │
├─────────────────────────────────────────────────────────────────┤
│  DataStore          │ Central key-value storage                 │
│  *StoreUtils        │ Struct serialization/storage              │
│  RoleStore          │ Access control                            │
├─────────────────────────────────────────────────────────────────┤
│                         Bank/Vaults                             │
├─────────────────────────────────────────────────────────────────┤
│  MarketToken        │ Holds market liquidity                    │
│  OrderVault         │ Holds pending order collateral            │
│  DepositVault       │ Holds pending deposit tokens              │
│  WithdrawalVault    │ Holds pending withdrawal tokens           │
└─────────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Separation of Logic and Data** - Stateless logic contracts, data in DataStore
2. **Upgradeability** - Contracts can be upgraded without migrating data
3. **Risk Isolation** - Separate markets isolate LP exposure
4. **On-chain Enumeration** - Lists stored on-chain for reliable querying

---

## Core Mechanisms

### Markets & Liquidity Pools

Markets are created via `MarketFactory.createMarket()`:

```solidity
// Market configuration
struct Props {
    address marketToken;     // LP token address
    address indexToken;      // Price reference token
    address longToken;       // Collateral for long positions
    address shortToken;      // Collateral for short positions
}
```

**MarketToken Price** = `(Pool Value) / (Total Supply)`

Pool Value includes:
- Worth of deposited tokens
- Pending PnL of all open positions
- Pending borrow fees

### Deposits & Withdrawals

**Two-step execution pattern:**

1. User creates request → `ExchangeRouter.createDeposit()`
2. Keeper executes with oracle prices → `DepositHandler.executeDeposit()`

```
MarketTokens minted = (Deposit Value) / (Pool Value) × Total Supply
```

### Trading (Swaps & Perps)

**Order Types:**
| Type | Description |
|------|-------------|
| MarketSwap | Immediate swap at current price |
| LimitSwap | Execute when price reaches target |
| MarketIncrease | Open/increase position immediately |
| LimitIncrease | Open position when price reaches target |
| MarketDecrease | Close/reduce position immediately |
| LimitDecrease | Close when price reaches profit target |
| StopLossDecrease | Close when price reaches loss limit |

**Execution Flow:**
```
User creates order → OrderVault holds collateral → 
Keeper executes with oracle price → Position updated/settled
```

---

## Key Contracts Reference

### Entry Points

| Contract | Purpose | Key Functions |
|----------|---------|---------------|
| `Router` | Token approvals | `pluginTransfer()` |
| `ExchangeRouter` | User operations | `createDeposit()`, `createWithdrawal()`, `createOrder()` |
| `GlvRouter` | GLV operations | `createGlvDeposit()`, `createGlvWithdrawal()` |

### Handlers (Keeper-executed)

| Contract | Purpose |
|----------|---------|
| `DepositHandler` | Execute deposits, mint MarketTokens |
| `WithdrawalHandler` | Execute withdrawals, burn MarketTokens |
| `OrderHandler` | Execute all order types |
| `LiquidationHandler` | Liquidate underwater positions |
| `AdlHandler` | Auto-deleverage when PnL caps exceeded |

### Data Contracts

| Contract | Purpose |
|----------|---------|
| `DataStore` | Central key-value storage for all protocol data |
| `RoleStore` | Role-based access control |
| `OracleStore` | Oracle signer management |

### Reader Contracts

| Contract | Purpose |
|----------|---------|
| `Reader` | Read market data, positions, orders |
| `GlvReader` | Read GLV-specific data |
| `KeeperReader` | Keeper-specific queries |

---

## Oracle & Keeper Infrastructure

### Oracle System

Prices are signed off-chain and verified on-chain:

1. **Oracle Keepers** - Fetch and sign prices (min/max for spread)
2. **Archive Nodes** - Store signed price data
3. **Order Keepers** - Bundle prices with execution requests

**Price Format:**
- 30 decimals of precision
- Both min and max prices (bid-ask spread)
- Signed with timestamp for freshness

### Required Infrastructure

| Component | Role |
|-----------|------|
| **Oracle Keepers** | Fetch prices from exchanges, sign them |
| **Archive Nodes** | Store and serve signed price data |
| **Order Keepers** | Monitor requests, execute with prices |
| **Liquidation Keepers** | Monitor and liquidate positions |

### Oracle Providers

- `ChainlinkDataStreamProvider` - Chainlink Data Streams
- `ChainlinkPriceFeedProvider` - Chainlink Price Feeds
- `EdgeDataStreamProvider` - Edge oracle integration
- `GmOracleProvider` - GM token pricing

---

## Fees & Pricing

### Fee Types

| Fee | Purpose | Calculation |
|-----|---------|-------------|
| **Swap Fee** | Cost of swapping | `swapAmount × swapFeeFactor` |
| **Position Fee** | Open/close positions | `sizeDelta × positionFeeFactor` |
| **Funding Fee** | Balance long/short | Paid by larger side to smaller |
| **Borrowing Fee** | Prevent capacity abuse | Based on utilization |

### Funding Fees

```
Funding Rate = fundingFactor × (OI Imbalance)^exponent / Total OI
```

The overloaded side (more OI) pays the underloaded side.

### Borrowing Fees

**Curve Model:**
```
borrowingRate = borrowingFactor × (reservedUsd^exponent) / poolUsd
```

**Kink Model:**
```
if (usageFactor > optimalUsage):
    rate = baseRate + additionalRate × (usage - optimal) / (1 - optimal)
```

### Price Impact

Penalizes actions that worsen pool imbalance:

```
Impact = (initial_imbalance^exponent × factor) - (final_imbalance^exponent × factor)
```

- **Negative impact**: Trade worsens balance → cost to user
- **Positive impact**: Trade improves balance → rebate to user

---

## GLV (GMX Liquidity Vaults)

GLV wraps multiple markets with the same collateral tokens:

**Structure:**
- **GLV Token** - Single LP token representing the vault
- **Underlying Markets** - Multiple markets (e.g., ETH/USD, BTC/USD, SOL/USD)
- **Shared Collateral** - All markets use the same long/short tokens

**Benefits:**
- Automatic rebalancing across markets
- Capital efficiency improvement
- Reduced LP management overhead

**Key Contracts:**
- `GlvFactory` - Create new GLVs
- `GlvToken` - GLV LP token
- `GlvVault` - Holds GLV assets
- `GlvRouter` - User operations

---

## Deployment Requirements

### Environment Requirements

| Requirement | Details |
|-------------|---------|
| **Chain** | EVM-compatible (Arbitrum, Avalanche, etc.) |
| **Node** | Archive node for historical data |
| **Oracle** | Reliable price feed infrastructure |
| **Keepers** | 24/7 execution bots |

### Configuration Checklist

- [ ] Deploy core contracts (DataStore, RoleStore, Router, etc.)
- [ ] Configure oracle providers and signers
- [ ] Set up keeper infrastructure
- [ ] Configure market parameters:
  - Token addresses (long, short, index)
  - Fee factors
  - Price impact parameters
  - Reserve factors
  - Max open interest limits
- [ ] Set up role permissions
- [ ] Whitelist collateral tokens

### Key Parameters

```solidity
// Example market configuration
Keys.SWAP_FEE_FACTOR               // Swap fee percentage
Keys.POSITION_FEE_FACTOR           // Position fee percentage
Keys.FUNDING_FACTOR                // Funding rate factor
Keys.BORROWING_FACTOR              // Borrowing rate factor
Keys.MAX_POOL_AMOUNT               // Max deposits allowed
Keys.MAX_OPEN_INTEREST             // Max OI per side
Keys.RESERVE_FACTOR                // Collateral reserve ratio
Keys.MAX_PNL_FACTOR                // PnL cap ratio
```

---

## Integration Guide

### Creating a Deposit

```solidity
// 1. Approve tokens to Router
longToken.approve(router, amount);

// 2. Create deposit request
ExchangeRouter.createDeposit(
    CreateDepositParams({
        receiver: msg.sender,
        callbackContract: address(0),
        uiFeeReceiver: address(0),
        market: marketAddress,
        initialLongToken: longTokenAddress,
        initialShortToken: shortTokenAddress,
        longTokenSwapPath: new address[](0),
        shortTokenSwapPath: new address[](0),
        minMarketTokens: minExpectedTokens,
        shouldUnwrapNativeToken: false,
        executionFee: executionFee,
        callbackGasLimit: 0,
        dataList: new bytes[](0)
    })
);
// 3. Keeper executes, user receives MarketTokens
```

### Creating an Order

```solidity
ExchangeRouter.createOrder(
    CreateOrderParams({
        addresses: CreateOrderParamsAddresses({
            receiver: msg.sender,
            cancellationReceiver: msg.sender,
            callbackContract: address(0),
            uiFeeReceiver: address(0),
            market: marketAddress,
            initialCollateralToken: collateralToken,
            swapPath: new address[](0)
        }),
        numbers: CreateOrderParamsNumbers({
            sizeDeltaUsd: positionSize,
            initialCollateralDeltaAmount: collateralAmount,
            triggerPrice: 0,
            acceptablePrice: acceptablePrice,
            executionFee: executionFee,
            callbackGasLimit: 0,
            minOutputAmount: 0,
            validFromTime: 0
        }),
        orderType: Order.OrderType.MarketIncrease,
        decreasePositionSwapType: Order.DecreasePositionSwapType.NoSwap,
        isLong: true,
        shouldUnwrapNativeToken: false,
        autoCancel: false,
        referralCode: bytes32(0),
        dataList: new bytes[](0)
    })
);
```

### Reading Data

```solidity
// Get market info
Reader.getMarket(dataStore, marketAddress);

// Get positions
Reader.getAccountPositions(dataStore, account, start, end);

// Get orders
Reader.getAccountOrders(dataStore, account, start, end);

// Get market token price
MarketUtils.getMarketTokenPrice(
    dataStore,
    market,
    longTokenPrice,
    shortTokenPrice,
    indexTokenPrice,
    pnlFactorType,
    maximize
);
```

### Callback Integration

```solidity
contract MyCallback is IDepositCallbackReceiver {
    function afterDepositExecution(
        bytes32 key,
        EventUtils.EventLogData memory depositData,
        EventUtils.EventLogData memory eventData
    ) external {
        // Verify caller has CONTROLLER role
        require(roleStore.hasRole(msg.sender, Role.CONTROLLER));
        // Handle deposit execution
    }

    function afterDepositCancellation(
        bytes32 key,
        EventUtils.EventLogData memory depositData,
        EventUtils.EventLogData memory eventData
    ) external {
        // Handle cancellation
    }
}
```

---

## Security Considerations

### Known Risks

| Risk | Mitigation |
|------|------------|
| Oracle manipulation | Multi-signer requirement, price bounds |
| Keeper centralization | Multiple keeper operators, incentives |
| Front-running | Two-step execution, price windows |
| LP losses | Reserve factors, max OI limits |
| Smart contract bugs | Audits, formal verification |

### Token Restrictions

Incompatible tokens (should not be whitelisted):
- Rebasing tokens
- Fee-on-transfer tokens
- ERC-777 tokens (callbacks)
- Tokens with balance manipulation

### Role Security

| Role | Access Level | Trust Requirement |
|------|--------------|-------------------|
| RoleAdmin | Full system control | Timelock only |
| Controller | State modifications | Verified contracts only |
| Order Keeper | Execute orders | Trusted operators |
| Oracle Signer | Price signing | Trusted entities |

### Audit Reports

- [Dedaub Audit (Nov 2022)](https://dedaub.com/audits/gmx/gmx-synthetics-nov-20-2022/)
- Additional audits: ABDK, Certora, Guardian, Sherlock (see `/audits`)

### Best Practices

1. **Always validate callback callers** - Check CONTROLLER role
2. **Handle cancellations** - Orders/deposits can be cancelled
3. **Account for price impact** - Both positive and negative
4. **Use latest contracts** - Reader, ExchangeRouter may change
5. **Monitor configuration changes** - Fee changes affect pricing

---

## Quick Commands

```bash
# Compile contracts
npx hardhat compile

# Run tests
npx hardhat test

# Check contract sizes
npx hardhat measure-contract-sizes

# Print code metrics
npx ts-node metrics.ts

# Generate deployment docs
npx hardhat generate-deployment-docs
```

---

## Additional Resources

- [Main README](../README.md) - Detailed protocol documentation
- [Changelog v2.2](../changelogs/v2.2.md) - Breaking changes
- [Deployment Docs](./README.md) - Network deployments
- [GMX Docs](https://docs.gmx.io/docs/trading/v2/) - Official documentation

---

*This guide provides a high-level overview. For detailed implementation, refer to the contract source code and comprehensive README.*
