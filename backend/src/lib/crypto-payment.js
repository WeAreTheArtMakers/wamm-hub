const BASE_PLATFORM_FEE_RATE = 0.03;
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
const splitEnabledFromEnv =
  String(process.env.CRYPTO_SPLIT_ENABLED ?? "false").toLowerCase() === "true";
const splitEnabled = splitEnabledFromEnv && Boolean(splitContractAddress);
const effectiveSplitContractAddress = splitEnabled ? splitContractAddress : "";
const platformFeeRate = splitEnabled ? BASE_PLATFORM_FEE_RATE : 0;
const BINANCE_SPOT_TICKER_PRICE_URLS = [
  "https://api.binance.com/api/v3/ticker/price",
  "https://api1.binance.com/api/v3/ticker/price",
  "https://api2.binance.com/api/v3/ticker/price",
  "https://api3.binance.com/api/v3/ticker/price",
  "https://data-api.binance.vision/api/v3/ticker/price",
];
const PRICE_CACHE_TTL_MS = 45_000;

const txHashRegex = /^0x[a-fA-F0-9]{64}$/;
const priceCache = new Map();

const normalizeAddress = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const normalizeChainIdValue = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    if (/^0x/i.test(raw)) return `0x${BigInt(raw).toString(16)}`;
    return `0x${BigInt(raw).toString(16)}`;
  } catch {
    return raw.toLowerCase();
  }
};

const getNetworkTokenSymbol = (network, chainId) => {
  const normalizedChainId = normalizeChainIdValue(chainId);
  if (normalizedChainId === "0x38" || normalizedChainId === "0x61") return "BNB";
  if (
    normalizedChainId === "0x1" ||
    normalizedChainId === "0xaa36a7" ||
    normalizedChainId === "0x5" ||
    normalizedChainId === "0x2a" ||
    normalizedChainId === "0xa4b1" ||
    normalizedChainId === "0x66eee" ||
    normalizedChainId === "0x2105" ||
    normalizedChainId === "0x14a34"
  ) {
    return "ETH";
  }
  if (normalizedChainId === "0x89" || normalizedChainId === "0x13881") return "MATIC";
  if (normalizedChainId === "0xa86a" || normalizedChainId === "0xa869") return "AVAX";

  const networkText = String(network || "").toLowerCase();
  if (networkText.includes("bnb") || networkText.includes("bsc") || networkText.includes("binance")) {
    return "BNB";
  }
  if (networkText.includes("base") || networkText.includes("eth") || networkText.includes("ethereum")) {
    return "ETH";
  }
  if (networkText.includes("polygon") || networkText.includes("matic") || networkText.includes("pol")) {
    return "MATIC";
  }
  if (networkText.includes("avax") || networkText.includes("avalanche")) {
    return "AVAX";
  }
  return "";
};

const getBinanceTickerSymbol = (tokenSymbol) => {
  if (tokenSymbol === "BNB") return "BNBUSDT";
  if (tokenSymbol === "ETH") return "ETHUSDT";
  if (tokenSymbol === "MATIC") return "MATICUSDT";
  if (tokenSymbol === "AVAX") return "AVAXUSDT";
  return "";
};

const toRoundedTokenAmount = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Number(numeric.toFixed(8));
};

const fetchUsdPriceFromBinance = async (tickerSymbol) => {
  if (!tickerSymbol) return null;
  const now = Date.now();
  const cached = priceCache.get(tickerSymbol);
  if (cached && now - cached.timestamp < PRICE_CACHE_TTL_MS) {
    return cached.price;
  }

  let lastError = null;
  for (const endpoint of BINANCE_SPOT_TICKER_PRICE_URLS) {
    try {
      const response = await fetch(`${endpoint}?symbol=${encodeURIComponent(tickerSymbol)}`, {
        headers: {
          accept: "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }

      const payload = await response.json();
      const price = Number(payload?.price);
      if (!Number.isFinite(price) || price <= 0) {
        throw new Error("invalid price payload");
      }

      priceCache.set(tickerSymbol, { price, timestamp: now });
      return price;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Binance price API failed for ${tickerSymbol}${
      lastError?.message ? `: ${lastError.message}` : ""
    }`,
  );
};

const amountToWeiBigInt = (amount) => {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0n;
  const micros = BigInt(Math.round(numeric * 1_000_000));
  return (micros * 10n ** 18n) / 1_000_000n;
};

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
  basePlatformFeeRate: BASE_PLATFORM_FEE_RATE,
  platformFeeRate,
  platformWallet,
  verifyOnchain,
  verifyStrict,
  splitContractAddress: effectiveSplitContractAddress,
  expectedChainId,
  splitEnabled,
});

export const buildCryptoQuote = async ({
  totalAmount,
  artistWallet,
  network,
  chainId,
}) => {
  const platformFee = Number((totalAmount * platformFeeRate).toFixed(2));
  const artistPayout = Number((totalAmount - platformFee).toFixed(2));
  const tokenSymbol = getNetworkTokenSymbol(network, chainId);
  const tickerSymbol = getBinanceTickerSymbol(tokenSymbol);

  let usdPerToken = null;
  let priceSource = "none";
  if (tickerSymbol) {
    try {
      usdPerToken = await fetchUsdPriceFromBinance(tickerSymbol);
      priceSource = "binance";
    } catch (error) {
      console.error(
        `[crypto-quote] failed to fetch ${tickerSymbol} price from Binance:`,
        error?.message || error,
      );
    }
  }

  const totalAmountNative = usdPerToken
    ? toRoundedTokenAmount(totalAmount / usdPerToken)
    : toRoundedTokenAmount(totalAmount);
  const platformFeeNative = usdPerToken
    ? toRoundedTokenAmount(platformFee / usdPerToken)
    : toRoundedTokenAmount(platformFee);
  const artistPayoutNative = usdPerToken
    ? toRoundedTokenAmount(artistPayout / usdPerToken)
    : toRoundedTokenAmount(artistPayout);

  return {
    totalAmount: Number(totalAmount),
    platformFee,
    artistPayout,
    totalAmountNative,
    platformFeeNative,
    artistPayoutNative,
    nativeTokenSymbol: tokenSymbol || "NATIVE",
    usdPerToken,
    priceSource,
    platformWallet,
    artistWallet: artistWallet || "",
    network: network || "",
    splitContractAddress: effectiveSplitContractAddress || "",
    requiresTxHash: verifyOnchain && verifyStrict,
    quotedAt: new Date().toISOString(),
  };
};

export const isLikelyTxHash = (txHash) => txHashRegex.test(String(txHash || ""));

export const verifyCryptoTransaction = async ({
  txHash,
  buyerWallet,
  artistWallet,
  expectedAmount,
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

    const normalizedExpectedChain = normalizeChainIdValue(expectedChainId);
    const normalizedTxChain = normalizeChainIdValue(tx.chainId);
    if (normalizedExpectedChain && normalizedTxChain && normalizedTxChain !== normalizedExpectedChain) {
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

    const normalizedSplit = normalizeAddress(effectiveSplitContractAddress);
    const normalizedArtist = normalizeAddress(artistWallet);
    const txValueWei = (() => {
      try {
        return BigInt(tx.value || "0x0");
      } catch {
        return 0n;
      }
    })();
    const expectedWei = amountToWeiBigInt(expectedAmount);
    if (expectedWei > 0n && txValueWei < expectedWei) {
      return {
        state: "insufficient_value",
        verified: false,
        reason: "Transaction value is lower than required amount.",
      };
    }

    if (normalizedSplit) {
      const sentToSplit = to === normalizedSplit;
      const sentToArtist = normalizedArtist ? to === normalizedArtist : false;
      if (!sentToSplit && !sentToArtist) {
        return {
          state: "wrong_receiver",
          verified: false,
          reason:
            "Transaction receiver does not match split contract or artist wallet.",
        };
      }

      return {
        state: "verified",
        verified: true,
        reason: sentToSplit
          ? "On-chain transaction verified via split contract."
          : "On-chain transaction verified via artist wallet.",
        from,
        to,
        valueWei: tx.value || "0x0",
        blockNumber: receipt.blockNumber || null,
      };
    }

    if (!effectiveSplitContractAddress && artistWallet && to !== normalizeAddress(artistWallet)) {
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
