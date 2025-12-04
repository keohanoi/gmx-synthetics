# GMX Synthetics - Trading Flows

## Table of Contents
1. [Order Lifecycle](#order-lifecycle)
2. [Position Management](#position-management)
3. [Swap Operations](#swap-operations)
4. [Liquidations](#liquidations)
5. [Auto-Deleveraging (ADL)](#auto-deleveraging-adl)

---

## Order Lifecycle

### Order Creation Flow

```mermaid
sequenceDiagram
    participant User
    participant ExchangeRouter
    participant OrderVault
    participant DataStore
    participant EventEmitter
    participant Keeper

    User->>ExchangeRouter: createOrder(params)
    ExchangeRouter->>ExchangeRouter: validateNonZero(sizeDeltaUsd)
    ExchangeRouter->>OrderVault: transferFrom(user, collateral)
    OrderVault->>OrderVault: recordTransferIn(token)
    ExchangeRouter->>DataStore: storeOrder(orderKey, order)
    ExchangeRouter->>EventEmitter: emit OrderCreated
    EventEmitter-->>Keeper: Listen for OrderCreated
    ExchangeRouter-->>User: return orderKey
```

**Code References:**
- `contracts/exchange/ExchangeRouter.sol:192` - `createOrder()`
- `contracts/order/OrderStoreUtils.sol:41` - `set()` (store order)
- `contracts/order/BaseOrderUtils.sol:73` - `createOrder()`

### Order Execution Flow

```mermaid
sequenceDiagram
    participant Keeper
    participant OrderHandler
    participant Oracle
    participant OrderUtils
    participant PositionUtils
    participant DataStore
    participant OrderVault
    participant User

    Keeper->>OrderHandler: executeOrder(key, oracleParams)
    OrderHandler->>OrderHandler: globalNonReentrant()
    OrderHandler->>DataStore: getOrder(key)
    OrderHandler->>Oracle: setPrices(oracleParams)
    Oracle->>Oracle: validateSignatures()
    Oracle->>Oracle: validatePrices()
    OrderHandler->>OrderUtils: executeOrder(order, prices)

    alt MarketIncrease/LimitIncrease
        OrderUtils->>PositionUtils: increasePosition()
        PositionUtils->>DataStore: storePosition()
    else MarketDecrease/LimitDecrease
        OrderUtils->>PositionUtils: decreasePosition()
        PositionUtils->>OrderVault: transferOut(toUser)
    else MarketSwap/LimitSwap
        OrderUtils->>OrderUtils: executeSwap()
        OrderUtils->>OrderVault: transferOut(toUser)
    end

    OrderHandler->>DataStore: removeOrder(key)
    OrderHandler->>EventEmitter: emit OrderExecuted
    OrderHandler->>User: callback (if set)
```

**Code References:**
- `contracts/exchange/OrderHandler.sol:84` - `executeOrder()`
- `contracts/order/BaseOrderUtils.sol:206` - `executeOrder()`
- `contracts/order/OrderUtils.sol:125` - Order type routing

### Order State Machine

```mermaid
stateDiagram-v2
    [*] --> Created: User creates order
    Created --> Frozen: Market frozen
    Created --> Executing: Keeper picks up
    Executing --> Executed: Success
    Executing --> Cancelled: Validation fails
    Frozen --> Executing: Market unfrozen
    Frozen --> Cancelled: User cancels
    Created --> Cancelled: User cancels
    Executed --> [*]
    Cancelled --> [*]
```

**Order Cancellation Reasons:**
- User-initiated cancellation
- Order validation failure (price out of range)
- Execution fee too low
- Market frozen
- Position validation failure
- Insufficient liquidity

**Code References:**
- `contracts/order/BaseOrderUtils.sol:287` - `cancelOrder()`
- `contracts/exchange/OrderHandler.sol:122` - Error handling

---

## Position Management

### Open Position (Market Increase)

```mermaid
flowchart TD
    A[User: createOrder MarketIncrease] --> B[Transfer collateral to OrderVault]
    B --> C[Store Order in DataStore]
    C --> D[Emit OrderCreated]
    D --> E[Keeper: executeOrder]
    E --> F[Oracle: setPrices & validate]
    F --> G[Load existing Position if any]
    G --> H[Calculate price impact]
    H --> I[Validate acceptable price]
    I --> J{Price acceptable?}
    J -->|No| K[Cancel order]
    J -->|Yes| L[Calculate position fees]
    L --> M[Calculate new position size]
    M --> N[Validate position]
    N --> O{Valid?}
    O -->|No| K
    O -->|Yes| P[Update/Create Position in DataStore]
    P --> Q[Update market pool amounts]
    Q --> R[Update virtual inventory]
    R --> S[Emit PositionIncrease]
    S --> T[Remove Order]
    T --> U[User callback if set]

    style A fill:#e1f5ff
    style F fill:#f0e1ff
    style P fill:#fff4e1
    style K fill:#ffe1e1
```

**Code References:**
- `contracts/order/IncreaseOrderUtils.sol:64` - `processOrder()`
- `contracts/position/IncreasePositionUtils.sol:58` - `increasePosition()`
- `contracts/pricing/PositionPricingUtils.sol:89` - `getPriceImpactUsd()`

**Key Calculations:**

```solidity
// contracts/position/IncreasePositionUtils.sol

// Calculate position size in tokens
sizeInTokens = sizeInUsd / executionPrice

// Calculate collateral after fees
collateralAmount = initialCollateral - positionFee - uiFee

// Update position
position.sizeInUsd += sizeInUsd
position.sizeInTokens += sizeInTokens
position.collateralAmount += collateralAmount
```

### Close Position (Market Decrease)

```mermaid
flowchart TD
    A[User: createOrder MarketDecrease] --> B[Store Order in DataStore]
    B --> C[Emit OrderCreated]
    C --> D[Keeper: executeOrder]
    D --> E[Oracle: setPrices & validate]
    E --> F[Load Position from DataStore]
    F --> G{Position exists?}
    G -->|No| H[Cancel order]
    G -->|Yes| I[Calculate PnL]
    I --> J[Calculate borrowing fees]
    J --> K[Calculate funding fees]
    K --> L[Calculate price impact]
    L --> M[Calculate total output]
    M --> N[Validate min output amount]
    N --> O{Output acceptable?}
    O -->|No| H
    O -->|Yes| P[Update Position collateral & size]
    P --> Q{Position fully closed?}
    Q -->|Yes| R[Remove Position from DataStore]
    Q -->|No| S[Update Position in DataStore]
    S --> T[Update market pool amounts]
    R --> T
    T --> U[Execute output token swap if needed]
    U --> V[Transfer output to user]
    V --> W[Emit PositionDecrease]
    W --> X[Remove Order]
    X --> Y[User callback if set]

    style A fill:#e1f5ff
    style E fill:#f0e1ff
    style P fill:#fff4e1
    style H fill:#ffe1e1
```

**Code References:**
- `contracts/order/DecreaseOrderUtils.sol:48` - `processOrder()`
- `contracts/position/DecreasePositionUtils.sol:77` - `decreasePosition()`
- `contracts/position/DecreasePositionCollateralUtils.sol:75` - `processCollateral()`
- `contracts/position/DecreasePositionSwapUtils.sol:28` - `swapWithdrawnCollateralToPnlToken()`

**PnL Calculation:**

```solidity
// contracts/position/PositionUtils.sol:199

// For Long Position
if (position.isLong) {
    priceDelta = executionPrice - position.entryPrice;
    pnl = position.sizeInTokens * priceDelta;
}

// For Short Position
if (!position.isLong) {
    priceDelta = position.entryPrice - executionPrice;
    pnl = position.sizeInTokens * priceDelta;
}

// Total output = collateral ± pnl - fees - priceImpact
```

### Position Data Flow

```mermaid
graph TD
    subgraph "Position Storage"
        DS[DataStore]
        PSU[PositionStoreUtils]
    end

    subgraph "Position Updates"
        IPU[IncreasePositionUtils]
        DPU[DecreasePositionUtils]
        DPCU[DecreasePositionCollateralUtils]
    end

    subgraph "Position Queries"
        R[Reader]
        PU[PositionUtils]
    end

    subgraph "Position Calculations"
        PPU[PositionPricingUtils]
        MU[MarketUtils]
    end

    IPU --> PSU
    DPU --> PSU
    DPCU --> PSU
    PSU --> DS

    DS --> R
    DS --> PU

    PU --> PPU
    PU --> MU

    R --> Frontend[Frontend/Dapps]

    style DS fill:#fff4e1
    style Frontend fill:#e1f5ff
```

**Position Key Structure:**

```solidity
// contracts/position/PositionUtils.sol:35
function getPositionKey(
    address account,
    address market,
    address collateralToken,
    bool isLong
) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(
        account,
        market,
        collateralToken,
        isLong
    ));
}
```

**Code References:**
- `contracts/position/Position.sol:29` - Position data structure
- `contracts/position/PositionStoreUtils.sol:29` - Storage operations
- `contracts/position/PositionUtils.sol` - Core position logic

---

## Swap Operations

### Simple Swap Flow

```mermaid
sequenceDiagram
    participant User
    participant ExchangeRouter
    participant OrderHandler
    participant SwapUtils
    participant Market
    participant OrderVault

    User->>ExchangeRouter: createOrder(MarketSwap)
    ExchangeRouter->>OrderVault: transfer tokenIn
    ExchangeRouter->>DataStore: store swap order

    Keeper->>OrderHandler: executeOrder()
    OrderHandler->>Oracle: get prices
    OrderHandler->>SwapUtils: swap(tokenIn, tokenOut, market)

    SwapUtils->>SwapUtils: calculate price impact
    SwapUtils->>Market: update pool balances
    Market->>Market: poolAmountOut -= amountOut
    Market->>Market: poolAmountIn += amountIn

    SwapUtils->>Market: update virtual inventory
    SwapUtils->>OrderVault: transferOut(tokenOut, user)
    OrderVault->>User: receive tokenOut

    OrderHandler->>DataStore: remove order
    OrderHandler->>EventEmitter: emit SwapExecuted
```

**Code References:**
- `contracts/swap/SwapUtils.sol:79` - `swap()`
- `contracts/pricing/SwapPricingUtils.sol:67` - `getPriceImpactUsd()`
- `contracts/order/SwapOrderUtils.sol:40` - `processOrder()`

### Multi-Hop Swap Flow

```mermaid
flowchart LR
    A[User: USDC] --> B[Market1: USDC→WETH]
    B --> C[Market2: WETH→WBTC]
    C --> D[User: WBTC]

    subgraph "Swap Path"
        B
        C
    end

    style A fill:#e1f5ff
    style D fill:#e1f5ff
    style B fill:#fff4e1
    style C fill:#fff4e1
```

**Example Swap Path:**
```solidity
// Swap USDC → WBTC via ETH
address[] memory swapPath = new address[](2);
swapPath[0] = ethUsdMarket;  // USDC → WETH
swapPath[1] = btcUsdMarket;  // WETH → WBTC

createOrder({
    orderType: OrderType.MarketSwap,
    initialCollateralToken: USDC,
    swapPath: swapPath,
    // ...
});
```

**Code References:**
- `contracts/order/BaseOrderUtils.sol:473` - `getOutputToken()` (determines final token)
- `contracts/swap/SwapUtils.sol:79` - Iterates through swap path

### Swap Price Impact Calculation

```mermaid
flowchart TD
    A[Start Swap] --> B[Get current pool imbalance]
    B --> C[imbalance_before = longValue - shortValue / poolValue]
    C --> D[Calculate swap amounts]
    D --> E[imbalance_after with swap applied]
    E --> F[Calculate impact_before = f imbalance_before]
    F --> G[Calculate impact_after = f imbalance_after]
    G --> H[priceImpact = impact_before - impact_after]
    H --> I{priceImpact < 0?}
    I -->|Yes negative impact| J[User pays fee]
    I -->|No positive impact| K[User gets rebate capped]
    J --> L[Adjust output amount down]
    K --> M[Adjust output amount up]
    L --> N[Update virtual inventory]
    M --> N
    N --> O[Execute swap]

    style I fill:#f0e1ff
    style J fill:#ffe1e1
    style K fill:#e1ffe1
```

**Code References:**
- `contracts/pricing/SwapPricingUtils.sol:67` - `getPriceImpactUsd()`
- `contracts/market/MarketUtils.sol:1456` - Pool imbalance calculation
- `contracts/pricing/PricingUtils.sol:89` - Price impact formula

**Price Impact Formula:**

```solidity
// contracts/pricing/SwapPricingUtils.sol

// Calculate imbalance impact
function getPriceImpactUsd(params) returns (int256) {
    // Get pool value and imbalance
    (int256 impactUsd, int256 cappedImpactUsd) =
        _getPriceImpactUsd(params);

    // Positive impact (rebate) is capped
    if (impactUsd > 0) {
        return Math.min(impactUsd, cappedImpactUsd);
    }

    // Negative impact (fee) is not capped
    return impactUsd;
}
```

---

## Liquidations

### Liquidation Flow

```mermaid
sequenceDiagram
    participant Keeper
    participant LiquidationHandler
    participant Oracle
    participant LiquidationUtils
    participant PositionUtils
    participant Market
    participant PositionImpactPool

    Keeper->>LiquidationHandler: executeLiquidation(account, market, collateralToken, isLong)
    LiquidationHandler->>Oracle: setPrices()
    LiquidationHandler->>DataStore: getPosition(key)

    LiquidationHandler->>LiquidationUtils: validateLiquidation()
    LiquidationUtils->>LiquidationUtils: calculatePositionPnl()
    LiquidationUtils->>LiquidationUtils: calculateBorrowingFees()
    LiquidationUtils->>LiquidationUtils: calculateFundingFees()
    LiquidationUtils->>LiquidationUtils: calculateRemainingCollateral()

    alt remainingCollateral < minCollateral
        LiquidationUtils-->>LiquidationHandler: Valid
        LiquidationHandler->>PositionUtils: decreasePosition(size=full)
        PositionUtils->>Market: update pool amounts
        PositionUtils->>PositionImpactPool: distribute remaining collateral
        PositionUtils->>Keeper: pay liquidation fee
        PositionUtils->>DataStore: removePosition()
        LiquidationHandler->>EventEmitter: emit PositionLiquidated
    else remainingCollateral >= minCollateral
        LiquidationUtils-->>LiquidationHandler: Invalid
        LiquidationHandler->>Keeper: revert
    end
```

**Code References:**
- `contracts/exchange/LiquidationHandler.sol:46` - `executeLiquidation()`
- `contracts/liquidation/LiquidationUtils.sol:83` - `validateLiquidation()`
- `contracts/position/DecreasePositionUtils.sol` - Position close logic

### Liquidation Conditions

```mermaid
flowchart TD
    A[Check Position] --> B[Calculate Position Value]
    B --> C[Get unrealized PnL]
    C --> D[Subtract borrowing fees]
    D --> E[Subtract funding fees]
    E --> F[Subtract position fees]
    F --> G[Subtract price impact if closing]
    G --> H[remainingCollateral = collateral + pnl - fees - impact]
    H --> I{remainingCollateral < minCollateralUsd?}
    I -->|Yes| J[LIQUIDATABLE]
    I -->|No| K[SAFE]

    J --> L[Keeper triggers liquidation]
    L --> M[Close position fully]
    M --> N[Distribute collateral]
    N --> O[Liquidation fee to keeper]
    O --> P[Remainder to impact pool]

    style J fill:#ffe1e1
    style K fill:#e1ffe1
    style L fill:#fff4e1
```

**Liquidation Calculations:**

```solidity
// contracts/liquidation/LiquidationUtils.sol:157

// Calculate if position is liquidatable
function validateLiquidation(
    Position.Props memory position,
    Market.Props memory market,
    MarketPrices prices
) internal view {
    // Get position PnL
    (int256 positionPnlUsd, , ) = PositionUtils.getPositionPnlUsd(
        dataStore,
        market,
        prices,
        position,
        sizeDeltaUsd // full size
    );

    // Calculate fees
    PositionPricingUtils.GetPositionFeesParams memory feesParams = ...;
    PositionPricingUtils.PositionFees memory fees =
        PositionPricingUtils.getPositionFees(feesParams);

    // Remaining collateral
    int256 remainingCollateralUsd =
        position.collateralAmount.toInt256()
        + positionPnlUsd
        - fees.totalCostAmount.toInt256();

    // Check if liquidatable
    if (remainingCollateralUsd < minCollateralUsd) {
        return; // Liquidatable
    }

    revert Errors.PositionShouldNotBeLiquidated();
}
```

**Code References:**
- `contracts/liquidation/LiquidationUtils.sol:157` - Validation logic
- `contracts/data/Keys.sol:1847` - `MIN_COLLATERAL_USD` key

---

## Auto-Deleveraging (ADL)

### ADL Trigger Flow

```mermaid
flowchart TD
    A[Keeper monitors market] --> B[Calculate PnL to Pool Factor]
    B --> C{pnlToPoolFactor > maxPnlFactor?}
    C -->|No| A
    C -->|Yes| D[Get ADL state]
    D --> E{Is ADL enabled?}
    E -->|No| F[Wait]
    E -->|Yes| G[Select most profitable positions]
    G --> H[Sort by PnL percentage]
    H --> I[Calculate positions to ADL]
    I --> J[Execute ADL on positions]
    J --> K[Close positions at oracle price]
    K --> L[No price impact applied]
    L --> M[Update pool state]
    M --> N[Emit ADL events]
    N --> O{pnlToPoolFactor acceptable?}
    O -->|No| G
    O -->|Yes| P[ADL complete]

    style C fill:#f0e1ff
    style G fill:#fff4e1
    style K fill:#e1ffe1
```

**Code References:**
- `contracts/adl/AdlUtils.sol:223` - `updateAdlState()`
- `contracts/adl/AdlUtils.sol:319` - `validateAdl()`
- `contracts/exchange/AdlHandler.sol:51` - `executeAdl()`

### ADL State Machine

```mermaid
stateDiagram-v2
    [*] --> Normal: pnlFactor < threshold
    Normal --> AtRisk: pnlFactor ≥ threshold
    AtRisk --> ADL_Active: pnlFactor > maxPnlFactor
    ADL_Active --> AtRisk: Positions closed
    AtRisk --> Normal: pnlFactor decreases
    ADL_Active --> Normal: Enough positions closed
```

**ADL Conditions:**

```solidity
// contracts/adl/AdlUtils.sol

// Check if ADL should be triggered
function validateAdl(
    DataStore dataStore,
    address market,
    bool isLong,
    MarketPrices prices
) internal view {
    // Get max PnL factor for this market
    uint256 maxPnlFactor = MarketUtils.getMaxPnlFactor(
        dataStore,
        market,
        isLong
    );

    // Calculate current PnL to pool factor
    (int256 pnlToPoolFactor, ) = MarketUtils.getPnlToPoolFactor(
        dataStore,
        market,
        prices,
        isLong,
        true // maximize PnL
    );

    // Check if ADL needed
    if (pnlToPoolFactor < maxPnlFactor.toInt256()) {
        revert Errors.AdlNotRequired(pnlToPoolFactor, maxPnlFactor);
    }
}
```

### ADL Execution Details

```mermaid
sequenceDiagram
    participant Keeper
    participant AdlHandler
    participant AdlUtils
    participant DataStore
    participant PositionUtils

    Keeper->>AdlHandler: executeAdl(market, isLong, account)
    AdlHandler->>AdlUtils: validateAdl()
    AdlUtils->>AdlUtils: getPnlToPoolFactor()
    AdlUtils-->>AdlHandler: Valid

    AdlHandler->>DataStore: getAccountPositions(isLong)
    AdlHandler->>AdlUtils: getAdlPositions(positions)
    AdlUtils->>AdlUtils: Sort by PnL%
    AdlUtils-->>AdlHandler: [position1, position2, ...]

    loop For each position
        AdlHandler->>PositionUtils: decreasePosition(size=full, no price impact)
        PositionUtils->>DataStore: updatePosition()
        AdlHandler->>EventEmitter: emit PositionAdl
    end

    AdlHandler->>AdlUtils: updateAdlState()
```

**ADL Position Selection:**

Positions selected for ADL based on:
1. **PnL Percentage** (highest first)
2. **Position Size** (larger positions prioritized)
3. **Time** (older positions may be prioritized)

**No Price Impact on ADL:**
- ADL positions closed at oracle price
- No price impact fees charged
- Fair to users being ADL'd
- Protects LP pool from excessive losses

**Code References:**
- `contracts/adl/AdlUtils.sol:77` - `createAdlOrder()`
- `contracts/position/DecreasePositionUtils.sol` - Close position logic (ADL path)

---

## Order Types Reference

### Market Orders vs Limit Orders

| Feature | Market Order | Limit Order |
|---------|-------------|-------------|
| Execution | Immediate (next keeper) | When price reaches trigger |
| Price | Current oracle price | User-specified trigger |
| Guarantee | Executes if liquidity available | May not execute |
| Use Case | Immediate entry/exit | Price targeting |

**Code References:**
- `contracts/order/Order.sol:95` - OrderType enum
- `contracts/order/BaseOrderUtils.sol:206` - Order type routing

### Order Validation

All orders validated for:
- Sufficient execution fee
- Valid market
- Acceptable price range (slippage protection)
- Position size limits
- Collateral requirements
- Market not frozen

**Code References:**
- `contracts/order/BaseOrderUtils.sol:564` - `validateNonEmptyOrder()`
- `contracts/order/OrderUtils.sol:178` - `validateOrderTriggerPrice()`

---

## Related Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture overview
- **[LIQUIDITY_FLOWS.md](./LIQUIDITY_FLOWS.md)** - Deposit and withdrawal flows
- **[PRICING_FLOWS.md](./PRICING_FLOWS.md)** - Pricing mechanisms
- **[COMPONENTS.md](./COMPONENTS.md)** - Contract reference

---

*Last Updated: 2025-12-01*
