import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";
import { serializeOrder } from "../lib/serializers.js";

const router = Router();

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
    const paymentMethod =
      req.body?.paymentMethod === "CRYPTO" || req.body?.paymentMethod === "MANUAL"
        ? req.body.paymentMethod
        : "STRIPE";

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

    const platformFee = Number((release.price * 0.1).toFixed(2));
    const artistPayout = Number((release.price - platformFee).toFixed(2));

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
