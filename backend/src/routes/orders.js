import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";
import { serializeOrder } from "../lib/serializers.js";
import {
  buildCryptoQuote,
  getCryptoModuleConfig,
  verifyCryptoTransaction,
} from "../lib/crypto-payment.js";

const router = Router();
const PLATFORM_FEE_RATE = getCryptoModuleConfig().platformFeeRate;
const PLATFORM_WALLET_ADDRESS = getCryptoModuleConfig().platformWallet;

const purchaseSchema = z.object({
  paymentMethod: z.enum(["STRIPE", "CRYPTO", "MANUAL"]).default("MANUAL"),
  walletAddress: z.string().trim().min(6).optional(),
  txHash: z.string().trim().min(10).optional(),
  ibanReference: z.string().trim().min(3).optional(),
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

router.get(
  "/release/:releaseId/crypto-quote",
  requireAuth,
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
  requireAuth,
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

    const verification =
      paymentMethod === "CRYPTO"
        ? await verifyCryptoTransaction({
            txHash: payload.txHash,
            buyerWallet: payload.walletAddress,
            artistWallet: release.artist.payoutWallet ?? "",
          })
        : null;
    const cryptoConfig = getCryptoModuleConfig();

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

    const status =
      paymentMethod === "CRYPTO"
        ? cryptoConfig.verifyOnchain
          ? verification?.verified
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

    const order = await prisma.order.create({
      data: {
        id: `ord_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        userId: req.user.id,
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
              ? `Crypto payment verified on-chain (${release.artist.payoutNetwork || "EVM"}).`
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
          actorUserId: req.user.id,
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

    res.status(201).json({
      order: serializeOrder(order),
      message:
        paymentMethod === "CRYPTO"
          ? status === "PAID"
            ? "Crypto payment confirmed. Download access is now active."
            : "Crypto payment received. Download opens after verification."
          : "IBAN order received. Admin approval is required before download access.",
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
