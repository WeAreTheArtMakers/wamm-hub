const platformFeeRate = 0.03;
const platformWallet =
  process.env.PLATFORM_WALLET_ADDRESS?.trim() ||
  "0xc66aC8bcF729a6398bc879B7454B13983220601e";
const verifyOnchain =
  String(process.env.CRYPTO_VERIFY_ONCHAIN ?? "false").toLowerCase() === "true";
const verifyStrict =
  String(process.env.CRYPTO_VERIFY_STRICT ?? "false").toLowerCase() === "true";
const rpcUrl = process.env.CRYPTO_RPC_URL?.trim() || "";
const splitContractAddress =
  process.env.CRYPTO_SPLIT_CONTRACT_ADDRESS?.trim().toLowerCase() || "";
const expectedChainId = process.env.CRYPTO_CHAIN_ID?.trim() || "";

const txHashRegex = /^0x[a-fA-F0-9]{64}$/;

const normalizeAddress = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const rpc = async (method, params) => {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`RPC error ${response.status}`);
  }
  if (payload?.error) {
    throw new Error(payload.error?.message || "RPC returned error");
  }
  return payload?.result ?? null;
};

export const getCryptoModuleConfig = () => ({
  platformFeeRate,
  platformWallet,
  verifyOnchain,
  verifyStrict,
  splitContractAddress,
  expectedChainId,
});

export const buildCryptoQuote = ({ totalAmount, artistWallet, network }) => {
  const platformFee = Number((totalAmount * platformFeeRate).toFixed(2));
  const artistPayout = Number((totalAmount - platformFee).toFixed(2));
  return {
    totalAmount: Number(totalAmount),
    platformFee,
    artistPayout,
    platformWallet,
    artistWallet: artistWallet || "",
    network: network || "",
    splitContractAddress: splitContractAddress || "",
    requiresTxHash: verifyOnchain && verifyStrict,
  };
};

export const isLikelyTxHash = (txHash) => txHashRegex.test(String(txHash || ""));

export const verifyCryptoTransaction = async ({
  txHash,
  buyerWallet,
  artistWallet,
}) => {
  if (!txHash) {
    return {
      state: verifyOnchain && verifyStrict ? "missing_tx_hash" : "not_checked",
      verified: false,
      reason: "Transaction hash not provided.",
    };
  }

  if (!isLikelyTxHash(txHash)) {
    return {
      state: "invalid_tx_hash",
      verified: false,
      reason: "Transaction hash format is invalid.",
    };
  }

  if (!verifyOnchain || !rpcUrl) {
    return {
      state: "not_checked",
      verified: false,
      reason: "On-chain verification disabled.",
    };
  }

  try {
    const [tx, receipt] = await Promise.all([
      rpc("eth_getTransactionByHash", [txHash]),
      rpc("eth_getTransactionReceipt", [txHash]),
    ]);

    if (!tx || !receipt) {
      return {
        state: "pending_or_missing",
        verified: false,
        reason: "Transaction is not confirmed yet.",
      };
    }

    if (receipt.status !== "0x1") {
      return {
        state: "failed",
        verified: false,
        reason: "Transaction failed on-chain.",
      };
    }

    if (expectedChainId && tx.chainId && tx.chainId !== expectedChainId) {
      return {
        state: "wrong_chain",
        verified: false,
        reason: `Unexpected chainId (${tx.chainId}).`,
      };
    }

    const from = normalizeAddress(tx.from);
    const to = normalizeAddress(tx.to);

    if (buyerWallet && from !== normalizeAddress(buyerWallet)) {
      return {
        state: "wallet_mismatch",
        verified: false,
        reason: "Transaction sender does not match connected wallet.",
      };
    }

    if (splitContractAddress && to !== normalizeAddress(splitContractAddress)) {
      return {
        state: "wrong_receiver",
        verified: false,
        reason: "Transaction was not sent to configured split contract.",
      };
    }

    if (!splitContractAddress && artistWallet && to !== normalizeAddress(artistWallet)) {
      return {
        state: "wrong_receiver",
        verified: false,
        reason: "Transaction receiver does not match artist wallet.",
      };
    }

    return {
      state: "verified",
      verified: true,
      reason: "On-chain transaction verified.",
      from,
      to,
      valueWei: tx.value || "0x0",
      blockNumber: receipt.blockNumber || null,
    };
  } catch (error) {
    return {
      state: "rpc_error",
      verified: false,
      reason: error.message || "RPC verification failed.",
    };
  }
};

