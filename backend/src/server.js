import path from "node:path";
import fs from "node:fs";
import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import { prisma } from "./lib/prisma.js";
import { authRouter } from "./routes/auth.js";
import { catalogRouter } from "./routes/catalog.js";
import { orderRouter } from "./routes/orders.js";
import { studioRouter } from "./routes/studio.js";
import { adminRouter } from "./routes/admin.js";

const app = express();
const rootDir = process.cwd();
const distDir = path.resolve(rootDir, "dist");
const distIndexPath = path.join(distDir, "index.html");
const hasFrontendBuild = fs.existsSync(distIndexPath);
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
const publicBaseUrl = (
  process.env.PUBLIC_BASE_URL ?? "https://wamm-hub.up.railway.app"
).replace(/\/$/, "");
const baseIndexHtml = hasFrontendBuild
  ? fs.readFileSync(distIndexPath, "utf8")
  : "";
const defaultSeo = {
  title: "WAMM HUB — Direct-to-Fan Music Platform",
  description:
    "Discover, stream, and buy music directly from independent artists. Artists keep 97%. Transparent fees.",
  url: `${publicBaseUrl}/`,
  image: `${publicBaseUrl}/favicon.ico`,
  type: "website",
};

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const toAbsoluteUrl = (value) => {
  if (!value) return defaultSeo.image;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `${publicBaseUrl}${value.startsWith("/") ? value : `/${value}`}`;
};

const upsertTag = (html, regex, tag) =>
  regex.test(html) ? html.replace(regex, tag) : html.replace("</head>", `${tag}\n</head>`);

const buildSeoHtml = (meta) => {
  let html = baseIndexHtml || fs.readFileSync(distIndexPath, "utf8");
  const title = escapeHtml(meta.title ?? defaultSeo.title);
  const description = escapeHtml(meta.description ?? defaultSeo.description);
  const url = escapeHtml(meta.url ?? defaultSeo.url);
  const image = escapeHtml(toAbsoluteUrl(meta.image ?? defaultSeo.image));
  const type = escapeHtml(meta.type ?? defaultSeo.type);

  html = html.replace(/<title>.*?<\/title>/i, `<title>${title}</title>`);
  html = upsertTag(
    html,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${description}" />`,
  );
  html = upsertTag(
    html,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${url}" />`,
  );
  html = upsertTag(
    html,
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${title}" />`,
  );
  html = upsertTag(
    html,
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${description}" />`,
  );
  html = upsertTag(
    html,
    /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:type" content="${type}" />`,
  );
  html = upsertTag(
    html,
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${url}" />`,
  );
  html = upsertTag(
    html,
    /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:image" content="${image}" />`,
  );
  html = upsertTag(
    html,
    /<meta\s+property="og:image:secure_url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:image:secure_url" content="${image}" />`,
  );
  html = upsertTag(
    html,
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${title}" />`,
  );
  html = upsertTag(
    html,
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${description}" />`,
  );
  html = upsertTag(
    html,
    /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:image" content="${image}" />`,
  );

  return html;
};

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(express.json({ limit: "20mb" }));

app.use(
  "/media",
  express.static(path.resolve(rootDir, "content"), {
    fallthrough: false,
    maxAge: "1d",
  }),
);

app.use(
  "/generated",
  express.static(path.resolve(rootDir, "public/generated"), {
    fallthrough: false,
    maxAge: "7d",
  }),
);

app.get("/api/health", async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok" });
  } catch (error) {
    next(error);
  }
});

app.use("/api/auth", authRouter);
app.use("/api", catalogRouter);
app.use("/api/orders", orderRouter);
app.use("/api/studio", studioRouter);
app.use("/api/__wamm_ctrl_9f4ad8", adminRouter);

if (hasFrontendBuild) {
  app.get("/release/:slug", async (req, res, next) => {
    if (req.method !== "GET") return next();
    const acceptsHtml = req.accepts(["html", "json"]) === "html";
    if (!acceptsHtml) return next();

    try {
      const release = await prisma.release.findUnique({
        where: { slug: req.params.slug },
        include: {
          artist: { select: { name: true } },
          tracks: {
            select: {
              coverArtUrl: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!release || !release.published || release.status !== "PUBLISHED") {
        res.sendFile(distIndexPath);
        return;
      }

      const releaseCover =
        release.coverArtUrl ||
        release.tracks.find((track) => Boolean(track.coverArtUrl))?.coverArtUrl ||
        defaultSeo.image;
      const meta = {
        title: `${release.title} — ${release.artist?.name ?? "Artist"} | WAMM HUB`,
        description:
          release.description ||
          `${release.title} by ${release.artist?.name ?? "Artist"} on WAMM HUB.`,
        url: `${publicBaseUrl}/release/${encodeURIComponent(release.slug)}`,
        image: releaseCover,
        type: "music.song",
      };

      res
        .status(200)
        .set("Content-Type", "text/html; charset=utf-8")
        .send(buildSeoHtml(meta));
    } catch (error) {
      next(error);
    }
  });

  app.use(
    express.static(distDir, {
      index: false,
      maxAge: "1h",
    }),
  );

  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    if (req.path.startsWith("/media/")) return next();
    if (req.path.startsWith("/generated/")) return next();
    if (req.method !== "GET") return next();

    const acceptsHtml = req.accepts(["html", "json"]) === "html";
    if (!acceptsHtml) return next();

    res
      .status(200)
      .set("Content-Type", "text/html; charset=utf-8")
      .send(buildSeoHtml(defaultSeo));
  });
}

app.use((req, res) => {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

app.use((error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      message: "Validation failed.",
      errors: error.flatten(),
    });
    return;
  }

  if (error?.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ message: "Uploaded file is too large." });
    return;
  }

  console.error(error);
  res.status(500).json({ message: "Unexpected server error." });
});

app.listen(port, () => {
  console.log(`WAMM server listening on http://localhost:${port}`);
});
