import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Play,
  Share2,
  Heart,
  ShoppingCart,
  ArrowLeft,
  Wallet,
  Landmark,
  Copy,
  Check,
  Facebook,
  Linkedin,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import { TrackList } from "@/components/music/TrackList";
import { WaveformDisplay } from "@/components/music/WaveformDisplay";
import { getCoverForRelease } from "@/data/covers";
import { api } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { formatDuration, formatNumber, trackToPlayerTrack } from "@/lib/music";
import { usePlayer } from "@/store/usePlayer";
const SPLIT_PAY_SELECTOR = "0xe433de36";

type PaymentMethod = "MANUAL" | "CRYPTO";
type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

const formatCommentTime = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
};

const toWeiHex = (amount: number) => {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) return "0x0";
  const micros = BigInt(Math.round(numeric * 1_000_000));
  const wei = (micros * 10n ** 18n) / 1_000_000n;
  return `0x${wei.toString(16)}`;
};

const normalizeChainIdToHex = (chainId: string) => {
  const raw = String(chainId || "").trim();
  if (!raw) return "";
  try {
    if (/^0x/i.test(raw)) return `0x${BigInt(raw).toString(16)}`;
    return `0x${BigInt(raw).toString(16)}`;
  } catch {
    return raw;
  }
};

const toBytes32Hex = (input: string) => {
  const bytes = new TextEncoder().encode(input || "");
  const limited = bytes.slice(0, 32);
  const hex = Array.from(limited)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex.padEnd(64, "0")}`;
};

const padAddressToWord = (address: string) => {
  const normalized = String(address || "")
    .trim()
    .replace(/^0x/i, "")
    .toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(normalized)) {
    throw new Error("Artist wallet address is invalid.");
  }
  return normalized.padStart(64, "0");
};

const shortenWallet = (address: string) => {
  const value = String(address || "").trim();
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const isWalletRejectedError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  Number((error as { code?: unknown }).code) === 4001;

export default function ReleasePage() {
  const { slug } = useParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const setTrack = usePlayer((state) => state.setTrack);
  const currentTrack = usePlayer((state) => state.currentTrack);
  const currentTime = usePlayer((state) => state.currentTime);
  const currentTrackRef = useRef(currentTrack);
  const currentTimeRef = useRef(currentTime);
  const sessionUser = getSessionUser();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("MANUAL");
  const [walletAddress, setWalletAddress] = useState("");
  const [walletChainId, setWalletChainId] = useState("");
  const [ibanReference, setIbanReference] = useState("");
  const [waveTrackId, setWaveTrackId] = useState<string | null>(null);
  const [likedByMe, setLikedByMe] = useState(false);
  const [releaseLikeCount, setReleaseLikeCount] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [copyOk, setCopyOk] = useState(false);
  const [purchaseStatus, setPurchaseStatus] = useState<string>("");
  const [commentText, setCommentText] = useState("");
  const [commentTimestamp, setCommentTimestamp] = useState(0);
  const [downloadItems, setDownloadItems] = useState<
    Array<{ trackId: string; title: string; url: string; format: string }>
  >([]);

  const { data: release, isLoading, error } = useQuery({
    queryKey: ["release", slug],
    queryFn: () => api.getReleaseBySlug(slug ?? ""),
    enabled: Boolean(slug),
    retry: false,
  });

  useEffect(() => {
    currentTrackRef.current = currentTrack;
    currentTimeRef.current = currentTime;
  }, [currentTrack, currentTime]);

  const likeStateQuery = useQuery({
    queryKey: ["release-like", release?.id],
    queryFn: () => api.getReleaseLikeState(release?.id ?? ""),
    enabled: Boolean(release?.id),
  });

  const cryptoQuoteQuery = useQuery({
    queryKey: ["crypto-quote", release?.id, walletChainId || "default"],
    queryFn: () => api.getCryptoQuote(release?.id ?? "", walletChainId || undefined),
    enabled: Boolean(release?.id && paymentMethod === "CRYPTO"),
  });

  useEffect(() => {
    if (!release) return;
    setReleaseLikeCount(release.communityLikes ?? 0);
    setLikedByMe(Boolean(release.likedByMe));
  }, [release]);

  useEffect(() => {
    if (!likeStateQuery.data) return;
    setLikedByMe(likeStateQuery.data.likedByMe);
    setReleaseLikeCount(likeStateQuery.data.totalLikes);
  }, [likeStateQuery.data]);

  const purchaseMutation = useMutation({
    mutationFn: async (payload: {
      releaseId: string;
      paymentMethod: PaymentMethod;
      walletAddress?: string;
      txHash?: string;
      platformTxHash?: string;
      ibanReference?: string;
    }) => {
      const purchase = await api.purchaseRelease(payload.releaseId, {
        paymentMethod: payload.paymentMethod,
        walletAddress: payload.walletAddress,
        txHash: payload.paymentMethod === "CRYPTO" ? payload.txHash : undefined,
        platformTxHash:
          payload.paymentMethod === "CRYPTO" ? payload.platformTxHash : undefined,
        ibanReference: payload.ibanReference,
      });
      if (
        (purchase.order.status === "PAID" || purchase.order.status === "FULFILLED") &&
        Array.isArray(purchase.downloads) &&
        purchase.downloads.length > 0
      ) {
        return {
          downloads: purchase.downloads,
          message: purchase.message,
          status: purchase.order.status,
        };
      }

      if (
        (purchase.order.status === "PAID" || purchase.order.status === "FULFILLED") &&
        sessionUser
      ) {
        const downloads = await api.getOrderDownloads(purchase.order.id);
        return {
          downloads: downloads.downloads,
          message: purchase.message,
          status: purchase.order.status,
        };
      }

      return {
        downloads: [],
        message: purchase.message,
        status: purchase.order.status,
      };
    },
    onSuccess: ({ downloads, message, status }) => {
      setDownloadItems(downloads);
      setPurchaseStatus(`${status}: ${message}`);
    },
  });

  const likeMutation = useMutation({
    mutationFn: async () => api.toggleReleaseLike(release.id),
    onSuccess: (result) => {
      setLikedByMe(result.likedByMe);
      setReleaseLikeCount(result.totalLikes);
    },
  });

  const commentMutation = useMutation({
    mutationFn: (payload: { trackId: string; content: string; timestamp: number }) =>
      api.addTrackComment(payload.trackId, {
        content: payload.content,
        timestamp: payload.timestamp,
      }),
    onSuccess: async () => {
      setCommentText("");
      await queryClient.invalidateQueries({ queryKey: ["release", slug] });
    },
  });

  const artistPayment = release?.artistPayment ?? {
    iban: "",
    ibanName: "",
    wallet: "",
    network: "",
  };
  const hasIban = Boolean(artistPayment.iban?.trim());
  const hasWallet = Boolean(artistPayment.wallet?.trim());

  useEffect(() => {
    if (!release) return;
    if (!hasIban && hasWallet && paymentMethod === "MANUAL") {
      setPaymentMethod("CRYPTO");
      return;
    }
    if (!hasWallet && hasIban && paymentMethod === "CRYPTO") {
      setPaymentMethod("MANUAL");
    }
  }, [release, hasIban, hasWallet, paymentMethod]);

  useEffect(() => {
    if (!release) return;
    const ids = (release.tracks ?? []).map((track) => track.id);
    setWaveTrackId((prev) => (prev && ids.includes(prev) ? prev : ids[0] ?? null));
  }, [release]);

  useEffect(() => {
    if (!release) return;
    const tracks = release.tracks ?? [];
    const selected =
      tracks.find((track) => track.id === waveTrackId) || tracks[0] || null;
    if (!selected) return;
    const suggestion =
      currentTrackRef.current?.id === selected.id
        ? Math.floor(currentTimeRef.current)
        : 0;
    setCommentTimestamp(Math.max(0, Math.min(selected.duration, suggestion)));
  }, [release, waveTrackId]);

  if (isLoading) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 py-20 text-center">
        <p className="font-mono-data text-muted-foreground">Loading release...</p>
      </div>
    );
  }

  if (error || !release) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 py-20 text-center">
        <h1 className="font-display text-2xl mb-4">Release not found</h1>
        <Link to="/" className="font-mono-data text-accent">
          Go home
        </Link>
      </div>
    );
  }

  const releaseTracks = release.tracks ?? [];
  const cover = release.coverArtUrl || getCoverForRelease(release.id);
  const totalDuration = releaseTracks.reduce((sum, track) => sum + track.duration, 0);
  const totalPlays =
    release.totalPlays ?? releaseTracks.reduce((sum, track) => sum + track.plays, 0);
  const totalLikes =
    release.totalLikes ?? releaseTracks.reduce((sum, track) => sum + track.likes, 0);
  const quotedPlatformFee = cryptoQuoteQuery.data?.quote.platformFee;
  const platformFee = Number.isFinite(quotedPlatformFee ?? NaN)
    ? Number(quotedPlatformFee)
    : 0;
  const artistNet = release.price - platformFee;
  const platformFeePercent =
    release.price > 0 && platformFee > 0 ? Math.round((platformFee / release.price) * 100) : 0;
  const waveformTrack =
    releaseTracks.find((track) => track.id === waveTrackId) || releaseTracks[0] || null;

  const handleSubmitComment = () => {
    if (!waveformTrack) return;
    const content = commentText.trim();
    if (!content) return;
    if (!sessionUser) {
      window.location.href = "/login";
      return;
    }
    const timestamp = Math.max(
      0,
      Math.min(waveformTrack.duration, Math.floor(commentTimestamp)),
    );
    commentMutation.mutate({
      trackId: waveformTrack.id,
      content,
      timestamp,
    });
  };

  const handlePlayAll = () => {
    if (releaseTracks.length === 0) return;
    const first = releaseTracks[0];
    setTrack(
      {
        ...trackToPlayerTrack(first),
        coverArtUrl: cover,
      },
      releaseTracks.slice(1).map((track) => ({
        ...trackToPlayerTrack(track),
        coverArtUrl: cover,
      })),
    );
  };

  const connectWallet = async (): Promise<string | null> => {
    const provider = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
    if (!provider) {
      alert("No wallet detected. Install MetaMask or another EVM wallet.");
      return null;
    }
    try {
      const accounts = await provider.request({
        method: "eth_requestAccounts",
      });
      if (Array.isArray(accounts) && typeof accounts[0] === "string") {
        setWalletAddress(accounts[0]);
        const activeChain = await provider.request({ method: "eth_chainId" });
        if (typeof activeChain === "string") {
          setWalletChainId(normalizeChainIdToHex(activeChain));
        }
        return accounts[0];
      }
      return null;
    } catch {
      alert("Wallet connection request was rejected.");
      return null;
    }
  };

  const waitForReceipt = async (
    provider: EthereumProvider,
    hash: string,
    timeoutMs = 180000,
  ) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const receipt = await provider.request({
        method: "eth_getTransactionReceipt",
        params: [hash],
      });
      if (receipt && typeof receipt === "object") {
        return receipt;
      }
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    throw new Error("Transaction confirmation timed out.");
  };

  const sendNativeTransfer = async (
    provider: EthereumProvider,
    from: string,
    to: string,
    amount: number,
  ) => {
    const value = toWeiHex(amount);
    const tx = await provider.request({
      method: "eth_sendTransaction",
      params: [
        {
          from,
          to,
          value,
        },
      ],
    });
    if (typeof tx !== "string") {
      throw new Error("Wallet did not return a valid transaction hash.");
    }
    await waitForReceipt(provider, tx);
    return tx;
  };

  const sendSplitContractPayment = async ({
    provider,
    from,
    splitContract,
    totalAmount,
    artistWalletAddress,
    releaseRef,
  }: {
    provider: EthereumProvider;
    from: string;
    splitContract: string;
    totalAmount: number;
    artistWalletAddress: string;
    releaseRef: string;
  }) => {
    const value = toWeiHex(totalAmount);
    const data = `${SPLIT_PAY_SELECTOR}${padAddressToWord(artistWalletAddress)}${toBytes32Hex(
      releaseRef,
    ).slice(2)}`;
    const tx = await provider.request({
      method: "eth_sendTransaction",
      params: [
        {
          from,
          to: splitContract,
          value,
          data,
        },
      ],
    });
    if (typeof tx !== "string") {
      throw new Error("Wallet did not return a valid split transaction hash.");
    }
    await waitForReceipt(provider, tx);
    return tx;
  };

  const handleBuy = () => {
    if (!sessionUser && paymentMethod !== "CRYPTO") {
      window.location.href = "/login";
      return;
    }

    if (paymentMethod === "MANUAL" && !hasIban) {
      alert("Artist has not configured IBAN details yet.");
      return;
    }

    if (paymentMethod === "CRYPTO" && !hasWallet) {
      alert("Artist has not configured crypto wallet details yet.");
      return;
    }

    if (paymentMethod === "CRYPTO") {
      const provider = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
      if (!provider) {
        alert("No wallet detected. Install MetaMask or another EVM wallet.");
        return;
      }

      void (async () => {
        try {
          setPurchaseStatus("Preparing crypto payment...");
          let activeWallet = walletAddress;
          if (!activeWallet) {
            const connectedWallet = await connectWallet();
            if (!connectedWallet) {
              setPurchaseStatus("");
              return;
            }
            activeWallet = connectedWallet;
          }

          const currentBeforeSwitch = await provider.request({ method: "eth_chainId" });
          let activeChainId =
            typeof currentBeforeSwitch === "string"
              ? normalizeChainIdToHex(currentBeforeSwitch)
              : "";

          const preflightQuote =
            cryptoQuoteQuery.data ??
            (await api.getCryptoQuote(release.id, activeChainId || undefined));
          const expectedChainId = normalizeChainIdToHex(
            (preflightQuote.verification.expectedChainId || "").trim(),
          );

          if (expectedChainId) {
            if (activeChainId && activeChainId !== expectedChainId) {
              await provider.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: expectedChainId }],
              });
              activeChainId = expectedChainId;
            }
          }
          setWalletChainId(activeChainId);

          const quotePayload =
            expectedChainId && activeChainId === expectedChainId
              ? await api.getCryptoQuote(release.id, activeChainId || undefined)
              : preflightQuote;

          let artistHash = "";
          let platformHash: string | undefined;
          const splitTarget = quotePayload.quote.splitContractAddress?.trim() || "";

          if (splitTarget) {
            try {
              setPurchaseStatus(
                "Approve one crypto payment in wallet. Split is handled automatically.",
              );
              artistHash = await sendSplitContractPayment({
                provider,
                from: activeWallet,
                splitContract: splitTarget,
                totalAmount: quotePayload.quote.totalAmountNative,
                artistWalletAddress: artistPayment.wallet,
                releaseRef: release.id,
              });
            } catch (splitError) {
              if (isWalletRejectedError(splitError)) {
                throw splitError;
              }
              setPurchaseStatus("Split router unavailable. Falling back to direct wallet send.");
              artistHash = await sendNativeTransfer(
                provider,
                activeWallet,
                artistPayment.wallet,
                quotePayload.quote.artistPayoutNative,
              );
              if (quotePayload.quote.platformFeeNative > 0) {
                platformHash = await sendNativeTransfer(
                  provider,
                  activeWallet,
                  quotePayload.verification.platformWallet,
                  quotePayload.quote.platformFeeNative,
                );
              }
            }
          } else {
            setPurchaseStatus("Please approve wallet payment...");
            artistHash = await sendNativeTransfer(
              provider,
              activeWallet,
              artistPayment.wallet,
              quotePayload.quote.artistPayoutNative,
            );

            if (quotePayload.quote.platformFeeNative > 0) {
              setPurchaseStatus("Please approve platform fee transaction in wallet...");
              platformHash = await sendNativeTransfer(
                provider,
                activeWallet,
                quotePayload.verification.platformWallet,
                quotePayload.quote.platformFeeNative,
              );
            }
          }

          purchaseMutation.mutate({
            releaseId: release.id,
            paymentMethod,
            walletAddress: activeWallet,
            txHash: artistHash,
            platformTxHash: platformHash,
            ibanReference: undefined,
            chainId: activeChainId || undefined,
          });
        } catch (error) {
          setPurchaseStatus("");
          alert(
            error instanceof Error
              ? error.message
              : "Crypto payment could not be completed.",
          );
        }
      })();
      return;
    }

    purchaseMutation.mutate({
      releaseId: release.id,
      paymentMethod,
      walletAddress: undefined,
      txHash: undefined,
      platformTxHash: undefined,
      ibanReference: paymentMethod === "MANUAL" ? ibanReference.trim() : undefined,
    });
  };

  const releaseUrl =
    typeof window !== "undefined"
      ? window.location.href
      : `https://wamm-hub.up.railway.app/release/${release.slug}`;

  const handleShare = (type: "x" | "facebook" | "linkedin" | "copy") => {
    const encodedUrl = encodeURIComponent(releaseUrl);
    const text = encodeURIComponent(`${release.title} — ${release.artistName} | WAMM HUB`);

    if (type === "copy") {
      navigator.clipboard
        .writeText(releaseUrl)
        .then(() => {
          setCopyOk(true);
          setTimeout(() => setCopyOk(false), 1600);
        })
        .catch(() => {
          setCopyOk(false);
        });
      return;
    }

    const target =
      type === "x"
        ? `https://x.com/intent/tweet?url=${encodedUrl}&text=${text}`
        : type === "facebook"
          ? `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
          : `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
    window.open(target, "_blank", "noopener,noreferrer");
  };

  const handleLike = () => {
    if (!sessionUser) {
      window.location.href = "/login";
      return;
    }
    likeMutation.mutate();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-[1400px] mx-auto px-4 py-8"
    >
      <Link
        to="/"
        className="inline-flex items-center gap-1 font-mono-data text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft className="w-3 h-3" /> Back
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] lg:grid-cols-[400px_1fr] gap-6 md:gap-8 mb-12">
        <div className="space-y-4">
          <div className="aspect-square overflow-hidden bg-secondary">
            <img src={cover} alt={release.title} className="w-full h-full object-cover" />
          </div>

          <div className="razor-border p-4 space-y-3 surface">
            <span className="font-mono-data text-muted-foreground">Order Breakdown</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod("MANUAL")}
                disabled={!hasIban}
                className={`px-3 py-2 font-mono-data transition-colors ${
                  paymentMethod === "MANUAL"
                    ? "bg-foreground text-background"
                    : "razor-border text-muted-foreground hover:text-foreground"
                } ${!hasIban ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                <Landmark className="inline w-3 h-3 mr-1" />
                IBAN
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("CRYPTO")}
                disabled={!hasWallet}
                className={`px-3 py-2 font-mono-data transition-colors ${
                  paymentMethod === "CRYPTO"
                    ? "bg-foreground text-background"
                    : "razor-border text-muted-foreground hover:text-foreground"
                } ${!hasWallet ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                <Wallet className="inline w-3 h-3 mr-1" />
                CRYPTO
              </button>
            </div>

            {paymentMethod === "MANUAL" ? (
              <div className="space-y-2 text-xs bg-secondary/60 p-3 razor-border">
                <p className="text-muted-foreground">
                  Beneficiary:{" "}
                  <span className="text-foreground">
                    {artistPayment.ibanName || release.artistName}
                  </span>
                </p>
                <p className="text-muted-foreground break-all">
                  IBAN:{" "}
                  <span className="text-foreground">
                    {artistPayment.iban || "Artist has not set IBAN yet."}
                  </span>
                </p>
                <p className="text-muted-foreground">
                  Use release slug as transfer reference.
                </p>
                <p className="text-accent">
                  IBAN orders require admin verification before download links are unlocked.
                </p>
                <label className="block text-muted-foreground font-mono-data">
                  Transfer Reference
                </label>
                <input
                  value={ibanReference}
                  onChange={(event) => setIbanReference(event.target.value)}
                  placeholder={`REF-${release.slug.toUpperCase()}`}
                  className="w-full px-2 py-2 bg-background razor-border text-foreground"
                />
              </div>
            ) : (
              <div className="space-y-2 text-xs bg-secondary/60 p-3 razor-border">
                <p className="text-muted-foreground">
                  Connect wallet and pay. Routing is automatic, no manual address handling.
                </p>
                {walletAddress ? (
                  <p className="text-foreground">Connected: {shortenWallet(walletAddress)}</p>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      void connectWallet();
                    }}
                    className="w-full py-2 razor-border font-mono-data text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Connect Wallet
                  </button>
                )}
                <p className="text-accent">
                  {cryptoQuoteQuery.data?.quote.splitContractAddress
                    ? "Auto-split active: 97% artist / 3% platform in one payment."
                    : "Promo mode active: 100% of payment goes directly to artist wallet."}
                </p>
                {cryptoQuoteQuery.data && (
                  <p className="text-muted-foreground">
                    Live quote: {cryptoQuoteQuery.data.quote.totalAmountNative.toFixed(6)}{" "}
                    {cryptoQuoteQuery.data.quote.nativeTokenSymbol} ≈ $
                    {release.price.toFixed(2)}
                    {cryptoQuoteQuery.data.quote.priceSource === "binance"
                      ? " (Binance spot)"
                      : ""}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Release Price</span>
                <span>${release.price.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>WAMM Fee ({platformFeePercent}%)</span>
                <span>-${platformFee.toFixed(2)}</span>
              </div>
              <div className="h-px bg-border my-1" />
              <div className="flex justify-between text-accent font-bold">
                <span>Artist Receives</span>
                <span>${artistNet.toFixed(2)}</span>
              </div>
            </div>
            <button
              onClick={handleBuy}
              disabled={purchaseMutation.isPending || !release.isForSale}
              className="w-full py-3 bg-foreground text-background font-mono-data hover:bg-accent hover:text-accent-foreground transition-colors press-effect flex items-center justify-center gap-2"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              {purchaseMutation.isPending
                ? "Processing..."
                : release.isForSale
                  ? `${paymentMethod === "CRYPTO" ? "Pay with Crypto" : "Confirm IBAN Payment"} — $${release.price.toFixed(2)}`
                  : "Not For Sale"}
            </button>
            {purchaseMutation.isError && (
              <p className="text-sm text-destructive">
                {purchaseMutation.error.message}
              </p>
            )}
            {purchaseStatus && (
              <p className="text-xs text-muted-foreground razor-border px-2 py-2">
                {purchaseStatus}
              </p>
            )}
            {downloadItems.length > 0 && (
              <div className="pt-2 space-y-1">
                <p className="font-mono-data text-accent text-xs">Downloads ready</p>
                {downloadItems.map((item) => (
                  <a
                    key={item.trackId}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    {item.title} ({item.format})
                  </a>
                ))}
              </div>
            )}
            <div className="relative flex gap-2">
              <button
                type="button"
                onClick={handleLike}
                disabled={likeMutation.isPending}
                className={`flex-1 py-2 razor-border font-mono-data transition-colors press-effect flex items-center justify-center gap-1 ${
                  likedByMe ? "text-accent" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Heart className="w-3 h-3" /> Like ({releaseLikeCount})
              </button>
              <button
                type="button"
                onClick={() => setShareOpen((prev) => !prev)}
                className="flex-1 py-2 razor-border font-mono-data text-muted-foreground hover:text-foreground transition-colors press-effect flex items-center justify-center gap-1"
              >
                <Share2 className="w-3 h-3" /> Share
              </button>
              {shareOpen && (
                <div className="absolute left-0 right-0 top-full mt-2 razor-border bg-background/95 p-2 z-20 grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleShare("x")}
                    className="px-2 py-2 razor-border text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1"
                  >
                    <X className="w-3 h-3" /> X
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShare("facebook")}
                    className="px-2 py-2 razor-border text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1"
                  >
                    <Facebook className="w-3 h-3" /> Facebook
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShare("linkedin")}
                    className="px-2 py-2 razor-border text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1"
                  >
                    <Linkedin className="w-3 h-3" /> LinkedIn
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShare("copy")}
                    className="px-2 py-2 razor-border text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1"
                  >
                    {copyOk ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copyOk ? "Copied" : "Copy Link"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <span className="font-mono-data text-accent">{release.type}</span>
            <h1 className="font-display text-3xl md:text-4xl mt-1">{release.title}</h1>
            <Link
              to={`/artist/${release.artistSlug}`}
              className="font-mono-data text-muted-foreground hover:text-foreground transition-colors mt-1 inline-block"
            >
              {release.artistName}
            </Link>
          </div>

          <div className="flex flex-wrap gap-4 font-mono-data text-muted-foreground">
            <span>{release.trackCount ?? releaseTracks.length} tracks</span>
            <span>{formatDuration(totalDuration)}</span>
            <span>{formatNumber(totalPlays)} plays</span>
            <span>{formatNumber(totalLikes)} likes</span>
            <span>{release.releaseDate}</span>
          </div>

          {release.description && (
            <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
              {release.description}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {release.genres.map((genre) => (
              <span
                key={genre}
                className="px-2 py-0.5 razor-border font-mono-data text-muted-foreground"
              >
                {genre}
              </span>
            ))}
          </div>

          <button
            onClick={handlePlayAll}
            className="flex items-center gap-2 px-4 py-2 bg-foreground text-background font-mono-data hover:bg-accent hover:text-accent-foreground transition-colors press-effect"
          >
            <Play className="w-3.5 h-3.5 ml-0.5" /> Play All
          </button>

          <div className="razor-border overflow-hidden">
            <TrackList
              tracks={releaseTracks}
              showArtist={false}
              onTrackSelect={(track) => setWaveTrackId(track.id)}
            />
          </div>

          {waveformTrack && (
            <div className="space-y-2 min-w-0">
              <span className="font-mono-data text-muted-foreground">
                {waveformTrack.title} — Waveform Comments
              </span>
              <div className="razor-border p-2 sm:p-3 min-w-0 overflow-hidden">
                <WaveformDisplay
                  waveform={waveformTrack.waveform}
                  duration={waveformTrack.duration}
                  trackId={waveformTrack.id}
                  comments={waveformTrack.comments}
                  height={72}
                />
                <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      Comment at {formatCommentTime(commentTimestamp)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const current = currentTrack?.id === waveformTrack.id ? currentTime : 0;
                        setCommentTimestamp(
                          Math.max(0, Math.min(waveformTrack.duration, Math.floor(current))),
                        );
                      }}
                      className="px-2 py-1 razor-border hover:text-foreground transition-colors"
                    >
                      Use Current Time
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={Math.max(waveformTrack.duration, 1)}
                      step={1}
                      value={commentTimestamp}
                      onChange={(event) => setCommentTimestamp(Number(event.target.value))}
                      className="flex-1 accent-accent"
                    />
                    <span className="font-mono-data text-xs text-muted-foreground w-12 text-right">
                      {formatCommentTime(commentTimestamp)}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      value={commentText}
                      onChange={(event) => setCommentText(event.target.value)}
                      maxLength={280}
                      placeholder={
                        sessionUser
                          ? "Write a comment for this moment..."
                          : "Sign in to add comments."
                      }
                      disabled={!sessionUser || commentMutation.isPending}
                      className="flex-1 px-3 py-2 bg-secondary razor-border text-foreground text-sm focus:outline-none focus:border-accent transition-colors disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={handleSubmitComment}
                      disabled={!sessionUser || commentMutation.isPending || !commentText.trim()}
                      className="px-4 py-2 bg-foreground text-background font-mono-data hover:bg-accent hover:text-accent-foreground transition-colors press-effect disabled:opacity-60"
                    >
                      {commentMutation.isPending ? "Posting..." : "Post Comment"}
                    </button>
                  </div>
                  {commentMutation.isError && (
                    <p className="text-xs text-destructive">
                      {commentMutation.error.message}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
