# GMX Synthetics - Integration Guide

Comprehensive guide for developers building on GMX Synthetics.

## Table of Contents
1. [Quick Start](#quick-start)
2. [ExchangeRouter Interface](#exchangerouter-interface)
3. [Reader Contract Usage](#reader-contract-usage)
4. [Event Monitoring](#event-monitoring)
5. [Callback System](#callback-system)
6. [Gas Estimation](#gas-estimation)
7. [Transaction Examples](#transaction-examples)
8. [Error Handling](#error-handling)
9. [Testing & Development](#testing--development)

---

## Quick Start

### Contract Addresses

**Arbitrum Mainnet:**
```javascript
const contracts = {
    ExchangeRouter: "0x7C68C7866A64FA2160F78EEaE12217FFbf871fa8",
    Reader: "0xf60becbba223EEA9495Da3f606753867eC10d139",
    DataStore: "0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8",
    // See docs/arbitrum-deployments.md for full list
};
```

### Basic Setup

```javascript
import { ethers } from "ethers";

// Connect to provider
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const signer = provider.getSigner();

// Initialize contracts
const exchangeRouter = new ethers.Contract(
    EXCHANGE_ROUTER_ADDRESS,
    EXCHANGE_ROUTER_ABI,
    signer
);

const reader = new ethers.Contract(
    READER_ADDRESS,
    READER_ABI,
    provider
);
```

---

## ExchangeRouter Interface

Main user-facing contract for all operations.

**Contract**: `contracts/exchange/ExchangeRouter.sol:192`

### Creating Orders

#### Market Order (Long Position)

```javascript
// contracts/exchange/ExchangeRouter.sol:192

async function openLongPosition(
    market,        // Market address (e.g., ETH/USD market)
    collateralToken, // WETH or USDC address
    sizeInUsd,      // Position size in USD (e.g., 10000 * 1e30 for $10k)
    collateralAmount // Collateral amount in token decimals
) {
    // 1. Approve collateral token
    const collateralContract = new ethers.Contract(
        collateralToken,
        ERC20_ABI,
        signer
    );
    await collateralContract.approve(
        EXCHANGE_ROUTER_ADDRESS,
        collateralAmount
    );

    // 2. Estimate execution fee
    const executionFee = await estimateExecutionFee("order");

    // 3. Create order params
    const orderParams = {
        addresses: {
            receiver: userAddress,
            callbackContract: ethers.constants.AddressZero,
            uiFeeReceiver: ethers.constants.AddressZero,
            market: market,
            initialCollateralToken: collateralToken,
            swapPath: [] // No swaps needed
        },
        numbers: {
            sizeDeltaUsd: sizeInUsd,  // Position size
            initialCollateralDeltaAmount: collateralAmount,
            triggerPrice: 0, // 0 for market orders
            acceptablePrice: MaxUint256, // Max acceptable price (slippage)
            executionFee: executionFee,
            callbackGasLimit: 0,
            minOutputAmount: 0
        },
        orderType: 2, // MarketIncrease = 2
        decreasePositionSwapType: 0,
        isLong: true,
        shouldUnwrapNativeToken: false,
        referralCode: ethers.constants.HashZero
    };

    // 4. Send transaction
    const tx = await exchangeRouter.createOrder(
        orderParams,
        { value: executionFee }
    );

    const receipt = await tx.wait();
    console.log("Order created:", receipt.transactionHash);

    // Extract order key from events
    const orderCreatedEvent = receipt.events.find(
        e => e.event === "OrderCreated"
    );
    const orderKey = orderCreatedEvent.args.key;
    return orderKey;
}
```

**Code Reference**: `contracts/exchange/ExchangeRouter.sol:192` - `createOrder()`

#### Market Order (Short Position)

```javascript
async function openShortPosition(
    market,
    collateralToken, // Usually USDC for shorts
    sizeInUsd,
    collateralAmount
) {
    // Similar to long, but set isLong: false
    const orderParams = {
        // ... same as long
        isLong: false, // SHORT position
        // ...
    };

    return await exchangeRouter.createOrder(
        orderParams,
        { value: executionFee }
    );
}
```

#### Limit Order

```javascript
async function createLimitOrder(
    market,
    collateralToken,
    sizeInUsd,
    collateralAmount,
    triggerPrice,  // Price at which order triggers
    isLong
) {
    const orderParams = {
        addresses: { /* ... */ },
        numbers: {
            sizeDeltaUsd: sizeInUsd,
            initialCollateralDeltaAmount: collateralAmount,
            triggerPrice: triggerPrice,  // Trigger price
            acceptablePrice: isLong ? MaxUint256 : 0,
            executionFee: executionFee,
            callbackGasLimit: 0,
            minOutputAmount: 0
        },
        orderType: 3, // LimitIncrease = 3
        // ...
    };

    return await exchangeRouter.createOrder(
        orderParams,
        { value: executionFee }
    );
}
```

#### Stop-Loss Order

```javascript
async function createStopLoss(
    market,
    collateralToken,
    positionSizeToClose, // USD amount to close
    triggerPrice,  // Stop-loss trigger price
    isLong
) {
    const orderParams = {
        addresses: { /* ... */ },
        numbers: {
            sizeDeltaUsd: positionSizeToClose,
            initialCollateralDeltaAmount: 0, // Closing, not adding
            triggerPrice: triggerPrice,
            acceptablePrice: isLong ? 0 : MaxUint256,
            executionFee: executionFee,
            callbackGasLimit: 0,
            minOutputAmount: 0
        },
        orderType: 6, // StopLossDecrease = 6
        decreasePositionSwapType: 0, // No swap
        isLong: isLong,
        // ...
    };

    return await exchangeRouter.createOrder(
        orderParams,
        { value: executionFee }
    );
}
```

**Order Types**:
```javascript
const OrderType = {
    MarketSwap: 0,
    LimitSwap: 1,
    MarketIncrease: 2,
    LimitIncrease: 3,
    MarketDecrease: 4,
    LimitDecrease: 5,
    StopLossDecrease: 6,
    Liquidation: 7
};
```

### Creating Deposits (Provide Liquidity)

```javascript
// contracts/exchange/ExchangeRouter.sol:271

async function provideLiquidity(
    market,
    longTokenAmount,  // Amount of long token (e.g., WETH)
    shortTokenAmount, // Amount of short token (e.g., USDC)
    minGmTokens       // Minimum GM tokens to receive (slippage)
) {
    // 1. Approve tokens
    if (longTokenAmount > 0) {
        const longToken = new ethers.Contract(longTokenAddress, ERC20_ABI, signer);
        await longToken.approve(EXCHANGE_ROUTER_ADDRESS, longTokenAmount);
    }

    if (shortTokenAmount > 0) {
        const shortToken = new ethers.Contract(shortTokenAddress, ERC20_ABI, signer);
        await shortToken.approve(EXCHANGE_ROUTER_ADDRESS, shortTokenAmount);
    }

    // 2. Estimate execution fee
    const executionFee = await estimateExecutionFee("deposit");

    // 3. Create deposit params
    const depositParams = {
        receiver: userAddress,
        callbackContract: ethers.constants.AddressZero,
        uiFeeReceiver: ethers.constants.AddressZero,
        market: market,
        initialLongToken: longTokenAddress,
        initialShortToken: shortTokenAddress,
        longTokenSwapPath: [],
        shortTokenSwapPath: [],
        minMarketTokens: minGmTokens,
        shouldUnwrapNativeToken: false,
        executionFee: executionFee,
        callbackGasLimit: 0
    };

    // 4. Send transaction with token amounts
    const tx = await exchangeRouter.createDeposit(
        depositParams,
        { value: executionFee }
    );

    const receipt = await tx.wait();
    const depositKey = extractEventArg(receipt, "DepositCreated", "key");
    return depositKey;
}
```

**Code Reference**: `contracts/exchange/ExchangeRouter.sol:271` - `createDeposit()`

### Creating Withdrawals (Remove Liquidity)

```javascript
// contracts/exchange/ExchangeRouter.sol:309

async function removeLiquidity(
    market,
    gmTokenAmount,       // GM tokens to burn
    minLongTokenOut,     // Min long token to receive
    minShortTokenOut     // Min short token to receive
) {
    // 1. Approve GM tokens
    const marketToken = new ethers.Contract(market, ERC20_ABI, signer);
    await marketToken.approve(EXCHANGE_ROUTER_ADDRESS, gmTokenAmount);

    // 2. Estimate execution fee
    const executionFee = await estimateExecutionFee("withdrawal");

    // 3. Create withdrawal params
    const withdrawalParams = {
        receiver: userAddress,
        callbackContract: ethers.constants.AddressZero,
        uiFeeReceiver: ethers.constants.AddressZero,
        market: market,
        longTokenSwapPath: [],
        shortTokenSwapPath: [],
        minLongTokenAmount: minLongTokenOut,
        minShortTokenAmount: minShortTokenOut,
        shouldUnwrapNativeToken: false,
        executionFee: executionFee,
        callbackGasLimit: 0
    };

    // 4. Send transaction
    const tx = await exchangeRouter.createWithdrawal(
        withdrawalParams,
        { value: executionFee }
    );

    const receipt = await tx.wait();
    const withdrawalKey = extractEventArg(receipt, "WithdrawalCreated", "key");
    return withdrawalKey;
}
```

**Code Reference**: `contracts/exchange/ExchangeRouter.sol:309` - `createWithdrawal()`

### Canceling Orders

```javascript
// contracts/exchange/ExchangeRouter.sol:220

async function cancelOrder(orderKey) {
    const tx = await exchangeRouter.cancelOrder(orderKey);
    await tx.wait();
    console.log("Order cancelled");
}
```

### Claiming Funding Fees

```javascript
// contracts/exchange/ExchangeRouter.sol:428

async function claimFundingFees(markets, tokens) {
    // markets: array of market addresses
    // tokens: array of token addresses to claim

    const tx = await exchangeRouter.claimFundingFees(
        markets,
        tokens,
        userAddress // receiver
    );

    const receipt = await tx.wait();
    console.log("Funding fees claimed");
}
```

---

## Reader Contract Usage

Query contract for reading protocol state without gas costs.

**Contract**: `contracts/reader/Reader.sol`

### Get Market Info

```javascript
async function getMarketInfo(marketAddress) {
    const market = await reader.getMarket(
        DATA_STORE_ADDRESS,
        marketAddress
    );

    return {
        marketToken: market.addresses.marketToken,
        indexToken: market.addresses.indexToken,
        longToken: market.addresses.longToken,
        shortToken: market.addresses.shortToken,
        // ... more fields
    };
}
```

### Get Position Info

```javascript
async function getPosition(account, market, collateralToken, isLong) {
    // Calculate position key
    const positionKey = ethers.utils.solidityKeccak256(
        ["address", "address", "address", "bool"],
        [account, market, collateralToken, isLong]
    );

    const position = await reader.getPosition(
        DATA_STORE_ADDRESS,
        positionKey
    );

    if (position.addresses.account === ethers.constants.AddressZero) {
        return null; // Position doesn't exist
    }

    return {
        account: position.addresses.account,
        market: position.addresses.market,
        collateralToken: position.addresses.collateralToken,
        sizeInUsd: position.numbers.sizeInUsd,
        sizeInTokens: position.numbers.sizeInTokens,
        collateralAmount: position.numbers.collateralAmount,
        isLong: position.flags.isLong
    };
}
```

### Get Account Positions

```javascript
async function getAccountPositions(account, start = 0, end = 10) {
    const positions = await reader.getAccountPositions(
        DATA_STORE_ADDRESS,
        account,
        start,
        end
    );

    return positions.map(p => ({
        key: p.key,
        market: p.addresses.market,
        sizeInUsd: p.numbers.sizeInUsd,
        collateralAmount: p.numbers.collateralAmount,
        isLong: p.flags.isLong
        // ... more fields
    }));
}
```

### Get Account Orders

```javascript
async function getAccountOrders(account, start = 0, end = 10) {
    const orders = await reader.getAccountOrders(
        DATA_STORE_ADDRESS,
        account,
        start,
        end
    );

    return orders.map(o => ({
        key: o.key,
        orderType: o.numbers.orderType,
        market: o.addresses.market,
        sizeDeltaUsd: o.numbers.sizeDeltaUsd,
        triggerPrice: o.numbers.triggerPrice,
        isLong: o.flags.isLong
    }));
}
```

### Get Market Token Price

```javascript
async function getMarketTokenPrice(market, indexTokenPrice) {
    const prices = {
        indexTokenPrice: {
            min: indexTokenPrice,
            max: indexTokenPrice
        },
        longTokenPrice: {
            min: longTokenPrice,
            max: longTokenPrice
        },
        shortTokenPrice: {
            min: shortTokenPrice,
            max: shortTokenPrice
        }
    };

    const [poolValue, supply] = await Promise.all([
        reader.getPoolValue(DATA_STORE_ADDRESS, market, prices),
        marketTokenContract.totalSupply()
    ]);

    const gmPrice = poolValue.mul(ethers.constants.WeiPerEther).div(supply);
    return gmPrice;
}
```

### Get Net PnL

```javascript
async function getNetPnL(market, prices, isLong) {
    const pnl = await reader.getNetPnl(
        DATA_STORE_ADDRESS,
        market,
        prices,
        isLong
    );

    return pnl; // Returns int256 (positive = traders profitable)
}
```

---

## Event Monitoring

Monitor protocol events for state changes.

### Key Events

**OrderCreated**:
```javascript
interface OrderCreated {
    key: bytes32;        // Order key
    order: Order.Props;  // Order details
}
```

**OrderExecuted**:
```javascript
interface OrderExecuted {
    key: bytes32;
    order: Order.Props;
}
```

**OrderCancelled**:
```javascript
interface OrderCancelled {
    key: bytes32;
    reason: string;
}
```

**PositionIncrease**:
```javascript
interface PositionIncrease {
    account: address;
    market: address;
    collateralToken: address;
    sizeInUsd: uint256;
    sizeInTokens: uint256;
    collateralAmount: uint256;
    isLong: bool;
}
```

**PositionDecrease**:
```javascript
interface PositionDecrease {
    account: address;
    market: address;
    collateralToken: address;
    sizeInUsd: uint256;
    sizeInTokens: uint256;
    collateralAmount: uint256;
    isLong: bool;
    pnlUsd: int256;
}
```

### Event Listener Example

```javascript
// Listen for order events
const orderHandler = new ethers.Contract(
    ORDER_HANDLER_ADDRESS,
    ORDER_HANDLER_ABI,
    provider
);

// Order created
orderHandler.on("OrderCreated", (key, order, event) => {
    console.log("Order created:", {
        key: key,
        account: order.addresses.account,
        market: order.addresses.market,
        sizeDeltaUsd: order.numbers.sizeDeltaUsd.toString(),
        orderType: order.numbers.orderType
    });
});

// Order executed
orderHandler.on("OrderExecuted", (key, order, event) => {
    console.log("Order executed:", key);
});

// Order cancelled
orderHandler.on("OrderCancelled", (key, reason, event) => {
    console.log("Order cancelled:", key, reason);
});
```

### Position Event Listeners

```javascript
// Position increase
orderHandler.on("PositionIncrease", (
    account,
    market,
    collateralToken,
    sizeInUsd,
    sizeInTokens,
    collateralAmount,
    isLong,
    event
) => {
    console.log("Position increased:", {
        account,
        market,
        sizeInUsd: sizeInUsd.toString(),
        isLong
    });
});

// Position decrease
orderHandler.on("PositionDecrease", (
    account,
    market,
    collateralToken,
    sizeInUsd,
    sizeInTokens,
    collateralAmount,
    isLong,
    pnlUsd,
    event
) => {
    console.log("Position decreased:", {
        account,
        market,
        sizeInUsd: sizeInUsd.toString(),
        pnl: pnlUsd.toString(),
        isLong
    });
});
```

### Filtering Events

```javascript
// Filter events by account
const filter = orderHandler.filters.OrderCreated(null, null);
const events = await orderHandler.queryFilter(filter, fromBlock, toBlock);

// Process events
for (const event of events) {
    if (event.args.order.addresses.account === userAddress) {
        console.log("User order:", event.args.key);
    }
}
```

---

## Callback System

Implement custom callbacks for order/deposit/withdrawal execution.

**Interface**: `contracts/callback/IOrderCallbackReceiver.sol`

### Callback Contract Example

```solidity
// contracts/callback/IOrderCallbackReceiver.sol

contract MyCallbackContract is IOrderCallbackReceiver {
    function afterOrderExecution(
        bytes32 key,
        Order.Props memory order,
        EventUtils.EventLogData memory eventData
    ) external override {
        // Custom logic after order execution
        // e.g., update internal state, emit events, trigger other actions

        // Access order details
        address account = order.addresses.account;
        address market = order.addresses.market;
        uint256 sizeDeltaUsd = order.numbers.sizeDeltaUsd;

        // Your logic here
    }

    function afterOrderCancellation(
        bytes32 key,
        Order.Props memory order,
        EventUtils.EventLogData memory eventData
    ) external override {
        // Handle order cancellation
    }

    function afterOrderFrozen(
        bytes32 key,
        Order.Props memory order,
        EventUtils.EventLogData memory eventData
    ) external override {
        // Handle order frozen
    }
}
```

### Using Callbacks

```javascript
async function createOrderWithCallback(/* params */) {
    const orderParams = {
        addresses: {
            receiver: userAddress,
            callbackContract: MY_CALLBACK_CONTRACT_ADDRESS, // Your callback
            // ...
        },
        numbers: {
            // ...
            callbackGasLimit: 200000, // Gas for callback
        },
        // ...
    };

    return await exchangeRouter.createOrder(orderParams, { value: executionFee });
}
```

**Important Notes**:
- Callback contract must implement `IOrderCallbackReceiver` interface
- Set appropriate `callbackGasLimit` (callback reverts if gas exceeded)
- Callbacks executed after main operation succeeds
- Callback failures don't revert main transaction

---

## Gas Estimation

Estimate execution fees for operations.

### Execution Fee Calculation

```javascript
// contracts/gas/GasUtils.sol

async function estimateExecutionFee(operationType) {
    // Get current gas price
    const gasPrice = await provider.getGasPrice();

    // Estimated gas per operation type
    const gasEstimates = {
        order: 1500000,      // Order execution
        deposit: 1200000,    // Deposit execution
        withdrawal: 1200000, // Withdrawal execution
        shift: 1000000       // Shift execution
    };

    const estimatedGas = gasEstimates[operationType] || 1500000;

    // Add buffer (20%)
    const executionFee = gasPrice.mul(estimatedGas).mul(120).div(100);

    return executionFee;
}
```

### Query Estimated Gas

```javascript
// Use Reader contract for more accurate estimation
async function getEstimatedGas(
    dataStore,
    orderKey,
    oraclePrices
) {
    const gasEstimate = await reader.getExecutionGas(
        dataStore,
        orderKey,
        oraclePrices
    );

    return gasEstimate;
}
```

---

## Transaction Examples

### Complete Position Opening Flow

```javascript
async function completePositionOpeningExample() {
    const market = ETH_USD_MARKET_ADDRESS;
    const collateralToken = WETH_ADDRESS;
    const collateralAmount = ethers.utils.parseEther("1"); // 1 WETH
    const sizeInUsd = ethers.utils.parseUnits("10000", 30); // $10,000 position
    const isLong = true;

    console.log("1. Approve WETH...");
    const weth = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, signer);
    await (await weth.approve(EXCHANGE_ROUTER_ADDRESS, collateralAmount)).wait();

    console.log("2. Estimate execution fee...");
    const executionFee = await estimateExecutionFee("order");

    console.log("3. Create order...");
    const orderParams = {
        addresses: {
            receiver: userAddress,
            callbackContract: ethers.constants.AddressZero,
            uiFeeReceiver: ethers.constants.AddressZero,
            market: market,
            initialCollateralToken: collateralToken,
            swapPath: []
        },
        numbers: {
            sizeDeltaUsd: sizeInUsd,
            initialCollateralDeltaAmount: collateralAmount,
            triggerPrice: 0,
            acceptablePrice: ethers.constants.MaxUint256,
            executionFee: executionFee,
            callbackGasLimit: 0,
            minOutputAmount: 0
        },
        orderType: 2, // MarketIncrease
        decreasePositionSwapType: 0,
        isLong: isLong,
        shouldUnwrapNativeToken: false,
        referralCode: ethers.constants.HashZero
    };

    const tx = await exchangeRouter.createOrder(
        orderParams,
        { value: executionFee }
    );

    console.log("4. Wait for transaction...");
    const receipt = await tx.wait();
    const orderKey = extractEventArg(receipt, "OrderCreated", "key");
    console.log("Order created:", orderKey);

    console.log("5. Wait for keeper execution...");
    // Monitor OrderExecuted event or poll position
    await waitForOrderExecution(orderKey);

    console.log("6. Verify position...");
    const position = await getPosition(userAddress, market, collateralToken, isLong);
    console.log("Position opened:", position);
}
```

### Complete Liquidity Provision Flow

```javascript
async function completeLiquidityProvisionExample() {
    const market = ETH_USD_MARKET_ADDRESS;
    const wethAmount = ethers.utils.parseEther("1"); // 1 WETH
    const usdcAmount = ethers.utils.parseUnits("3000", 6); // 3000 USDC

    console.log("1. Approve tokens...");
    const weth = new ethers.Contract(WETH_ADDRESS, ERC20_ABI, signer);
    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);

    await Promise.all([
        (await weth.approve(EXCHANGE_ROUTER_ADDRESS, wethAmount)).wait(),
        (await usdc.approve(EXCHANGE_ROUTER_ADDRESS, usdcAmount)).wait()
    ]);

    console.log("2. Get expected GM tokens...");
    // Query expected GM tokens out
    const expectedGm = await calculateExpectedGmTokens(
        market,
        wethAmount,
        usdcAmount
    );
    const minGm = expectedGm.mul(95).div(100); // 5% slippage

    console.log("3. Create deposit...");
    const executionFee = await estimateExecutionFee("deposit");

    const depositParams = {
        receiver: userAddress,
        callbackContract: ethers.constants.AddressZero,
        uiFeeReceiver: ethers.constants.AddressZero,
        market: market,
        initialLongToken: WETH_ADDRESS,
        initialShortToken: USDC_ADDRESS,
        longTokenSwapPath: [],
        shortTokenSwapPath: [],
        minMarketTokens: minGm,
        shouldUnwrapNativeToken: false,
        executionFee: executionFee,
        callbackGasLimit: 0
    };

    const tx = await exchangeRouter.createDeposit(
        depositParams,
        { value: executionFee }
    );

    console.log("4. Wait for execution...");
    const receipt = await tx.wait();
    const depositKey = extractEventArg(receipt, "DepositCreated", "key");

    await waitForDepositExecution(depositKey);

    console.log("5. Check GM balance...");
    const gmToken = new ethers.Contract(market, ERC20_ABI, provider);
    const balance = await gmToken.balanceOf(userAddress);
    console.log("GM tokens received:", ethers.utils.formatUnits(balance, 18));
}
```

---

## Error Handling

### Common Errors

**Insufficient Execution Fee**:
```javascript
try {
    await exchangeRouter.createOrder(params, { value: tooLowFee });
} catch (error) {
    if (error.message.includes("InsufficientExecutionFee")) {
        console.log("Increase execution fee");
    }
}
```

**Price Out of Range**:
```javascript
// Order will be cancelled if price moves beyond acceptablePrice
// Set appropriate slippage tolerance
const slippageBps = 50; // 0.5%
const acceptablePrice = currentPrice.mul(10000 + slippageBps).div(10000);
```

**Insufficient Collateral**:
```javascript
// Ensure position has enough collateral after fees
const minCollateralUsd = ethers.utils.parseUnits("5", 30); // $5 minimum
```

### Error Recovery

```javascript
async function robustOrderCreation(params) {
    let retries = 3;
    while (retries > 0) {
        try {
            const tx = await exchangeRouter.createOrder(
                params,
                { value: executionFee }
            );
            return await tx.wait();
        } catch (error) {
            console.error("Order creation failed:", error.message);
            retries--;

            if (error.message.includes("InsufficientExecutionFee")) {
                // Increase execution fee
                params.numbers.executionFee = params.numbers.executionFee.mul(120).div(100);
            } else if (retries === 0) {
                throw error;
            }

            await new Promise(r => setTimeout(r, 2000)); // Wait 2s
        }
    }
}
```

---

## Testing & Development

### Local Testing Setup

```bash
# Clone repository
git clone https://github.com/gmx-io/gmx-synthetics
cd gmx-synthetics

# Install dependencies
npm install

# Compile contracts
npx hardhat compile

# Run tests
npx hardhat test

# Run specific test
npx hardhat test test/exchange/Order.ts
```

### Testnet Deployment

**Arbitrum Sepolia**:
```javascript
const testnetContracts = {
    ExchangeRouter: "0x...", // See docs/arbitrumSepolia-deployments.md
    Reader: "0x...",
    DataStore: "0x...",
    // ...
};

// Use testnet RPC
const provider = new ethers.providers.JsonRpcProvider(
    "https://sepolia-rollup.arbitrum.io/rpc"
);
```

### Mock Data for Testing

```javascript
// Use mock oracle for testing
const mockOracle = await deployMockOracle();

// Set test prices
await mockOracle.setPrice(WETH_ADDRESS, ethers.utils.parseUnits("3000", 30));
await mockOracle.setPrice(USDC_ADDRESS, ethers.utils.parseUnits("1", 30));
```

---

## Helper Functions

### Extract Event Arguments

```javascript
function extractEventArg(receipt, eventName, argName) {
    const event = receipt.events.find(e => e.event === eventName);
    return event ? event.args[argName] : null;
}
```

### Wait for Execution

```javascript
async function waitForOrderExecution(orderKey, timeout = 60000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        const order = await reader.getOrder(DATA_STORE_ADDRESS, orderKey);

        if (order.addresses.account === ethers.constants.AddressZero) {
            return; // Order executed (removed from storage)
        }

        await new Promise(r => setTimeout(r, 2000)); // Poll every 2s
    }

    throw new Error("Order execution timeout");
}
```

---

## Related Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture
- **[TRADING_FLOWS.md](./TRADING_FLOWS.md)** - Trading operation flows
- **[LIQUIDITY_FLOWS.md](./LIQUIDITY_FLOWS.md)** - Liquidity operation flows
- **[COMPONENTS.md](./COMPONENTS.md)** - Contract component reference

---

*Last Updated: 2025-12-01*
*For the latest contract addresses, see the network-specific deployment documentation.*
