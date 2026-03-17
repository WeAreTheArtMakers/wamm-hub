# WAMM Crypto Split Contract Module

This module supports automatic platform/artist split transfer in one on-chain payment.

Important:

- A smart contract does **not** have a private key.
- Only wallet addresses (EOA) have private keys.
- Never share private keys.

## 1) Deploy contract

Contract file:

- `contracts/WammSplitPayment.sol`

Remix quick deploy:

1. Open [https://remix.ethereum.org](https://remix.ethereum.org)
2. Create a new file `WammSplitPayment.sol` and paste contract source.
3. Solidity compiler: select `0.8.20` (or compatible `0.8.x`) and compile.
4. Deploy & Run:
   - Environment: `Injected Provider - MetaMask`
   - Constructor arg 1 (`platformTreasury`): platform wallet
   - Constructor arg 2 (`platformFeeBps`): `300` for 3%
5. Click **Deploy** and confirm in wallet.
6. Copy deployed contract address to `CRYPTO_SPLIT_CONTRACT_ADDRESS`.

Constructor args:

- `platformTreasury`: `0xc66aC8bcF729a6398bc879B7454B13983220601e`
- `platformFeeBps`: `300` (3%)

## 2) Set backend env vars

- `CRYPTO_VERIFY_ONCHAIN=true`
- `CRYPTO_VERIFY_STRICT=true`
- `CRYPTO_RPC_URL=<public rpc>`
- `CRYPTO_SPLIT_CONTRACT_ADDRESS=<deployed contract address>`
- `CRYPTO_CHAIN_ID=<hex chain id like 0x1 or decimal string accepted by rpc response>`

If `CRYPTO_SPLIT_CONTRACT_ADDRESS` is empty:

- Platform fee is `0%`
- Crypto payment goes `100%` to artist wallet
- IBAN flow is also artist-direct (no platform fee)

## 3) Runtime behavior

- Client calls `GET /api/orders/release/:releaseId/crypto-quote`
- Buyer pays through split contract
- Buyer submits purchase with `txHash` and connected wallet
- Backend verifies tx with `eth_getTransactionByHash` and `eth_getTransactionReceipt`
- If verified: order becomes `PAID`, download unlocks instantly
- If not verified and strict mode on: purchase rejected

Remix test call:

1. In deployed contract, open `payForRelease`.
2. Enter:
   - `artist`: artist wallet address
   - `releaseRef`: any `bytes32` value (example: `0x72656c656173652d746573740000000000000000000000000000000000000000`)
3. Set `Value` (ETH/MATIC/BNB) greater than `0`.
4. Send transaction.
5. Confirm:
   - Artist wallet receives ~97%
   - Platform wallet receives ~3%
   - `PaymentSplit` event emitted.

## 4) Non-strict mode

If `CRYPTO_VERIFY_ONCHAIN=false`, tx hash becomes optional and system keeps instant unlock mode for demo flow.
