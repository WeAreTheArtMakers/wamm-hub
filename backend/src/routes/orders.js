import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";
import { serializeOrder } from "../lib/serializers.js";

const router = Router();
const PLATFORM_FEE_RATE = 0.03;
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

router.post(
  "/release/:releaseId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = purchaseSchema.parse(req.body ?? {});
    const paymentMethod = payload.paymentMethod;

    const release = await prisma.release.findUnique({
      where: { id: req.params.releaseId },
      include: {
        artist: { select: { name: true } },
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
    const paymentReference =
      paymentMethod === "CRYPTO"
        ? payload.txHash ?? (payload.walletAddress ? `wallet:${payload.walletAddress}` : null)
        : payload.ibanReference
          ? `iban:${payload.ibanReference}`
          : null;

    if (paymentMethod === "CRYPTO" && !paymentReference) {
      res.status(400).json({
        message: "Wallet connection is required for crypto purchases.",
      });
      return;
    }

    const order = await prisma.order.create({
      data: {
        id: `ord_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        userId: req.user.id,
        releaseId: release.id,
        trackId: null,
        releaseTitle: release.title,
        artistName: release.artist.name,
        status: "PAID",
        totalAmount: release.price,
        platformFee,
        artistPayout,
        paymentMethod,
        cryptoTxHash: paymentReference ?? undefined,
        createdAt: new Date(),
      },
    });

    res.status(201).json({
      order: serializeOrder(order),
      message:
        "Order created. Payment marked as completed in demo mode for immediate download access.",
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
