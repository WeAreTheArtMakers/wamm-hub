import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authOptional, requireAuth } from "../lib/auth.js";
import { serializeOrder } from "../lib/serializers.js";
import {
  buildCryptoQuote,
  getCryptoModuleConfig,
  verifyCryptoTransaction,
} from "../lib/crypto-payment.js";

const router = Router();
const PLATFORM_FEE_RATE = getCryptoModuleConfig().platformFeeRate;
const PLATFORM_WALLET_ADDRESS = getCryptoModuleConfig().platformWallet;

const optionalTrimmedString = z.preprocess((value) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}, z.string().optional());

const purchaseSchema = z.object({
  paymentMethod: z.enum(["STRIPE", "CRYPTO", "MANUAL"]).default("MANUAL"),
  walletAddress: optionalTrimmedString,
  txHash: optionalTrimmedString,
  platformTxHash: optionalTrimmedString,
  ibanReference: optionalTrimmedString,
});

const asyncHandler =
  (handler) =>
  async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (error) {
      next(error);
    }
  };

const hashPassword = (input) =>
  crypto.createHash("sha256").update(input).digest("hex");

const mapTrackToDownload = (track) => ({
  trackId: track.id,
  title: track.title,
  url: track.highQualityUrl || track.originalUrl || track.audioUrl,
  format: track.highQualityUrl ? "high.mp3" : track.originalUrl ? "original" : "preview",
});

const getOrCreateGuestBuyerUserId = async (walletAddress) => {
  const normalizedWallet = String(walletAddress || "").trim().toLowerCase();
  const email = `guest+${normalizedWallet}@wamm.local`;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing.id;

  try {
    const created = await prisma.user.create({
      data: {
        email,
        passwordHash: hashPassword(`guest:${normalizedWallet}:${Date.now()}`),
        role: "LISTENER",
      },
    });
    return created.id;
  } catch {
    const fallback = await prisma.user.findUnique({ where: { email } });
    if (!fallback) {
      throw new Error("Failed to create guest buyer account.");
    }
    return fallback.id;
  }
};

router.get(
  "/release/:releaseId/crypto-quote",
  authOptional,
  asyncHandler(async (req, res) => {
    const release = await prisma.release.findUnique({
      where: { id: req.params.releaseId },
      include: {
        artist: {
          select: {
            payoutWallet: true,
            payoutNetwork: true,
          },
        },
      },
    });

    if (!release || !release.published || release.status !== "PUBLISHED") {
      res.status(404).json({ message: "Release not found." });
      return;
    }

    res.json({
      quote: buildCryptoQuote({
        totalAmount: release.price,
        artistWallet: release.artist?.payoutWallet ?? "",
        network: release.artist?.payoutNetwork ?? "",
      }),
      verification: getCryptoModuleConfig(),
    });
  }),
);

router.post(
  "/release/:releaseId",
  authOptional,
  asyncHandler(async (req, res) => {
    const payload = purchaseSchema.parse(req.body ?? {});
    const paymentMethod = payload.paymentMethod;

    const release = await prisma.release.findUnique({
      where: { id: req.params.releaseId },
      include: {
        artist: {
          select: {
            id: true,
            name: true,
            payoutWallet: true,
            payoutNetwork: true,
            payoutIban: true,
            payoutIbanName: true,
          },
        },
        tracks: {
          select: {
            id: true,
            title: true,
            audioUrl: true,
            highQualityUrl: true,
            originalUrl: true,
          },
        },
      },
    });

    if (!release || !release.published || release.status !== "PUBLISHED") {
      res.status(404).json({ message: "Release not found." });
      return;
    }

    if (!release.isForSale) {
      res.status(400).json({ message: "This release is not for sale." });
      return;
    }

    const platformFee = Number((release.price * PLATFORM_FEE_RATE).toFixed(2));
    const artistPayout = Number((release.price - platformFee).toFixed(2));
    if (paymentMethod === "CRYPTO" && !release.artist.payoutWallet) {
      res.status(400).json({
        message: "Artist crypto wallet is not configured yet.",
      });
      return;
    }

    if (paymentMethod === "CRYPTO" && !payload.walletAddress) {
      res.status(400).json({
        message: "Wallet connection is required for crypto purchases.",
      });
      return;
    }

    if (
      paymentMethod === "CRYPTO" &&
      payload.walletAddress &&
      !/^0x[a-fA-F0-9]{40}$/.test(payload.walletAddress)
    ) {
      res.status(400).json({
        message: "Connected wallet address is invalid.",
      });
      return;
    }

    if (paymentMethod === "MANUAL" && !release.artist.payoutIban) {
      res.status(400).json({
        message: "Artist has not configured IBAN details yet.",
      });
      return;
    }

    if (paymentMethod === "MANUAL" && !payload.ibanReference) {
      res.status(400).json({
        message:
          "Bank transfer reference is required. Your order will be confirmed after admin approval.",
      });
      return;
    }

    if (paymentMethod === "MANUAL" && !req.user?.id) {
      res.status(401).json({
        message: "Authentication required for IBAN payment orders.",
      });
      return;
    }

    const cryptoConfig = getCryptoModuleConfig();
    const hasSplitRouter = Boolean((cryptoConfig.splitContractAddress || "").trim());
    const expectedPrimaryAmount = hasSplitRouter ? release.price : artistPayout;
    const verification =
      paymentMethod === "CRYPTO"
        ? await verifyCryptoTransaction({
            txHash: payload.txHash,
            buyerWallet: payload.walletAddress,
            artistWallet: release.artist.payoutWallet ?? "",
            expectedAmount: expectedPrimaryAmount,
          })
        : null;
    const requiresPlatformFeeTx =
      paymentMethod === "CRYPTO" &&
      cryptoConfig.verifyOnchain &&
      cryptoConfig.verifyStrict &&
      !hasSplitRouter;
    if (requiresPlatformFeeTx && !payload.platformTxHash) {
      res.status(400).json({
        message:
          "Platform fee transaction hash is required for strict on-chain verification.",
      });
      return;
    }

    const platformVerification =
      paymentMethod === "CRYPTO" && payload.platformTxHash
        ? await verifyCryptoTransaction({
            txHash: payload.platformTxHash,
            buyerWallet: payload.walletAddress,
            artistWallet: PLATFORM_WALLET_ADDRESS,
            expectedAmount: platformFee,
          })
        : null;

    if (
      paymentMethod === "CRYPTO" &&
      cryptoConfig.verifyStrict &&
      verification &&
      !verification.verified
    ) {
      res.status(400).json({
        message: verification.reason || "Crypto transaction could not be verified.",
      });
      return;
    }
    if (
      paymentMethod === "CRYPTO" &&
      cryptoConfig.verifyStrict &&
      platformVerification &&
      !platformVerification.verified
    ) {
      res.status(400).json({
        message:
          platformVerification.reason ||
          "Platform fee transaction could not be verified.",
      });
      return;
    }

    const status =
      paymentMethod === "CRYPTO"
        ? cryptoConfig.verifyOnchain
          ? verification?.verified &&
            (!requiresPlatformFeeTx || Boolean(platformVerification?.verified))
            ? "PAID"
            : "UNDER_REVIEW"
          : "PAID"
        : "UNDER_REVIEW";
    const paymentReference =
      paymentMethod === "CRYPTO"
        ? payload.txHash
        : payload.ibanReference
          ? `iban:${payload.ibanReference}`
          : undefined;

    const buyerUserId =
      req.user?.id ??
      (paymentMethod === "CRYPTO"
        ? await getOrCreateGuestBuyerUserId(payload.walletAddress)
        : null);
    if (!buyerUserId) {
      res.status(401).json({ message: "Authentication required." });
      return;
    }

    const order = await prisma.order.create({
      data: {
        id: `ord_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        userId: buyerUserId,
        releaseId: release.id,
        trackId: null,
        releaseTitle: release.title,
        artistName: release.artist.name,
        status,
        totalAmount: release.price,
        platformFee,
        artistPayout,
        paymentMethod,
        cryptoTxHash: paymentMethod === "CRYPTO" ? paymentReference ?? undefined : undefined,
        paymentNote:
          paymentMethod === "CRYPTO"
            ? verification?.verified
              ? hasSplitRouter
                ? `Crypto payment verified on-chain via split routing (${release.artist.payoutNetwork || "EVM"}).`
                : `Crypto payment verified on-chain (${release.artist.payoutNetwork || "EVM"}).${
                    payload.platformTxHash
                      ? ` Platform fee tx: ${payload.platformTxHash}.`
                      : ""
                  }`
              : verification?.reason ||
                `Crypto payment accepted (${release.artist.payoutNetwork || "EVM"}).`
            : `IBAN transfer reference: ${payload.ibanReference}`,
        buyerWallet: paymentMethod === "CRYPTO" ? payload.walletAddress : undefined,
        artistWallet: release.artist.payoutWallet ?? undefined,
        platformWallet: PLATFORM_WALLET_ADDRESS,
        createdAt: new Date(),
      },
    });

    if (release.artist?.id) {
      await prisma.artistActivityLog.create({
        data: {
          artistId: release.artist.id,
          actorUserId: req.user?.id ?? buyerUserId,
          entityType: "ORDER",
          action:
            paymentMethod === "CRYPTO"
              ? status === "PAID"
                ? "CRYPTO_ORDER_PAID"
                : "CRYPTO_ORDER_UNDER_REVIEW"
              : "MANUAL_ORDER_CREATED",
          detailsJson: JSON.stringify({
            orderId: order.id,
            releaseId: release.id,
            totalAmount: release.price,
            platformFee,
            artistPayout,
          }),
        },
      });
    }

    const downloads =
      status === "PAID" || status === "FULFILLED"
        ? (release.tracks ?? []).map(mapTrackToDownload)
        : [];

    res.status(201).json({
      order: serializeOrder(order),
      message:
        paymentMethod === "CRYPTO"
          ? status === "PAID"
            ? "Crypto payment confirmed. Download access is now active."
            : "Crypto payment received. Download opens after verification."
          : "IBAN order received. Admin approval is required before download access.",
      downloads,
    });
  }),
);

router.get(
  "/my",
  requireAuth,
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });
    res.json(orders.map(serializeOrder));
  }),
);

router.get(
  "/:orderId/downloads",
  requireAuth,
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      include: {
        release: {
          include: {
            tracks: true,
          },
        },
        track: true,
      },
    });

    if (!order || order.userId !== req.user.id) {
      res.status(404).json({ message: "Order not found." });
      return;
    }

    if (order.status !== "PAID" && order.status !== "FULFILLED") {
      res.status(403).json({ message: "Payment not completed for this order." });
      return;
    }

    if (order.track) {
      const track = order.track;
      res.json({
        order: serializeOrder(order),
        downloads: [
          {
            trackId: track.id,
            title: track.title,
            url: track.highQualityUrl || track.originalUrl || track.audioUrl,
            format: track.highQualityUrl
              ? "high.mp3"
              : track.originalUrl
                ? "original"
                : "preview",
          },
        ],
      });
      return;
    }

    const tracks = order.release?.tracks ?? [];
    res.json({
      order: serializeOrder(order),
      downloads: tracks.map((track) => ({
        trackId: track.id,
        title: track.title,
        url: track.highQualityUrl || track.originalUrl || track.audioUrl,
        format: track.highQualityUrl
          ? "high.mp3"
          : track.originalUrl
            ? "original"
            : "preview",
      })),
    });
  }),
);

export { router as orderRouter };
