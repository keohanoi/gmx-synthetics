# GMX Synthetics - Liquidity Flows

## Table of Contents
1. [Deposit Flow](#deposit-flow)
2. [Withdrawal Flow](#withdrawal-flow)
3. [Market Token Pricing](#market-token-pricing)
4. [Liquidity Management](#liquidity-management)

---

## Deposit Flow

### Complete Deposit Process

```mermaid
sequenceDiagram
    participant User
    participant ExchangeRouter
    participant DepositVault
    participant DataStore
    participant Keeper
    participant DepositHandler
    participant Oracle
    participant ExecuteDepositUtils
    participant MarketToken

    User->>ExchangeRouter: createDeposit(params)
    ExchangeRouter->>ExchangeRouter: validateNonZeroAmount()
    ExchangeRouter->>DepositVault: transferFrom(user, longToken)
    ExchangeRouter->>DepositVault: transferFrom(user, shortToken)
    DepositVault->>DepositVault: recordTransferIn()
    ExchangeRouter->>DataStore: storeDeposit(depositKey, deposit)
    ExchangeRouter->>EventEmitter: emit DepositCreated
    ExchangeRouter-->>User: return depositKey

    Keeper->>DepositHandler: executeDeposit(depositKey, oracleParams)
    DepositHandler->>Oracle: setPrices(oracleParams)
    Oracle-->>DepositHandler: validated prices
    DepositHandler->>DataStore: getDeposit(key)
    DepositHandler->>ExecuteDepositUtils: executeDeposit(deposit, prices)

    ExecuteDepositUtils->>ExecuteDepositUtils: getExecutionPrice()
    ExecuteDepositUtils->>ExecuteDepositUtils: getDepositAmountOut()
    ExecuteDepositUtils->>ExecuteDepositUtils: calculatePriceImpact()
    ExecuteDepositUtils->>ExecuteDepositUtils: applySwapImpactWithCap()

    ExecuteDepositUtils->>MarketToken: mint(user, marketTokenAmount)
    MarketToken-->>User: GM tokens

    ExecuteDepositUtils->>DataStore: updatePoolAmounts()
    ExecuteDepositUtils->>EventEmitter: emit DepositExecuted
    DepositHandler->>DataStore: removeDeposit(key)
    DepositHandler->>User: callback (if set)
```

**Code References:**
- `contracts/exchange/ExchangeRouter.sol:271` - `createDeposit()`
- `contracts/exchange/DepositHandler.sol:95` - `executeDeposit()`
- `contracts/deposit/ExecuteDepositUtils.sol:90` - `executeDeposit()`
- `contracts/deposit/DepositStoreUtils.sol` - Deposit storage

### Deposit Data Structure

```solidity
// contracts/deposit/Deposit.sol:24

struct Props {
    Addresses addresses;
    Numbers numbers;
    Flags flags;
}

struct Addresses {
    address account;               // User depositing
    address receiver;             // Receiver of GM tokens
    address callbackContract;     // Optional callback
    address uiFeeReceiver;        // UI fee receiver
    address market;               // Target market
    address initialLongToken;     // Long token deposited
    address initialShortToken;    // Short token deposited
    address[] longTokenSwapPath;  // Swap path for long token
    address[] shortTokenSwapPath; // Swap path for short token
}

struct Numbers {
    uint256 initialLongTokenAmount;  // Long tokens deposited
    uint256 initialShortTokenAmount; // Short tokens deposited
    uint256 minMarketTokens;         // Min GM tokens (slippage)
    uint256 updatedAtBlock;          // Block number
    uint256 executionFee;            // Fee for keeper
    uint256 callbackGasLimit;        // Gas for callback
}
```

**Code Reference:**
- `contracts/deposit/Deposit.sol:24`

### Deposit Amount Calculation

```mermaid
flowchart TD
    A[Start Deposit] --> B[Get long & short token amounts]
    B --> C[Convert to USD value at oracle prices]
    C --> D[totalDepositValue = longValue + shortValue]
    D --> E[Get current pool value]
    E --> F[Get total GM token supply]
    F --> G{Is first deposit?}
    G -->|Yes| H[gmTokens = depositValue]
    G -->|No| I[gmTokens = depositValue * supply / poolValue]
    I --> J[Calculate price impact]
    H --> J
    J --> K[Apply price impact adjustment]
    K --> L{Impact negative?}
    L -->|Yes| M[Reduce GM tokens minted]
    L -->|No| N[Increase GM tokens minted capped]
    M --> O[Check minMarketTokens]
    N --> O
    O --> P{gmTokens >= minMarketTokens?}
    P -->|No| Q[Revert: insufficient output]
    P -->|Yes| R[Mint GM tokens to user]
    R --> S[Update pool balances]
    S --> T[Emit DepositExecuted]

    style L fill:#f0e1ff
    style Q fill:#ffe1e1
    style R fill:#e1ffe1
```

**Code References:**
- `contracts/deposit/ExecuteDepositUtils.sol:260` - `_executeDeposit()`
- `contracts/market/MarketUtils.sol:683` - `getDepositAmountOut()`

**Deposit Formula:**

```solidity
// contracts/market/MarketUtils.sol:683

function getDepositAmountOut(
    DataStore dataStore,
    Market.Props memory market,
    MarketPrices prices,
    uint256 longTokenAmount,
    uint256 shortTokenAmount,
    bool includeVirtualInventoryImpact
) internal view returns (uint256) {
    // Get market value (pool value in USD)
    uint256 poolValue = getPoolValue(dataStore, market, prices);

    // Get GM token supply
    uint256 supply = getMarketTokenSupply(MarketToken(market.marketToken));

    // Calculate deposit value
    uint256 longTokenUsd = longTokenAmount * prices.longTokenPrice.max;
    uint256 shortTokenUsd = shortTokenAmount * prices.shortTokenPrice.max;
    uint256 depositValue = longTokenUsd + shortTokenUsd;

    // Calculate GM tokens to mint
    uint256 marketTokensUsd;
    if (supply == 0) {
        marketTokensUsd = depositValue;
    } else {
        marketTokensUsd = depositValue * supply / poolValue;
    }

    // Apply price impact
    int256 priceImpactUsd = getPriceImpact(/* ... */);
    marketTokensUsd = applyImpact(marketTokensUsd, priceImpactUsd);

    return marketTokensUsd / GM_TOKEN_PRICE; // GM price = $1
}
```

### Deposit with Swaps

Users can deposit tokens that aren't direct market tokens:

```mermaid
flowchart LR
    A[User has USDT] --> B[Swap USDT→USDC in Market1]
    B --> C[Deposit USDC to ETH/USD market]
    C --> D[Receive GM tokens]

    style A fill:#e1f5ff
    style C fill:#fff4e1
    style D fill:#e1ffe1
```

**Example:**
```solidity
createDeposit({
    market: ethUsdMarket,
    initialLongToken: WETH,  // Direct deposit
    initialShortToken: USDT, // Will swap USDT→USDC
    shortTokenSwapPath: [usdtUsdcMarket],
    // ...
});
```

**Code References:**
- `contracts/deposit/ExecuteDepositUtils.sol:160` - `executeDeposit()` with swaps
- `contracts/swap/SwapUtils.sol` - Swap execution

---

## Withdrawal Flow

### Complete Withdrawal Process

```mermaid
sequenceDiagram
    participant User
    participant ExchangeRouter
    participant DataStore
    participant Keeper
    participant WithdrawalHandler
    participant Oracle
    participant ExecuteWithdrawalUtils
    participant MarketToken
    participant WithdrawalVault

    User->>ExchangeRouter: createWithdrawal(params)
    ExchangeRouter->>ExchangeRouter: validateNonZeroAmount()
    ExchangeRouter->>MarketToken: transferFrom(user, gmTokens)
    ExchangeRouter->>MarketToken: burn(gmTokens)
    ExchangeRouter->>DataStore: storeWithdrawal(key, withdrawal)
    ExchangeRouter->>EventEmitter: emit WithdrawalCreated
    ExchangeRouter-->>User: return withdrawalKey

    Keeper->>WithdrawalHandler: executeWithdrawal(key, oracleParams)
    WithdrawalHandler->>Oracle: setPrices(oracleParams)
    Oracle-->>WithdrawalHandler: validated prices
    WithdrawalHandler->>DataStore: getWithdrawal(key)
    WithdrawalHandler->>ExecuteWithdrawalUtils: executeWithdrawal()

    ExecuteWithdrawalUtils->>ExecuteWithdrawalUtils: getWithdrawalAmountOut()
    ExecuteWithdrawalUtils->>ExecuteWithdrawalUtils: calculatePriceImpact()
    ExecuteWithdrawalUtils->>ExecuteWithdrawalUtils: calculateOutputAmounts()

    ExecuteWithdrawalUtils->>DataStore: updatePoolAmounts()
    ExecuteWithdrawalUtils->>WithdrawalVault: transferOut(longToken, user)
    ExecuteWithdrawalUtils->>WithdrawalVault: transferOut(shortToken, user)
    WithdrawalVault-->>User: receive tokens

    ExecuteWithdrawalUtils->>EventEmitter: emit WithdrawalExecuted
    WithdrawalHandler->>DataStore: removeWithdrawal(key)
    WithdrawalHandler->>User: callback (if set)
```

**Code References:**
- `contracts/exchange/ExchangeRouter.sol:309` - `createWithdrawal()`
- `contracts/exchange/WithdrawalHandler.sol:94` - `executeWithdrawal()`
- `contracts/withdrawal/ExecuteWithdrawalUtils.sol:95` - `executeWithdrawal()`

### Withdrawal Data Structure

```solidity
// contracts/withdrawal/Withdrawal.sol:24

struct Props {
    Addresses addresses;
    Numbers numbers;
    Flags flags;
}

struct Addresses {
    address account;
    address receiver;
    address callbackContract;
    address uiFeeReceiver;
    address market;
    address[] longTokenSwapPath;
    address[] shortTokenSwapPath;
}

struct Numbers {
    uint256 marketTokenAmount;       // GM tokens to burn
    uint256 minLongTokenAmount;      // Min long tokens (slippage)
    uint256 minShortTokenAmount;     // Min short tokens (slippage)
    uint256 updatedAtBlock;
    uint256 executionFee;
    uint256 callbackGasLimit;
}
```

**Code Reference:**
- `contracts/withdrawal/Withdrawal.sol:24`

### Withdrawal Amount Calculation

```mermaid
flowchart TD
    A[Start Withdrawal] --> B[Get GM tokens to burn]
    B --> C[Get total GM token supply]
    C --> D[Get total pool value]
    D --> E[userShare = gmTokens / supply]
    E --> F[withdrawalValue = userShare * poolValue]
    F --> G[Calculate price impact]
    G --> H{Impact negative?}
    H -->|Yes| I[Reduce withdrawal value]
    H -->|No| J[Increase withdrawal value capped]
    I --> K[Calculate long & short token amounts]
    J --> K
    K --> L[Based on pool ratio or user choice]
    L --> M{Output >= min amounts?}
    M -->|No| N[Revert: insufficient output]
    M -->|Yes| O[Burn GM tokens]
    O --> P[Update pool balances]
    P --> Q[Transfer tokens to user]
    Q --> R[Emit WithdrawalExecuted]

    style H fill:#f0e1ff
    style N fill:#ffe1e1
    style Q fill:#e1ffe1
```

**Code References:**
- `contracts/withdrawal/ExecuteWithdrawalUtils.sol:195` - `_executeWithdrawal()`
- `contracts/market/MarketUtils.sol:835` - `getWithdrawalAmountOut()`

**Withdrawal Formula:**

```solidity
// contracts/market/MarketUtils.sol:835

function getWithdrawalAmountOut(
    DataStore dataStore,
    Market.Props memory market,
    MarketPrices prices,
    uint256 marketTokenAmount,
    address outputToken
) internal view returns (uint256) {
    // Get pool value and GM supply
    uint256 poolValue = getPoolValue(dataStore, market, prices);
    uint256 supply = getMarketTokenSupply(MarketToken(market.marketToken));

    // Calculate withdrawal value
    uint256 marketTokensUsd = marketTokenAmount * GM_TOKEN_PRICE;
    uint256 withdrawalValue = marketTokensUsd * poolValue / supply;

    // Apply price impact
    int256 priceImpactUsd = getPriceImpact(/* ... */);
    withdrawalValue = applyImpact(withdrawalValue, priceImpactUsd);

    // Convert to token amount
    uint256 outputPrice = getTokenPrice(outputToken, prices);
    uint256 outputAmount = withdrawalValue / outputPrice;

    return outputAmount;
}
```

### Withdrawal Output Options

Users can specify how to receive withdrawn liquidity:

**Option 1: Proportional Withdrawal**
```solidity
// Receive both long and short tokens proportionally
createWithdrawal({
    market: ethUsdMarket,
    marketTokenAmount: gmTokens,
    minLongTokenAmount: minWETH,
    minShortTokenAmount: minUSDC,
    // Both > 0: proportional withdrawal
});
```

**Option 2: Single Token Withdrawal**
```solidity
// Receive only long token
createWithdrawal({
    market: ethUsdMarket,
    marketTokenAmount: gmTokens,
    minLongTokenAmount: minWETH,
    minShortTokenAmount: 0,  // 0: receive only long
});
```

**Code References:**
- `contracts/withdrawal/ExecuteWithdrawalUtils.sol:282` - `_getOutputAmounts()`

---

## Market Token Pricing

### GM Token Value Calculation

```mermaid
flowchart TD
    A[Calculate GM Token Price] --> B[Get pool token balances]
    B --> C[longValue = longBalance * longPrice]
    C --> D[shortValue = shortBalance * shortPrice]
    D --> E[Get pending PnL for all positions]
    E --> F[Get claimable fees]
    F --> G[poolValue = longValue + shortValue - pendingPnL - fees]
    G --> H[Get GM token supply]
    H --> I[gmPrice = poolValue / supply]
    I --> J[Individual GM value = userGmTokens * gmPrice]

    style I fill:#fff4e1
```

**Code References:**
- `contracts/market/MarketUtils.sol:409` - `getPoolValue()`
- `contracts/market/MarketUtils.sol:568` - `getNetPnl()`
- `contracts/reader/ReaderPricingUtils.sol` - Read GM token info

**Pool Value Formula:**

```solidity
// contracts/market/MarketUtils.sol:409

function getPoolValue(
    DataStore dataStore,
    Market.Props memory market,
    MarketPrices prices
) internal view returns (uint256) {
    // Get token balances
    uint256 longTokenAmount = getPoolAmount(dataStore, market, market.longToken);
    uint256 shortTokenAmount = getPoolAmount(dataStore, market, market.shortToken);

    // Convert to USD
    uint256 longTokenUsd = longTokenAmount * prices.longTokenPrice.max;
    uint256 shortTokenUsd = shortTokenAmount * prices.shortTokenPrice.max;

    // Get total PnL of all positions
    int256 netPnl = getNetPnl(dataStore, market, prices, true);

    // Pool value = tokens - positions PnL
    uint256 poolValue = longTokenUsd + shortTokenUsd;

    if (netPnl > 0) {
        // Traders profitable → reduce pool value
        poolValue = poolValue - uint256(netPnl);
    } else {
        // Traders losing → increase pool value
        poolValue = poolValue + uint256(-netPnl);
    }

    return poolValue;
}
```

### Price Impact on Deposits/Withdrawals

Price impact calculated based on pool imbalance:

```mermaid
flowchart TD
    A[Action: Deposit or Withdrawal] --> B[Calculate pool imbalance BEFORE]
    B --> C[imbalance_before = longValue - shortValue / poolValue]
    C --> D[Apply deposit or withdrawal]
    D --> E[Calculate pool imbalance AFTER]
    E --> F[imbalance_after = newLongValue - newShortValue / newPoolValue]
    F --> G[Calculate impact function]
    G --> H[impact_before = f imbalance_before]
    H --> I[impact_after = f imbalance_after]
    I --> J[priceImpact = impact_before - impact_after]
    J --> K{priceImpact < 0?}
    K -->|Yes negative| L[Increases imbalance: user pays fee]
    K -->|No positive| M[Decreases imbalance: user gets rebate capped]

    style K fill:#f0e1ff
    style L fill:#ffe1e1
    style M fill:#e1ffe1
```

**Code References:**
- `contracts/pricing/SwapPricingUtils.sol:67` - `getPriceImpactUsd()`
- `contracts/market/MarketUtils.sol:1456` - Imbalance calculation

---

## Liquidity Management

### Pool Balance Tracking

```mermaid
graph TD
    subgraph "Market State"
        PL[Pool: Long Token Balance]
        PS[Pool: Short Token Balance]
        RL[Reserved: Long Positions]
        RS[Reserved: Short Positions]
    end

    subgraph "Actions that Increase Pool"
        D1[Deposits]
        F1[Position Fees]
        B1[Borrowing Fees]
        S1[Swap Fees]
        PI1[Negative Price Impact]
    end

    subgraph "Actions that Decrease Pool"
        W1[Withdrawals]
        PP[Profitable Position Closes]
        PI2[Positive Price Impact Rebates]
    end

    D1 --> PL
    D1 --> PS
    F1 --> PL
    F1 --> PS
    B1 --> PL
    B1 --> PS
    S1 --> PL
    S1 --> PS
    PI1 --> PL
    PI1 --> PS

    PL --> W1
    PS --> W1
    PL --> PP
    PS --> PP
    PL --> PI2
    PS --> PI2

    style PL fill:#e1f5ff
    style PS fill:#e1f5ff
```

**Code References:**
- `contracts/market/MarketUtils.sol:1865` - `applyDeltaToPoolAmount()`
- `contracts/market/MarketStoreUtils.sol` - Pool amount storage

### Reserved Amounts

Tracking for open positions:

```solidity
// When position opens
reservedAmount += position.sizeInTokens

// When position closes
reservedAmount -= position.sizeInTokens

// Available liquidity = poolAmount - reservedAmount
```

**Code References:**
- `contracts/market/MarketUtils.sol:2055` - `applyDeltaToReservedAmount()`
- `contracts/data/Keys.sol:456` - `RESERVED_USD` key

### Max Pool Utilization

```mermaid
flowchart TD
    A[Check Pool Capacity] --> B[availableLiquidity = poolAmount - reservedAmount]
    B --> C[utilization = reservedAmount / poolAmount]
    C --> D{utilization > maxUtilization?}
    D -->|Yes| E[Reject new position]
    D -->|No| F[Allow new position]
    F --> G[reservedAmount += newPositionSize]

    style D fill:#f0e1ff
    style E fill:#ffe1e1
    style F fill:#e1ffe1
```

**Configuration:**
```solidity
// Max pool utilization factor (e.g., 90%)
dataStore.setUint(Keys.maxPoolUtilizationFactorKey(market), 0.9e30);
```

**Code References:**
- `contracts/market/MarketUtils.sol:1673` - `validateReserve()`
- `contracts/data/Keys.sol:582` - `MAX_POOL_AMOUNT` key

### Open Interest Tracking

```mermaid
graph LR
    subgraph "Long Side"
        OIL[Open Interest Long USD]
        OIL_T[Open Interest Long Tokens]
    end

    subgraph "Short Side"
        OIS[Open Interest Short USD]
        OIS_T[Open Interest Short Tokens]
    end

    IP[Increase Position] --> OIL
    IP --> OIS
    DP[Decrease Position] --> OIL
    DP --> OIS

    OIL --> FF[Funding Fees Calculation]
    OIS --> FF

    style OIL fill:#e1ffe1
    style OIS fill:#ffe1e1
    style FF fill:#f0e1ff
```

**Code References:**
- `contracts/market/MarketUtils.sol:1943` - `applyDeltaToOpenInterest()`
- `contracts/data/Keys.sol:508` - `OPEN_INTEREST` key

### Position Impact Pool

Special pool for managing price impact distribution:

```solidity
// Negative price impact goes to pool
positionImpactPool += negativePriceImpactAmount

// Positive price impact comes from pool (if available)
if (positionImpactPool >= positiveImpactRebate) {
    positionImpactPool -= positiveImpactRebate
    // Give rebate to user
} else {
    // Cap rebate to available pool
}
```

**Distribution:**
```solidity
// Periodic distribution to LPs
distributionRate = getPositionImpactPoolDistributionRate(market)
amountToDistribute = positionImpactPool * distributionRate * timeDelta

// Move from impact pool to main pool
positionImpactPool -= amountToDistribute
poolAmount += amountToDistribute
```

**Code References:**
- `contracts/market/MarketUtils.sol:1785` - `applyDeltaToPositionImpactPool()`
- `contracts/market/MarketUtils.sol:2136` - `distributePositionImpactPool()`

### Liquidity Caps

Markets have configurable liquidity limits:

```typescript
// config/markets.ts
{
    "ETH/USD": {
        maxLongPoolAmount: "50000", // Max 50k WETH
        maxShortPoolAmount: "100000000", // Max 100M USDC
        maxOpenInterestForLongs: "200000000", // Max $200M long OI
        maxOpenInterestForShorts: "200000000", // Max $200M short OI
    }
}
```

**Code References:**
- `contracts/market/MarketUtils.sol:1592` - `validatePoolAmount()`
- `contracts/market/MarketUtils.sol:1623` - `validateOpenInterest()`

---

## Deposit/Withdrawal Fees

### Fee Structure

```mermaid
flowchart TD
    A[User Action] --> B{Deposit or Withdrawal?}
    B -->|Deposit| C[Base deposit fee usually 0]
    B -->|Withdrawal| D[Base withdrawal fee]
    C --> E[+ Swap fees if swap path used]
    D --> E
    E --> F[+ Price impact positive or negative]
    F --> G[+ UI fee if UI fee receiver set]
    G --> H[Total fee deducted from output]

    style F fill:#f0e1ff
```

**Fee Configuration:**
```solidity
// Typically deposits have no base fee (incentivize LPs)
depositFee = 0

// Withdrawals may have small fee
withdrawalFee = 0.001e30 // 0.1%

// Swap fees if tokens swapped during deposit/withdrawal
swapFee = 0.0005e30 // 0.05% per swap
```

**Code References:**
- `contracts/fee/FeeUtils.sol` - Fee calculations
- `config/markets.ts` - Fee configurations per market

---

## Related Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture
- **[TRADING_FLOWS.md](./TRADING_FLOWS.md)** - Trading operations
- **[GLV_FLOWS.md](./GLV_FLOWS.md)** - GLV vault operations
- **[PRICING_FLOWS.md](./PRICING_FLOWS.md)** - Pricing mechanisms

---

*Last Updated: 2025-12-01*
