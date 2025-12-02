# GMX Synthetics - GLV Flows

## Table of Contents
1. [GLV Overview](#glv-overview)
2. [GLV Deposit Flow](#glv-deposit-flow)
3. [GLV Withdrawal Flow](#glv-withdrawal-flow)
4. [GLV Shift (Rebalancing)](#glv-shift-rebalancing)
5. [GLV Token Pricing](#glv-token-pricing)

---

## GLV Overview

### What is a GLV?

**GLV (GMX Liquidity Vault)** is a liquidity aggregation layer that wraps multiple GM markets into a single token.

```mermaid
graph TD
    subgraph "GLV: GLV_ETH_USDC"
        GT[GLV Token]
    end

    subgraph "Underlying GM Markets"
        GM1[GM: ETH/USD Market 1]
        GM2[GM: ETH/USD Market 2]
        GM3[GM: ETH/USD Market 3]
    end

    GT --> GM1
    GT --> GM2
    GT --> GM3

    U[User deposits WETH + USDC] --> GT
    GT --> U2[User receives GLV tokens]

    style GT fill:#e1f5ff
    style GM1 fill:#fff4e1
    style GM2 fill:#fff4e1
    style GM3 fill:#fff4e1
```

**Benefits:**
- **Unified Liquidity**: Single token represents multiple markets
- **Auto-Rebalancing**: Shifts liquidity based on utilization
- **Reduced Fragmentation**: LPs don't need to choose specific markets
- **Diversified Exposure**: Risk spread across multiple markets
- **Better Depth**: More liquidity available for traders

**Code References:**
- `contracts/glv/Glv.sol:16` - GLV data structure
- `contracts/glv/GlvFactory.sol` - GLV creation
- `contracts/glv/GlvToken.sol` - ERC20 GLV token

### GLV Data Structure

```solidity
// contracts/glv/Glv.sol:16

struct Props {
    address glvToken;      // GLV ERC20 token address
    address longToken;     // Common long token (e.g., WETH)
    address shortToken;    // Common short token (e.g., USDC)
}

// GLV contains list of GM markets
// All markets must use same long/short tokens
address[] markets = getGlvMarkets(dataStore, glvAddress);
```

**Code Reference:**
- `contracts/glv/Glv.sol:16`

---

## GLV Deposit Flow

### GLV Deposit Process

```mermaid
sequenceDiagram
    participant User
    participant GlvRouter
    participant GlvDepositUtils
    participant MarketUtils
    participant GlvToken
    participant GMTokens

    User->>GlvRouter: createGlvDeposit(params)
    Note over User,GlvRouter: User specifies GLV + GM tokens to deposit

    alt Option 1: Deposit GM Tokens Directly
        GlvRouter->>GMTokens: transferFrom(user, GM tokens)
        GlvRouter->>DataStore: store GLV deposit
    else Option 2: Deposit Long/Short Tokens
        GlvRouter->>DepositVault: transfer long/short tokens
        GlvRouter->>DataStore: create GM deposits first
        Note over GlvRouter: Will mint GM, then GLV
    end

    Keeper->>GlvDepositHandler: executeGlvDeposit(key)

    alt If depositing long/short tokens
        GlvDepositHandler->>DepositHandler: execute underlying GM deposits
        DepositHandler->>GMTokens: mint GM tokens
    end

    GlvDepositHandler->>GlvDepositUtils: executeGlvDeposit()
    GlvDepositUtils->>GlvDepositUtils: getGlvValue()
    GlvDepositUtils->>GlvDepositUtils: getMarketTokenValue()
    GlvDepositUtils->>GlvDepositUtils: calculateGlvTokensOut()

    GlvDepositUtils->>GlvToken: mint(user, glvTokenAmount)
    GlvToken-->>User: GLV tokens

    GlvDepositUtils->>DataStore: update GLV market balances
    GlvDepositUtils->>EventEmitter: emit GlvDepositExecuted
```

**Code References:**
- `contracts/router/GlvRouter.sol` - User-facing GLV operations
- `contracts/exchange/GlvDepositHandler.sol` - GLV deposit execution
- `contracts/glvDeposit/ExecuteGlvDepositUtils.sol` - GLV deposit logic

### GLV Deposit Options

**Option 1: Deposit GM Tokens**
```solidity
// Already have GM tokens, want to wrap into GLV
createGlvDeposit({
    glv: glvEthUsdc,
    market: ethUsdMarket1,
    marketTokenAmount: gmTokens, // Existing GM tokens
    // ...
});
```

**Option 2: Deposit Long/Short Tokens**
```solidity
// Deposit WETH + USDC directly into GLV
// Will first mint GM, then mint GLV
createGlvDeposit({
    glv: glvEthUsdc,
    initialLongTokenAmount: wethAmount,
    initialShortTokenAmount: usdcAmount,
    // ...
});
```

**Code References:**
- `contracts/glvDeposit/GlvDepositUtils.sol:45` - `createGlvDeposit()`

### GLV Token Amount Calculation

```mermaid
flowchart TD
    A[Calculate GLV Tokens Out] --> B[Get total GLV value]
    B --> C[Sum all GM market values in GLV]
    C --> D[Get GLV token supply]
    D --> E[Get deposit value GM tokens or long/short]
    E --> F{First GLV deposit?}
    F -->|Yes| G[glvTokens = depositValue]
    F -->|No| H[glvTokens = depositValue * supply / glvValue]
    G --> I[Mint GLV tokens to user]
    H --> I
    I --> J[Update GLV GM balances]
    J --> K[Emit GlvDepositExecuted]

    style F fill:#f0e1ff
    style I fill:#e1ffe1
```

**Formula:**

```solidity
// contracts/glvDeposit/ExecuteGlvDepositUtils.sol

function getGlvTokensOut(
    DataStore dataStore,
    address glv,
    MarketPrices prices,
    uint256 depositValue
) internal view returns (uint256) {
    // Get total GLV value
    uint256 glvValue = GlvUtils.getGlvValue(dataStore, glv, prices);

    // Get GLV token supply
    uint256 supply = getGlvTokenSupply(glv);

    // Calculate GLV tokens to mint
    if (supply == 0) {
        return depositValue;
    } else {
        return depositValue * supply / glvValue;
    }
}
```

**Code References:**
- `contracts/glv/GlvUtils.sol:123` - `getGlvValue()`
- `contracts/glvDeposit/ExecuteGlvDepositUtils.sol` - GLV token calculation

---

## GLV Withdrawal Flow

### GLV Withdrawal Process

```mermaid
sequenceDiagram
    participant User
    participant GlvRouter
    participant GlvWithdrawalHandler
    participant GlvWithdrawalUtils
    participant GlvToken
    participant GMTokens

    User->>GlvRouter: createGlvWithdrawal(params)
    Note over User,GlvRouter: User specifies GLV tokens to burn

    GlvRouter->>GlvToken: transferFrom(user, glvTokens)
    GlvRouter->>GlvToken: burn(glvTokens)
    GlvRouter->>DataStore: store GLV withdrawal

    Keeper->>GlvWithdrawalHandler: executeGlvWithdrawal(key)
    GlvWithdrawalHandler->>GlvWithdrawalUtils: executeGlvWithdrawal()

    GlvWithdrawalUtils->>GlvWithdrawalUtils: getGlvValue()
    GlvWithdrawalUtils->>GlvWithdrawalUtils: calculateWithdrawalValue()
    GlvWithdrawalUtils->>GlvWithdrawalUtils: selectMarketsToWithdrawFrom()

    alt Option 1: Withdraw as GM Tokens
        GlvWithdrawalUtils->>GMTokens: transfer GM to user
        GMTokens-->>User: GM tokens
    else Option 2: Withdraw as Long/Short Tokens
        GlvWithdrawalUtils->>WithdrawalHandler: create GM withdrawals
        WithdrawalHandler->>GMTokens: burn GM tokens
        WithdrawalHandler->>User: transfer long/short tokens
    end

    GlvWithdrawalUtils->>DataStore: update GLV market balances
    GlvWithdrawalUtils->>EventEmitter: emit GlvWithdrawalExecuted
```

**Code References:**
- `contracts/router/GlvRouter.sol` - GLV withdrawal creation
- `contracts/exchange/GlvWithdrawalHandler.sol` - Withdrawal execution
- `contracts/glvWithdrawal/ExecuteGlvWithdrawalUtils.sol` - Withdrawal logic

### GLV Withdrawal Options

**Option 1: Withdraw as GM Tokens**
```solidity
// Receive GM tokens (don't unwrap)
createGlvWithdrawal({
    glv: glvEthUsdc,
    glvTokenAmount: glvTokens,
    market: ethUsdMarket1, // Which GM market to withdraw from
    shouldUnwrapGmToken: false,
    // ...
});
```

**Option 2: Withdraw as Long/Short Tokens**
```solidity
// Receive WETH + USDC (unwrap GM tokens)
createGlvWithdrawal({
    glv: glvEthUsdc,
    glvTokenAmount: glvTokens,
    shouldUnwrapGmToken: true,
    minLongTokenAmount: minWeth,
    minShortTokenAmount: minUsdc,
    // ...
});
```

**Code References:**
- `contracts/glvWithdrawal/GlvWithdrawalUtils.sol:47` - `createGlvWithdrawal()`

### GLV Withdrawal Amount Calculation

```mermaid
flowchart TD
    A[Calculate Withdrawal] --> B[Get total GLV value]
    B --> C[Get GLV token supply]
    C --> D[userShare = glvTokensToBurn / supply]
    D --> E[withdrawalValue = userShare * glvValue]
    E --> F[Select markets to withdraw from]
    F --> G{Withdrawal strategy?}
    G -->|Balanced| H[Withdraw proportionally from all markets]
    G -->|Specific| I[Withdraw from user-specified market]
    H --> J[Calculate GM tokens or long/short amounts]
    I --> J
    J --> K[Validate min output amounts]
    K --> L{Output >= min?}
    L -->|No| M[Revert]
    L -->|Yes| N[Execute withdrawal]
    N --> O[Transfer tokens to user]

    style L fill:#f0e1ff
    style M fill:#ffe1e1
    style O fill:#e1ffe1
```

**Code References:**
- `contracts/glv/GlvUtils.sol:123` - `getGlvValue()`
- `contracts/glvWithdrawal/ExecuteGlvWithdrawalUtils.sol` - Withdrawal calculation

---

## GLV Shift (Rebalancing)

### Why Shift?

GLV automatically rebalances liquidity between underlying markets based on utilization.

**Goals:**
- Keep liquidity where it's most needed
- Maximize LP fee generation
- Balance risk across markets
- Maintain efficient capital allocation

### Shift Trigger Conditions

```mermaid
flowchart TD
    A[Monitor GLV Markets] --> B[Calculate each market utilization]
    B --> C[utilization = openInterest / poolValue]
    C --> D{Any market over-utilized?}
    D -->|No| A
    D -->|Yes| E[Identify source & target markets]
    E --> F[source = high utilization market]
    F --> G[target = low utilization market]
    G --> H{Shift configured?}
    H -->|No| A
    H -->|Yes| I[Keeper triggers shift]
    I --> J[Execute shift]

    style D fill:#f0e1ff
    style H fill:#f0e1ff
```

**Code References:**
- `contracts/glvShift/GlvShiftUtils.sol` - Shift logic
- `contracts/exchange/ShiftHandler.sol` - Shift execution

### Shift Execution Flow

```mermaid
sequenceDiagram
    participant Keeper
    participant ShiftHandler
    participant GlvShiftUtils
    participant SourceMarket
    participant TargetMarket
    participant GlvToken

    Keeper->>ShiftHandler: executeGlvShift(glv, fromMarket, toMarket)
    ShiftHandler->>GlvShiftUtils: validateShift()
    GlvShiftUtils->>GlvShiftUtils: checkShiftConfigured()
    GlvShiftUtils->>GlvShiftUtils: checkUtilizationThresholds()

    ShiftHandler->>GlvShiftUtils: executeGlvShift()

    Note over GlvShiftUtils: Step 1: Withdraw from source market
    GlvShiftUtils->>SourceMarket: withdraw GM tokens
    SourceMarket->>GlvShiftUtils: transfer long/short tokens

    Note over GlvShiftUtils: Step 2: Deposit to target market
    GlvShiftUtils->>TargetMarket: deposit long/short tokens
    TargetMarket->>GlvShiftUtils: receive GM tokens

    GlvShiftUtils->>DataStore: update GLV market balances
    GlvShiftUtils->>EventEmitter: emit GlvShiftExecuted

    Note over Keeper: Keeper earns execution fee
```

**Code References:**
- `contracts/exchange/ShiftHandler.sol:52` - `executeGlvShift()`
- `contracts/glvShift/GlvShiftUtils.sol:91` - `executeGlvShift()`

### Shift Configuration

```solidity
// config/glvs.ts

export const glvs = {
    arbitrum: {
        "GLV_ETH_USDC": {
            markets: [
                "ETH/USD [ETH-USDC]",
                "ETH/USD [ETH-DAI]",
                "ETH/USD [ETH-USDT]"
            ],
            shifts: [
                { fromMarket: 0, toMarket: 1 }, // Market 0 → Market 1
                { fromMarket: 0, toMarket: 2 }, // Market 0 → Market 2
                { fromMarket: 1, toMarket: 0 }, // Market 1 → Market 0
                { fromMarket: 1, toMarket: 2 }, // Market 1 → Market 2
                { fromMarket: 2, toMarket: 0 }, // Market 2 → Market 0
                { fromMarket: 2, toMarket: 1 }, // Market 2 → Market 1
            ]
        }
    }
}
```

**Code References:**
- `config/glvs.ts` - GLV and shift configurations
- `contracts/glv/GlvUtils.sol:230` - Shift validation

### Shift Amount Calculation

```mermaid
flowchart TD
    A[Calculate Shift Amount] --> B[Get source market utilization]
    B --> C[Get target market utilization]
    C --> D[Calculate ideal utilization]
    D --> E[targetUtil = total OI / total liquidity]
    E --> F[Calculate excess in source]
    F --> G[excessLiquidity = sourcePool - ideal]
    G --> H[Calculate available in target]
    H --> I[availableCapacity = maxPool - targetPool]
    I --> J[shiftAmount = min excessLiquidity, availableCapacity]
    J --> K{shiftAmount > minShiftAmount?}
    K -->|No| L[Skip shift]
    K -->|Yes| M[Execute shift]
    M --> N[Withdraw from source]
    N --> O[Deposit to target]

    style K fill:#f0e1ff
    style L fill:#ffe1e1
    style M fill:#e1ffe1
```

**Code References:**
- `contracts/glvShift/GlvShiftUtils.sol:172` - Shift amount logic

### Shift Impact on LPs

```mermaid
graph TD
    subgraph "Before Shift"
        B1[Market 1: High utilization]
        B2[Market 2: Low utilization]
        B3[LP earns fees on all markets]
    end

    subgraph "After Shift"
        A1[Market 1: Balanced utilization]
        A2[Market 2: Balanced utilization]
        A3[LP earns more fees overall]
    end

    B1 --> S[Shift Execution]
    B2 --> S
    S --> A1
    S --> A2

    B3 --> A3

    style S fill:#fff4e1
    style A3 fill:#e1ffe1
```

**Benefits for LPs:**
- Better capital efficiency
- Higher fee generation
- Balanced risk exposure
- Automatic optimization

---

## GLV Token Pricing

### GLV Value Calculation

```mermaid
flowchart TD
    A[Calculate GLV Value] --> B[Get all GLV markets]
    B --> C[For each market in GLV]
    C --> D[Get GM balance in that market]
    D --> E[Get GM token price]
    E --> F[marketValue = gmBalance * gmPrice]
    F --> G[Sum all market values]
    G --> H[glvTotalValue = sum of all markets]
    H --> I[Get GLV token supply]
    I --> J[glvTokenPrice = glvTotalValue / supply]

    style H fill:#fff4e1
    style J fill:#e1f5ff
```

**Formula:**

```solidity
// contracts/glv/GlvUtils.sol:123

function getGlvValue(
    DataStore dataStore,
    address glv,
    MarketPrices[] prices
) internal view returns (uint256) {
    uint256 totalValue = 0;

    // Get all markets in GLV
    address[] memory markets = getGlvMarkets(dataStore, glv);

    for (uint256 i = 0; i < markets.length; i++) {
        address market = markets[i];

        // Get GLV's GM balance for this market
        uint256 gmBalance = getGlvMarketBalance(dataStore, glv, market);

        // Get GM token value
        uint256 gmValue = MarketUtils.getMarketTokenValue(
            dataStore,
            market,
            prices[i],
            gmBalance
        );

        totalValue += gmValue;
    }

    return totalValue;
}
```

**Code References:**
- `contracts/glv/GlvUtils.sol:123` - `getGlvValue()`
- `contracts/market/MarketUtils.sol` - GM token value
- `contracts/reader/ReaderUtils.sol` - GLV info queries

### GLV Market Balances

GLV tracks how much of each GM market it holds:

```solidity
// Get GLV's balance of a specific GM market
uint256 gmBalance = dataStore.getUint(
    Keys.glvMarketBalanceKey(glv, market)
);

// Updated on:
// - GLV deposits (increases)
// - GLV withdrawals (decreases)
// - Shifts (moves balance between markets)
```

**Code References:**
- `contracts/glv/GlvUtils.sol:285` - `applyDeltaToGlvMarketBalance()`
- `contracts/data/Keys.sol` - GLV balance keys

### Reading GLV Info

```solidity
// Get GLV info via Reader
struct GlvInfo {
    address glv;
    address glvToken;
    address longToken;
    address shortToken;
    address[] markets;
    uint256[] marketBalances;
    uint256 glvTokenSupply;
    uint256 glvValue;
}

GlvInfo memory glvInfo = reader.getGlvInfo(
    dataStore,
    glvAddress,
    prices
);
```

**Code References:**
- `contracts/reader/Reader.sol` - GLV query functions
- `contracts/reader/ReaderUtils.sol` - GLV data helpers

---

## GLV Fee Distribution

### Fee Flow in GLV

```mermaid
graph TD
    subgraph "GM Markets"
        M1[Market 1: Collects fees]
        M2[Market 2: Collects fees]
        M3[Market 3: Collects fees]
    end

    subgraph "GLV"
        GLV[GLV Token Holders]
    end

    M1 --> |Fees accrue to GM| M1V[GM token value increases]
    M2 --> |Fees accrue to GM| M2V[GM token value increases]
    M3 --> |Fees accrue to GM| M3V[GM token value increases]

    M1V --> GLV
    M2V --> GLV
    M3V --> GLV

    GLV --> LP[LP earns fees from all markets]

    style M1V fill:#e1ffe1
    style M2V fill:#e1ffe1
    style M3V fill:#e1ffe1
    style LP fill:#e1f5ff
```

**Key Point:**
- GLV doesn't collect separate fees
- GLV holds GM tokens
- GM tokens accrue value from underlying market fees
- GLV token value increases as GM tokens increase

---

## GLV Management

### Adding Markets to GLV

```solidity
// Add new market to GLV
GlvUtils.addMarketToGlv(
    dataStore,
    glv,
    newMarket
);

// Requirements:
// - Market must use same long/short tokens as GLV
// - Called via timelock configuration
```

**Code References:**
- `contracts/glv/GlvUtils.sol:315` - `addMarketToGlv()`

### Removing Markets from GLV

```solidity
// Remove market from GLV
GlvUtils.removeMarketFromGlv(
    dataStore,
    glv,
    market
);

// Requirements:
// - GLV must have zero balance in that market
// - Called via timelock configuration
```

**Code References:**
- `contracts/glv/GlvUtils.sol:345` - `removeMarketFromGlv()`

### GLV Configuration Keys

```solidity
// contracts/data/Keys.sol

// GLV token address
glvTokenKey(glv)

// Markets in GLV
glvMarketsKey(glv)

// GLV balance of specific GM market
glvMarketBalanceKey(glv, market)

// Shift configuration
isGlvShiftEnabledKey(glv, fromMarket, toMarket)
```

**Code References:**
- `contracts/data/Keys.sol` - GLV configuration keys
- `contracts/glv/GlvUtils.sol` - GLV configuration functions

---

## Related Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture
- **[TRADING_FLOWS.md](./TRADING_FLOWS.md)** - Trading operations
- **[LIQUIDITY_FLOWS.md](./LIQUIDITY_FLOWS.md)** - GM deposit/withdrawal
- **[PRICING_FLOWS.md](./PRICING_FLOWS.md)** - Pricing mechanisms

---

*Last Updated: 2025-12-01*
