# Mantle Sepolia Configuration Checklist

This document tracks the remaining configuration files that need to be created for Mantle Sepolia deployment.

## Completed ✅

- [x] **hardhat.config.ts** - Added Mantle and Mantle Sepolia network configurations
- [x] **config/chains.ts** - Added "mantle" to EXISTING_MAINNET_DEPLOYMENTS
- [x] **.env.mantle.example** - Created environment template

## Remaining Configuration Files 📋

### 1. Token Configuration (HIGH PRIORITY) 🔴
**File**: `config/tokens.ts`

**Status**: ⏳ Needs token addresses from Mantle Sepolia

**Actions Required**:
1. Research Mantle Sepolia token addresses:
   - wMNT (wrapped native MNT)
   - USDC or USDC.e (bridged)
   - USDT
   - WETH
   - WBTC

2. Find Chainlink price feeds on Mantle Sepolia:
   - Check https://docs.chain.link/data-feeds/price-feeds/addresses
   - Look for Mantle testnet feeds

3. Add `mantleSepolia` object to tokens.ts with structure:
```typescript
mantleSepolia: {
  wMNT: {
    address: "0x...",  // TO BE RESEARCHED
    decimals: 18,
    wrappedNative: true,
    transferGasLimit: 200 * 1000,
    priceFeed: {
      address: "0x...",  // MNT/USD Chainlink feed
      decimals: 8,
      heartbeatDuration: (24 + 1) * 60 * 60,
    },
  },
  USDC: {
    address: "0x...",  // TO BE RESEARCHED
    decimals: 6,
    // ... similar structure
  },
  // ... more tokens
}
```

**Notes**:
- If testnet tokens don't exist, may need to deploy test ERC20 tokens
- Can start with just wMNT and USDC for minimal setup
- Price feeds might be limited on testnet - may need Edge oracle fallback

---

### 2. Market Configuration (HIGH PRIORITY) 🔴
**File**: `config/markets.ts`

**Status**: ⏳ Waiting on token configuration

**Actions Required**:
1. Add `mantleSepolia` object to markets.ts
2. Define initial markets:
   - ETH/USD (WETH/USDC)
   - BTC/USD (WBTC/USDC) - optional
   - USDC/USDT swap market - optional

3. Use conservative testnet parameters:
   - Small pool limits (e.g., 100 WETH, $300k USDC)
   - Conservative open interest limits (e.g., $1M)
   - Standard fee parameters from other networks

**Template**:
```typescript
mantleSepolia: {
  "ETH/USD": {
    tokens: {
      indexToken: "WETH",
      longToken: "WETH",
      shortToken: "USDC",
    },
    virtualTokenIdForIndexToken: hashString("PERP:ETH/USD"),
    virtualMarketId: hashString("SPOT:ETH/USD"),
    maxLongTokenPoolAmount: expandDecimals(100, 18), // 100 WETH
    maxShortTokenPoolAmount: expandDecimals(300_000, 6), // $300k USDC
    // ... copy parameters from arbitrumSepolia
  },
}
```

---

### 3. Oracle Configuration (MEDIUM PRIORITY) 🟡
**File**: `config/oracle.ts`

**Status**: Ready to create (can use deployer address for testnet)

**Actions Required**:
1. Add `mantleSepolia` object to oracle.ts
2. For testnet, use deployer address as oracle signer
3. Set conservative price age limits

**Template**:
```typescript
mantleSepolia: {
  signers: [
    process.env.DEPLOYER_ADDRESS || "0x...", // Use deployer for testnet
  ],
  minOracleSigners: 1, // Single signer OK for testnet
  maxOraclePriceAge: 5 * 60, // 5 minutes
  maxAtomicOraclePriceAge: 30, // 30 seconds
  maxOracleTimestampRange: 60,
  maxRefPriceDeviationFactor: decimalToFloat(5, 1), // 50%
  minOracleBlockConfirmations: 255,
  // Chainlink Data Streams might not be available on testnet
  // dataStreamFeedVerifier: "0x...",
  // chainlinkPaymentToken: "0x...",
},
```

---

### 4. Role Configuration (MEDIUM PRIORITY) 🟡
**Files**:
- `config/roles.ts` (add import)
- `config/roleConfigs/mantleSepolia.ts` (create new file)

**Status**: Ready to create

**Actions Required**:
1. Create `config/roleConfigs/mantleSepolia.ts`
2. For testnet, use deployer address for all roles
3. Import and add to config/roles.ts

**Template for `config/roleConfigs/mantleSepolia.ts`**:
```typescript
// Testnet role configuration - single address for simplicity
const DEPLOYER = process.env.DEPLOYER_ADDRESS || "0x...";

// Role hashes (copy from other role configs)
const CONTROLLER = "0x...";
const ORDER_KEEPER = "0x...";
const ADL_KEEPER = "0x...";
const LIQUIDATION_KEEPER = "0x...";
const CONFIG_KEEPER = "0x...";
const TIMELOCK_ADMIN = "0x...";
const ROLE_ADMIN = "0x...";

export default {
  [CONTROLLER]: { [DEPLOYER]: true },
  [TIMELOCK_ADMIN]: { [DEPLOYER]: true },
  [ROLE_ADMIN]: { [DEPLOYER]: true },
  [ORDER_KEEPER]: { [DEPLOYER]: true },
  [LIQUIDATION_KEEPER]: { [DEPLOYER]: true },
  [ADL_KEEPER]: { [DEPLOYER]: true },
  [CONFIG_KEEPER]: { [DEPLOYER]: true },
  // ROUTER_PLUGIN added automatically during deployment
};
```

**Update `config/roles.ts`**:
```typescript
import * as mantleSepolia from "./roleConfigs/mantleSepolia";

export default {
  // ... existing
  mantleSepolia: mantleSepolia.default,
};
```

---

### 5. General Configuration (LOW PRIORITY) 🟢
**File**: `config/general.ts`

**Status**: Optional - defaults likely work

**Actions Required**:
- Check if Mantle Sepolia needs specific gas limit overrides
- Typically no changes needed for testnet

---

### 6. LayerZero Configuration (LOW PRIORITY) 🟢
**File**: `config/layerZero.ts`

**Status**: Optional - only if testing cross-chain

**Actions Required**:
- Add Mantle Sepolia LayerZero endpoint if available
- Can skip for initial deployment

---

## Deployment Prerequisites

Before deploying, ensure:

### Environment Setup
- [ ] Copy `.env.mantle.example` to `.env`
- [ ] Add deployer private key to `.env`
- [ ] Add Mantle Explorer API key to `.env`
- [ ] Fund deployer account with testnet MNT (5-10 MNT recommended)

### Token Research
- [ ] Find wMNT address on Mantle Sepolia
- [ ] Find USDC address on Mantle Sepolia (or deploy test USDC)
- [ ] Find WETH address on Mantle Sepolia (or deploy test WETH)
- [ ] Find Chainlink price feeds for MNT, USDC, ETH on testnet
- [ ] Alternative: Prepare to use deployer as mock oracle

### Configuration Files
- [ ] Complete `config/tokens.ts` (mantleSepolia section)
- [ ] Complete `config/markets.ts` (mantleSepolia section)
- [ ] Complete `config/oracle.ts` (mantleSepolia section)
- [ ] Create `config/roleConfigs/mantleSepolia.ts`
- [ ] Update `config/roles.ts` with import

---

## Testing Plan

After configuration is complete:

1. **Verify Configuration**
   ```bash
   # Check network connectivity
   npx hardhat run scripts/checkNetwork.ts --network mantleSepolia

   # Verify deployer balance
   npx hardhat run scripts/checkBalance.ts --network mantleSepolia
   ```

2. **Test Deployment**
   ```bash
   # Deploy to testnet
   SKIP_AUTO_HANDLER_REDEPLOYMENT=true npx hardhat deploy --network mantleSepolia
   ```

3. **Post-Deployment Verification**
   - Verify contracts on explorer
   - Test basic operations (create order, deposit)
   - Verify role assignments
   - Test oracle price submissions

---

## Next Steps

1. **IMMEDIATE**: Research Mantle Sepolia token addresses
   - Check Mantle Discord/docs for testnet token addresses
   - Check Mantle Sepolia explorer for existing tokens
   - Consider deploying test tokens if needed

2. **THEN**: Complete configuration files in order:
   - tokens.ts (requires token addresses)
   - markets.ts (requires tokens.ts)
   - oracle.ts (straightforward)
   - roleConfigs/mantleSepolia.ts (straightforward)

3. **FINALLY**: Deploy and test
   - Deploy to Mantle Sepolia testnet
   - Verify and test
   - Document any issues
   - Prepare for mainnet deployment

---

## Useful Resources

- **Mantle Docs**: https://docs.mantle.xyz
- **Mantle Sepolia Explorer**: https://explorer.sepolia.mantle.xyz
- **Mantle Discord**: Get testnet tokens and addresses
- **Chainlink Feeds**: https://docs.chain.link/data-feeds/price-feeds/addresses
- **GMX Deployment Guide**: `docs-new/MANTLE_DEPLOYMENT_GUIDE.md`

---

## Questions / Blockers

- [ ] Where to get Mantle Sepolia testnet token addresses?
- [ ] Are Chainlink price feeds available on Mantle Sepolia?
- [ ] Do we need to deploy test tokens?
- [ ] Should we use Edge oracle instead of Chainlink for testnet?

---

*Last Updated: 2025-12-03*
*Branch: feature/mantle-sepolia-deployment*
