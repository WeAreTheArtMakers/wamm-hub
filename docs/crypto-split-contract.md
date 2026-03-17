# WAMM Crypto Split Contract Module

This module supports automatic platform/artist split transfer in one on-chain payment.

## 1) Deploy contract

Contract file:

- `contracts/WammSplitPayment.sol`

Constructor args:

- `platformTreasury`: `0xc66aC8bcF729a6398bc879B7454B13983220601e`
- `platformFeeBps`: `300` (3%)

## 2) Set backend env vars

- `CRYPTO_VERIFY_ONCHAIN=true`
- `CRYPTO_VERIFY_STRICT=true`
- `CRYPTO_RPC_URL=<public rpc>`
- `CRYPTO_SPLIT_CONTRACT_ADDRESS=<deployed contract address>`
- `CRYPTO_CHAIN_ID=<hex chain id like 0x1 or decimal string accepted by rpc response>`

## 3) Runtime behavior

- Client calls `GET /api/orders/release/:releaseId/crypto-quote`
- Buyer pays through split contract
- Buyer submits purchase with `txHash` and connected wallet
- Backend verifies tx with `eth_getTransactionByHash` and `eth_getTransactionReceipt`
- If verified: order becomes `PAID`, download unlocks instantly
- If not verified and strict mode on: purchase rejected

## 4) Non-strict mode

If `CRYPTO_VERIFY_ONCHAIN=false`, tx hash becomes optional and system keeps instant unlock mode for demo flow.

