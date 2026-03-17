import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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

const PLATFORM_FEE_RATE = 0.03;

type PaymentMethod = "MANUAL" | "CRYPTO";
type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
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

export default function ReleasePage() {
  const { slug } = useParams<{ slug: string }>();
  const setTrack = usePlayer((state) => state.setTrack);
  const sessionUser = getSessionUser();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("MANUAL");
  const [walletAddress, setWalletAddress] = useState("");
  const [txHash, setTxHash] = useState("");
  const [platformTxHash, setPlatformTxHash] = useState("");
  const [ibanReference, setIbanReference] = useState("");
  const [waveTrackId, setWaveTrackId] = useState<string | null>(null);
  const [likedByMe, setLikedByMe] = useState(false);
  const [releaseLikeCount, setReleaseLikeCount] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [copyOk, setCopyOk] = useState(false);
  const [purchaseStatus, setPurchaseStatus] = useState<string>("");
  const [downloadItems, setDownloadItems] = useState<
    Array<{ trackId: string; title: string; url: string; format: string }>
  >([]);

  const { data: release, isLoading, error } = useQuery({
    queryKey: ["release", slug],
    queryFn: () => api.getReleaseBySlug(slug ?? ""),
    enabled: Boolean(slug),
    retry: false,
  });

  const likeStateQuery = useQuery({
    queryKey: ["release-like", release?.id],
    queryFn: () => api.getReleaseLikeState(release?.id ?? ""),
    enabled: Boolean(release?.id),
  });

  const cryptoQuoteQuery = useQuery({
    queryKey: ["crypto-quote", release?.id],
    queryFn: () => api.getCryptoQuote(release?.id ?? ""),
    enabled: Boolean(release?.id && sessionUser && paymentMethod === "CRYPTO"),
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
        purchase.order.status === "PAID" ||
        purchase.order.status === "FULFILLED"
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
  const platformFee = release.price * PLATFORM_FEE_RATE;
  const artistNet = release.price - platformFee;
  const waveformTrack =
    releaseTracks.find((track) => track.id === waveTrackId) || releaseTracks[0] || null;

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

  const connectWallet = async () => {
    const provider = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
    if (!provider) {
      alert("No wallet detected. Install MetaMask or another EVM wallet.");
      return;
    }
    try {
      const accounts = await provider.request({
        method: "eth_requestAccounts",
      });
      if (Array.isArray(accounts) && typeof accounts[0] === "string") {
        setWalletAddress(accounts[0]);
      }
    } catch {
      alert("Wallet connection request was rejected.");
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

  const handleBuy = () => {
    if (!sessionUser) {
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

    if (paymentMethod === "CRYPTO" && !walletAddress) {
      void connectWallet();
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
          const quotePayload =
            cryptoQuoteQuery.data ?? (await api.getCryptoQuote(release.id));
          const expectedChainId = normalizeChainIdToHex(
            quotePayload.verification.expectedChainId || "",
          );

          if (expectedChainId) {
            const current = await provider.request({ method: "eth_chainId" });
            const currentChainId =
              typeof current === "string" ? normalizeChainIdToHex(current) : "";
            if (currentChainId && currentChainId !== expectedChainId) {
              await provider.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: expectedChainId }],
              });
            }
          }

          setPurchaseStatus("Please approve artist payout transaction in wallet...");
          const artistHash = await sendNativeTransfer(
            provider,
            walletAddress,
            artistPayment.wallet,
            quotePayload.quote.artistPayout,
          );
          setTxHash(artistHash);

          setPurchaseStatus("Please approve platform fee transaction in wallet...");
          const platformHash = await sendNativeTransfer(
            provider,
            walletAddress,
            quotePayload.verification.platformWallet,
            quotePayload.quote.platformFee,
          );
          setPlatformTxHash(platformHash);

          purchaseMutation.mutate({
            releaseId: release.id,
            paymentMethod,
            walletAddress,
            txHash: artistHash,
            platformTxHash: platformHash,
            ibanReference: undefined,
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
                  Connect wallet to continue with crypto payment.
                </p>
                <p className="text-muted-foreground break-all">
                  Artist wallet:{" "}
                  <span className="text-foreground">
                    {artistPayment.wallet || "Not configured"}
                  </span>
                </p>
                <p className="text-muted-foreground">
                  Network:{" "}
                  <span className="text-foreground">
                    {artistPayment.network || "EVM compatible"}
                  </span>
                </p>
                <p className="text-muted-foreground">
                  Platform wallet (fee 3%):{" "}
                  <span className="text-foreground break-all">
                    0xc66aC8bcF729a6398bc879B7454B13983220601e
                  </span>
                </p>
                {cryptoQuoteQuery.data?.quote.splitContractAddress && (
                  <p className="text-muted-foreground break-all">
                    Split contract:{" "}
                    <span className="text-foreground">
                      {cryptoQuoteQuery.data.quote.splitContractAddress}
                    </span>
                  </p>
                )}
                {walletAddress ? (
                  <p className="text-foreground break-all">{walletAddress}</p>
                ) : (
                  <button
                    type="button"
                    onClick={connectWallet}
                    className="w-full py-2 razor-border font-mono-data text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Connect Wallet
                  </button>
                )}
                <label className="block text-muted-foreground font-mono-data pt-1">
                  Artist Payout Tx Hash
                </label>
                <input
                  value={txHash}
                  onChange={(event) => setTxHash(event.target.value)}
                  placeholder="Auto-filled after wallet payment"
                  className="w-full px-2 py-2 bg-background razor-border text-foreground"
                />
                <label className="block text-muted-foreground font-mono-data pt-1">
                  Platform Fee Tx Hash
                </label>
                <input
                  value={platformTxHash}
                  onChange={(event) => setPlatformTxHash(event.target.value)}
                  placeholder="Auto-filled after wallet payment"
                  className="w-full px-2 py-2 bg-background razor-border text-foreground"
                />
                <p className="text-accent">
                  {cryptoQuoteQuery.data?.verification.verifyOnchain
                    ? "Wallet sends artist payout + platform fee on-chain, then order is verified automatically."
                    : "Crypto purchases unlock download links instantly."}
                </p>
              </div>
            )}

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Release Price</span>
                <span>${release.price.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>WAMM Fee (3%)</span>
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
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
