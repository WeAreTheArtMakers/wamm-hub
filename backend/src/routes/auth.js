import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";
import { buildUniqueSlug, humanizeSlug } from "../lib/text.js";

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

const authStateSecret =
  process.env.AUTH_STATE_SECRET ?? process.env.AUTH_SECRET ?? "wamm-hub-auth-state";

const createPkcePair = () => {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
};

const buildApiBaseUrl = () =>
  (
    process.env.PUBLIC_BASE_URL ??
    `http://localhost:${process.env.PORT ?? process.env.API_PORT ?? 3001}`
  ).replace(/\/$/, "");

const buildFrontendBaseUrl = () =>
  (
    process.env.FRONTEND_BASE_URL ??
    process.env.PUBLIC_BASE_URL ??
    "http://localhost:8080"
  ).replace(/\/$/, "");

const DEFAULT_GOOGLE_CLIENT_ID =
  "535808035791-333ln95k5jb6upmvsi99tmvflm0c11ue.apps.googleusercontent.com";

const getGoogleConfig = () => {
  const clientId =
    process.env.GOOGLE_CLIENT_ID?.trim() || DEFAULT_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || "";
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI?.trim() ||
    `${buildApiBaseUrl()}/api/auth/google/callback`;

  if (!clientId) return null;
  return {
    clientId,
    clientSecret,
    redirectUri,
    usePkce: clientSecret.length === 0,
  };
};

const sanitizeReturnTo = (candidate) => {
  if (typeof candidate !== "string" || !candidate.trim()) return "/auth/success";
  if (!candidate.startsWith("/")) return "/auth/success";
  if (candidate.startsWith("//")) return "/auth/success";
  return candidate;
};

const signState = (payload) => {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", authStateSecret)
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
};

const parseState = (value) => {
  if (typeof value !== "string" || !value.includes(".")) return null;
  const [encodedPayload, signature] = value.split(".", 2);
  if (!encodedPayload || !signature) return null;
  const expectedSignature = crypto
    .createHmac("sha256", authStateSecret)
    .update(encodedPayload)
    .digest("base64url");
  if (signature !== expectedSignature) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
};

const appendQuery = (path, params) => {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${params.toString()}`;
};

const redirectToLoginWithError = (res, message) => {
  const frontendBaseUrl = buildFrontendBaseUrl();
  const params = new URLSearchParams({ error: message });
  res.redirect(`${frontendBaseUrl}/login?${params.toString()}`);
};

router.get(
  "/google/start",
  asyncHandler(async (req, res) => {
    const googleConfig = getGoogleConfig();
    if (!googleConfig) {
      res
        .status(503)
        .json({ message: "Google authentication is not configured yet." });
      return;
    }

    const returnTo = sanitizeReturnTo(req.query.returnTo);
    const pkce = googleConfig.usePkce ? createPkcePair() : null;
    const state = signState({
      returnTo,
      nonce: crypto.randomBytes(8).toString("hex"),
      iat: Date.now(),
      pkceVerifier: pkce?.verifier ?? null,
    });

    const authParams = new URLSearchParams({
      client_id: googleConfig.clientId,
      redirect_uri: googleConfig.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
      state,
    });
    if (pkce) {
      authParams.set("code_challenge_method", "S256");
      authParams.set("code_challenge", pkce.challenge);
    }

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${authParams}`);
  }),
);

router.get(
  "/google/callback",
  asyncHandler(async (req, res) => {
    const googleConfig = getGoogleConfig();
    if (!googleConfig) {
      redirectToLoginWithError(res, "Google authentication is not configured.");
      return;
    }

    if (typeof req.query.error === "string") {
      redirectToLoginWithError(res, "Google sign-in was cancelled.");
      return;
    }

    const code = typeof req.query.code === "string" ? req.query.code : "";
    const statePayload = parseState(req.query.state);
    if (!code || !statePayload) {
      redirectToLoginWithError(res, "Google sign-in failed (invalid callback).");
      return;
    }

    const returnTo = sanitizeReturnTo(statePayload.returnTo);

    const tokenRequestBody = new URLSearchParams({
      code,
      client_id: googleConfig.clientId,
      redirect_uri: googleConfig.redirectUri,
      grant_type: "authorization_code",
    });
    if (googleConfig.clientSecret) {
      tokenRequestBody.set("client_secret", googleConfig.clientSecret);
    }
    if (googleConfig.usePkce) {
      const pkceVerifier =
        typeof statePayload.pkceVerifier === "string"
          ? statePayload.pkceVerifier
          : "";
      if (!pkceVerifier) {
        redirectToLoginWithError(res, "Google sign-in failed (missing PKCE verifier).");
        return;
      }
      tokenRequestBody.set("code_verifier", pkceVerifier);
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenRequestBody,
    });

    if (!tokenResponse.ok) {
      redirectToLoginWithError(res, "Google token exchange failed.");
      return;
    }

    const tokenPayload = await tokenResponse.json();
    const accessToken =
      tokenPayload && typeof tokenPayload.access_token === "string"
        ? tokenPayload.access_token
        : "";
    if (!accessToken) {
      redirectToLoginWithError(res, "Google access token is missing.");
      return;
    }

    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!userInfoResponse.ok) {
      redirectToLoginWithError(res, "Failed to load Google user profile.");
      return;
    }

    const profile = await userInfoResponse.json();
    const email = typeof profile.email === "string" ? profile.email.trim() : "";
    if (!email) {
      redirectToLoginWithError(res, "Google account email not available.");
      return;
    }

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const fallbackSecret = `${profile.sub ?? email}:${Date.now()}`;
      user = await prisma.user.create({
        data: {
          email,
          passwordHash: hashPassword(`google:${fallbackSecret}`),
          role: "LISTENER",
        },
      });
    }

    const frontendBaseUrl = buildFrontendBaseUrl();
    const publicUser = toPublicUser(user);
    const params = new URLSearchParams({
      token: buildToken(user),
      id: publicUser.id,
      email: publicUser.email,
      role: publicUser.role,
      provider: "google",
    });
    res.redirect(`${frontendBaseUrl}${appendQuery(returnTo, params)}`);
  }),
);

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
