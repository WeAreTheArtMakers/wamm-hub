import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";
import { buildUniqueSlug, humanizeSlug, slugify } from "../lib/text.js";

const router = Router();

const registerSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  role: z.enum(["listener", "artist"]).default("listener"),
  artistName: z.string().trim().min(2).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const hashPassword = (input) =>
  crypto.createHash("sha256").update(input).digest("hex");

const toPublicUser = (user) => ({
  id: user.id,
  email: user.email,
  role: user.role === "ARTIST" ? "artist" : "listener",
});

const buildToken = (user) =>
  Buffer.from(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      role: user.role,
      iat: Date.now(),
    }),
  ).toString("base64url");

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
  "/register",
  asyncHandler(async (req, res) => {
    const payload = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({
      where: { email: payload.email },
    });

    if (existing) {
      res.status(409).json({ message: "A user with this email already exists." });
      return;
    }

    const user = await prisma.user.create({
      data: {
        email: payload.email,
        passwordHash: hashPassword(payload.password),
        role: payload.role === "artist" ? "ARTIST" : "LISTENER",
      },
    });

    if (payload.role === "artist") {
      const requestedArtistName =
        payload.artistName ||
        humanizeSlug(payload.email.split("@")[0] || "new-artist");
      const existingSlugs = (
        await prisma.artist.findMany({ select: { slug: true } })
      ).map((entry) => entry.slug);
      const uniqueSlug = buildUniqueSlug(requestedArtistName, (candidate) =>
        existingSlugs.includes(candidate),
      );

      await prisma.artist.create({
        data: {
          name: requestedArtistName,
          slug: uniqueSlug,
          bio: `${requestedArtistName} artist profile on WAMM`,
          location: "Independent",
          ownerUserId: user.id,
          verified: false,
          followers: 0,
          monthlyListeners: 0,
        },
      });
    }

    res.status(201).json({
      token: buildToken(user),
      user: toPublicUser(user),
    });
  }),
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const payload = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: payload.email } });

    if (!user || user.passwordHash !== hashPassword(payload.password)) {
      res.status(401).json({ message: "Invalid email or password." });
      return;
    }

    res.json({
      token: buildToken(user),
      user: toPublicUser(user),
    });
  }),
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        ownedArtist: {
          select: {
            id: true,
            name: true,
            slug: true,
            verified: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ message: "User not found." });
      return;
    }

    res.json({
      user: toPublicUser(user),
      artist: user.ownedArtist ?? null,
    });
  }),
);

export { router as authRouter };
