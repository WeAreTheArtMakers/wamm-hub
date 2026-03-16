import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  isValidAdminCredentials,
  issueAdminToken,
  requireAdmin,
} from "../lib/admin-auth.js";
import { serializeOrder } from "../lib/serializers.js";

const router = Router();

const adminLoginSchema = z.object({
  username: z.string().trim().min(3),
  password: z.string().min(1),
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

const toAdminOrder = (order) => ({
  order: serializeOrder(order),
  buyerEmail: order.user?.email ?? "",
  releaseSlug: order.release?.slug ?? "",
  releaseId: order.releaseId ?? "",
  artistId: order.release?.artistId ?? "",
  artistWallet:
    order.artistWallet ?? order.release?.artist?.payoutWallet ?? "",
  artistIban: order.release?.artist?.payoutIban ?? "",
  artistIbanName: order.release?.artist?.payoutIbanName ?? "",
  paymentNote: order.paymentNote ?? "",
});

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const payload = adminLoginSchema.parse(req.body ?? {});
    if (!isValidAdminCredentials(payload.username, payload.password)) {
      res.status(401).json({ message: "Invalid admin credentials." });
      return;
    }

    res.json({
      token: issueAdminToken(payload.username),
      admin: { username: payload.username },
    });
  }),
);

router.get(
  "/orders/manual",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const orders = await prisma.order.findMany({
      where: {
        paymentMethod: "MANUAL",
        status: {
          in: ["UNDER_REVIEW", "PENDING_PAYMENT"],
        },
      },
      include: {
        user: { select: { email: true } },
        release: {
          select: {
            slug: true,
            artistId: true,
            artist: {
              select: {
                payoutWallet: true,
                payoutIban: true,
                payoutIbanName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    res.json({
      pending: orders.map(toAdminOrder),
      total: orders.length,
    });
  }),
);

router.post(
  "/orders/:orderId/approve",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      include: {
        release: { select: { artistId: true } },
      },
    });

    if (!order || order.paymentMethod !== "MANUAL") {
      res.status(404).json({ message: "Manual payment order not found." });
      return;
    }

    const approved = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "PAID",
        paymentNote: "Approved by admin after IBAN transfer verification.",
      },
      include: {
        user: { select: { email: true } },
        release: {
          select: {
            slug: true,
            artistId: true,
            artist: {
              select: {
                payoutWallet: true,
                payoutIban: true,
                payoutIbanName: true,
              },
            },
          },
        },
      },
    });

    if (order.release?.artistId) {
      await prisma.artistActivityLog.create({
        data: {
          artistId: order.release.artistId,
          actorUserId: null,
          entityType: "ORDER",
          action: "MANUAL_ORDER_APPROVED",
          detailsJson: JSON.stringify({
            orderId: order.id,
            approvedBy: req.admin.username,
            amount: order.totalAmount,
          }),
        },
      });
    }

    res.json({
      message: "Manual payment approved. Download access is now active for buyer.",
      item: toAdminOrder(approved),
    });
  }),
);

router.post(
  "/orders/:orderId/reject",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      include: {
        release: { select: { artistId: true } },
      },
    });

    if (!order || order.paymentMethod !== "MANUAL") {
      res.status(404).json({ message: "Manual payment order not found." });
      return;
    }

    const rejected = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "FAILED",
        paymentNote: "Rejected by admin. Transfer could not be verified.",
      },
      include: {
        user: { select: { email: true } },
        release: {
          select: {
            slug: true,
            artistId: true,
            artist: {
              select: {
                payoutWallet: true,
                payoutIban: true,
                payoutIbanName: true,
              },
            },
          },
        },
      },
    });

    if (order.release?.artistId) {
      await prisma.artistActivityLog.create({
        data: {
          artistId: order.release.artistId,
          actorUserId: null,
          entityType: "ORDER",
          action: "MANUAL_ORDER_REJECTED",
          detailsJson: JSON.stringify({
            orderId: order.id,
            rejectedBy: req.admin.username,
            amount: order.totalAmount,
          }),
        },
      });
    }

    res.json({
      message: "Manual payment rejected.",
      item: toAdminOrder(rejected),
    });
  }),
);

export { router as adminRouter };

