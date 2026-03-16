import crypto from "node:crypto";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME?.trim() || "adminwamm";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD?.trim() || "p3nc3r3l3r008231";
const ADMIN_TOKEN_SECRET =
  process.env.ADMIN_TOKEN_SECRET?.trim() ||
  process.env.AUTH_STATE_SECRET?.trim() ||
  process.env.AUTH_SECRET?.trim() ||
  "wamm-admin-secret";
const ADMIN_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const signPayload = (payload) => {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", ADMIN_TOKEN_SECRET)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
};

const verifyPayload = (token) => {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [encoded, signature] = token.split(".", 2);
  if (!encoded || !signature) return null;
  const expected = crypto
    .createHmac("sha256", ADMIN_TOKEN_SECRET)
    .update(encoded)
    .digest("base64url");
  if (signature !== expected) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object") return null;
    if (payload.role !== "admin") return null;
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
};

export const isValidAdminCredentials = (username, password) =>
  username === ADMIN_USERNAME && password === ADMIN_PASSWORD;

export const issueAdminToken = (username) =>
  signPayload({
    role: "admin",
    sub: username,
    iat: Date.now(),
    exp: Date.now() + ADMIN_TOKEN_TTL_MS,
  });

const getBearerToken = (req) => {
  const header = req.headers.authorization;
  if (!header) return null;
  const [type, token] = header.split(" ");
  if (type !== "Bearer" || !token) return null;
  return token;
};

export const requireAdmin = (req, res, next) => {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ message: "Admin authentication required." });
    return;
  }

  const payload = verifyPayload(token);
  if (!payload) {
    res.status(401).json({ message: "Invalid admin token." });
    return;
  }

  req.admin = {
    username: String(payload.sub || ADMIN_USERNAME),
  };
  next();
};

