import { prisma } from "./prisma.js";

const parseToken = (token) => {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const payload = JSON.parse(decoded);
    if (!payload || typeof payload !== "object") return null;
    return payload;
  } catch {
    return null;
  }
};

export const getTokenFromRequest = (req) => {
  const header = req.headers.authorization;
  if (!header) return null;
  const [type, token] = header.split(" ");
  if (type !== "Bearer" || !token) return null;
  return token;
};

export const requireAuth = async (req, res, next) => {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ message: "Authentication required." });
    return;
  }

  const payload = parseToken(token);
  if (!payload?.sub) {
    res.status(401).json({ message: "Invalid token." });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
  });

  if (!user) {
    res.status(401).json({ message: "User not found." });
    return;
  }

  req.user = {
    id: user.id,
    email: user.email,
    role: user.role,
  };
  next();
};

export const requireArtist = async (req, res, next) => {
  await requireAuth(req, res, async () => {
    if (!req.user || req.user.role !== "ARTIST") {
      res.status(403).json({ message: "Artist account required." });
      return;
    }

    const artist = await prisma.artist.findFirst({
      where: { ownerUserId: req.user.id },
    });

    if (!artist) {
      res.status(403).json({
        message:
          "Artist profile not found. Complete registration as an artist first.",
      });
      return;
    }

    req.artist = artist;
    next();
  });
};

export const authOptional = async (req, _res, next) => {
  const token = getTokenFromRequest(req);
  if (!token) {
    next();
    return;
  }
  const payload = parseToken(token);
  if (!payload?.sub) {
    next();
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    next();
    return;
  }
  req.user = {
    id: user.id,
    email: user.email,
    role: user.role,
  };
  next();
};
