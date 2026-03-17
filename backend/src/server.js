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
  title: "WAMM HUB — Independent Music Marketplace",
  description:
    "Discover, stream, and buy music directly from independent artists on WAMM HUB.",
  url: `${publicBaseUrl}/`,
  image: `${publicBaseUrl}/favicon.ico`,
  type: "website",
  robots: "index,follow,max-image-preview:large",
  keywords:
    "independent music, music marketplace, direct to fan, buy music, stream music, WAMM HUB",
  twitterCard: "summary_large_image",
  imageAlt: "WAMM HUB",
};

const publishedReleaseWhere = {
  published: true,
  status: "PUBLISHED",
};

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const escapeXml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const normalizePathname = (value) => {
  const raw = String(value || "/").split("?")[0].split("#")[0] || "/";
  const withLeading = raw.startsWith("/") ? raw : `/${raw}`;
  if (withLeading === "/") return "/";
  return withLeading.replace(/\/+$/, "");
};

const toCanonicalUrl = (pathname) => {
  const normalized = normalizePathname(pathname);
  return `${publicBaseUrl}${normalized === "/" ? "/" : normalized}`;
};

const toAbsoluteUrl = (value) => {
  if (!value) return defaultSeo.image;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `${publicBaseUrl}${value.startsWith("/") ? value : `/${value}`}`;
};

const cleanText = (value, maxLength = 180) => {
  const trimmed = String(value || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength - 1)}…`;
};

const asDateIso = (value) => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
};

const uniqueJoinKeywords = (parts) => {
  const seen = new Set();
  const cleaned = [];
  for (const part of parts) {
    const value = cleanText(part, 64);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(value);
  }
  return cleaned.join(", ");
};

const upsertTag = (html, regex, tag) =>
  regex.test(html) ? html.replace(regex, tag) : html.replace("</head>", `${tag}\n</head>`);

const removeManagedJsonLd = (html) =>
  html.replace(
    /<script\s+id="wamm-jsonld"\s+type="application\/ld\+json">[\s\S]*?<\/script>\s*/gi,
    "",
  );

const serializeJsonLd = (payload) =>
  JSON.stringify(payload).replace(/</g, "\\u003c").replace(/-->/g, "--\\>");

const buildBaseJsonLd = () => [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${publicBaseUrl}/#website`,
    name: "WAMM HUB",
    url: `${publicBaseUrl}/`,
    potentialAction: {
      "@type": "SearchAction",
      target: `${publicBaseUrl}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${publicBaseUrl}/#organization`,
    name: "We Are Music Makers (WAMM)",
    url: `${publicBaseUrl}/`,
    logo: `${publicBaseUrl}/favicon.ico`,
  },
];

const buildSeoHtml = (meta = {}) => {
  let html = baseIndexHtml || fs.readFileSync(distIndexPath, "utf8");
  const pathname = normalizePathname(meta.pathname || "/");
  const title = escapeHtml(meta.title ?? defaultSeo.title);
  const description = escapeHtml(meta.description ?? defaultSeo.description);
  const url = escapeHtml(meta.url ?? toCanonicalUrl(pathname));
  const image = escapeHtml(toAbsoluteUrl(meta.image ?? defaultSeo.image));
  const type = escapeHtml(meta.type ?? defaultSeo.type);
  const robots = escapeHtml(meta.robots ?? defaultSeo.robots);
  const keywords = escapeHtml(meta.keywords ?? defaultSeo.keywords);
  const twitterCard = escapeHtml(meta.twitterCard ?? defaultSeo.twitterCard);
  const imageAlt = escapeHtml(meta.imageAlt ?? defaultSeo.imageAlt);

  const customJsonLd = Array.isArray(meta.jsonLd)
    ? meta.jsonLd
    : meta.jsonLd
      ? [meta.jsonLd]
      : [];
  const jsonLdPayload = [
    ...(meta.includeBaseJsonLd === false ? [] : buildBaseJsonLd()),
    ...customJsonLd,
  ];

  html = html.replace(/<title>.*?<\/title>/i, `<title>${title}</title>`);
  html = upsertTag(
    html,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${description}" />`,
  );
  html = upsertTag(
    html,
    /<meta\s+name="keywords"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="keywords" content="${keywords}" />`,
  );
  html = upsertTag(
    html,
    /<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="robots" content="${robots}" />`,
  );
  html = upsertTag(
    html,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${url}" />`,
  );
  html = upsertTag(
    html,
    /<meta\s+property="og:site_name"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:site_name" content="WAMM HUB" />`,
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
    /<meta\s+property="og:image:alt"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:image:alt" content="${imageAlt}" />`,
  );
  html = upsertTag(
    html,
    /<meta\s+name="twitter:card"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:card" content="${twitterCard}" />`,
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

  html = removeManagedJsonLd(html);
  if (jsonLdPayload.length > 0) {
    html = upsertTag(
      html,
      /<script\s+id="wamm-jsonld"\s+type="application\/ld\+json">[\s\S]*?<\/script>/i,
      `<script id="wamm-jsonld" type="application/ld+json">${serializeJsonLd(jsonLdPayload)}</script>`,
    );
  }

  return html;
};

const acceptsHtmlRequest = (req) =>
  req.method === "GET" && req.accepts(["html", "json"]) === "html";

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(express.json({ limit: "20mb" }));

app.get("/robots.txt", (_req, res) => {
  res
    .status(200)
    .type("text/plain")
    .send(
      [
        "User-agent: *",
        "Allow: /",
        "Disallow: /studio",
        "Disallow: /login",
        "Disallow: /register",
        "Disallow: /auth/success",
        "Disallow: /__wamm-console-9f4ad8",
        `Sitemap: ${publicBaseUrl}/sitemap.xml`,
      ].join("\n"),
    );
});

app.get("/sitemap.xml", async (_req, res, next) => {
  try {
    const [releases, artists] = await Promise.all([
      prisma.release.findMany({
        where: publishedReleaseWhere,
        select: {
          slug: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.artist.findMany({
        where: {
          releases: {
            some: publishedReleaseWhere,
          },
        },
        select: {
          slug: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    const urls = [
      {
        loc: toCanonicalUrl("/"),
        changefreq: "daily",
        priority: "1.0",
      },
      {
        loc: toCanonicalUrl("/discover"),
        changefreq: "daily",
        priority: "0.9",
      },
      {
        loc: toCanonicalUrl("/releases"),
        changefreq: "daily",
        priority: "0.9",
      },
      {
        loc: toCanonicalUrl("/artists"),
        changefreq: "daily",
        priority: "0.8",
      },
      ...releases.map((release) => ({
        loc: toCanonicalUrl(`/release/${encodeURIComponent(release.slug)}`),
        lastmod: asDateIso(release.updatedAt),
        changefreq: "weekly",
        priority: "0.8",
      })),
      ...artists.map((artist) => ({
        loc: toCanonicalUrl(`/artist/${encodeURIComponent(artist.slug)}`),
        lastmod: asDateIso(artist.updatedAt),
        changefreq: "weekly",
        priority: "0.7",
      })),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map(
        (item) =>
          `  <url>\n    <loc>${escapeXml(item.loc)}</loc>${
            item.lastmod ? `\n    <lastmod>${escapeXml(item.lastmod)}</lastmod>` : ""
          }\n    <changefreq>${item.changefreq}</changefreq>\n    <priority>${item.priority}</priority>\n  </url>`,
      )
      .join("\n")}\n</urlset>`;

    res.status(200).type("application/xml").send(xml);
  } catch (error) {
    next(error);
  }
});

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
    if (!acceptsHtmlRequest(req)) return next();

    try {
      const release = await prisma.release.findUnique({
        where: { slug: req.params.slug },
        include: {
          artist: { select: { name: true, slug: true } },
          genres: {
            include: {
              genre: {
                select: { name: true },
              },
            },
          },
          tracks: {
            where: {
              isVisible: true,
            },
            select: {
              title: true,
              coverArtUrl: true,
              duration: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!release || !release.published || release.status !== "PUBLISHED") {
        res.sendFile(distIndexPath);
        return;
      }

      const artistName = release.artist?.name ?? "Artist";
      const releaseCover =
        release.coverArtUrl ||
        release.tracks.find((track) => Boolean(track.coverArtUrl))?.coverArtUrl ||
        defaultSeo.image;
      const genreNames = release.genres.map((entry) => entry.genre.name).filter(Boolean);
      const trackTitles = release.tracks.map((track) => track.title).filter(Boolean);
      const description =
        cleanText(release.description, 170) ||
        cleanText(
          `${release.title} by ${artistName}. ${release.tracks.length} track${
            release.tracks.length === 1 ? "" : "s"
          } available on WAMM HUB.`,
          170,
        );
      const pathname = `/release/${encodeURIComponent(release.slug)}`;
      const url = toCanonicalUrl(pathname);
      const artistUrl = release.artist?.slug
        ? toCanonicalUrl(`/artist/${encodeURIComponent(release.artist.slug)}`)
        : undefined;

      const musicAlbumSchema = {
        "@context": "https://schema.org",
        "@type": "MusicAlbum",
        "@id": `${url}#release`,
        name: release.title,
        url,
        image: [toAbsoluteUrl(releaseCover)],
        description,
        datePublished: asDateIso(release.releaseDate),
        numTracks: release.tracks.length,
        genre: genreNames,
        byArtist: {
          "@type": "MusicGroup",
          name: artistName,
          ...(artistUrl ? { url: artistUrl } : {}),
        },
        track: release.tracks.map((track, index) => ({
          "@type": "MusicRecording",
          position: index + 1,
          name: track.title,
          duration: track.duration ? `PT${Math.max(1, track.duration)}S` : undefined,
          url,
        })),
        offers: {
          "@type": "Offer",
          price: Number(release.price).toFixed(2),
          priceCurrency: release.currency || "USD",
          availability: "https://schema.org/InStock",
          url,
        },
      };

      const breadcrumbSchema = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: toCanonicalUrl("/"),
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Releases",
            item: toCanonicalUrl("/releases"),
          },
          {
            "@type": "ListItem",
            position: 3,
            name: release.title,
            item: url,
          },
        ],
      };

      const meta = {
        title: `${release.title} — ${artistName} | WAMM HUB`,
        description,
        pathname,
        image: releaseCover,
        imageAlt: `${release.title} cover artwork`,
        type: "music.album",
        keywords: uniqueJoinKeywords([
          release.title,
          artistName,
          ...genreNames,
          ...trackTitles,
          "buy music",
          "stream music",
          "independent artist",
          "WAMM HUB",
        ]),
        jsonLd: [musicAlbumSchema, breadcrumbSchema],
      };

      res
        .status(200)
        .set("Content-Type", "text/html; charset=utf-8")
        .send(buildSeoHtml(meta));
    } catch (error) {
      next(error);
    }
  });

  app.get("/artist/:slug", async (req, res, next) => {
    if (!acceptsHtmlRequest(req)) return next();

    try {
      const artist = await prisma.artist.findUnique({
        where: { slug: req.params.slug },
        include: {
          genres: {
            include: {
              genre: {
                select: { name: true },
              },
            },
          },
          releases: {
            where: publishedReleaseWhere,
            select: {
              title: true,
              slug: true,
              coverArtUrl: true,
              releaseDate: true,
            },
            orderBy: [{ releaseDate: "desc" }, { createdAt: "desc" }],
            take: 20,
          },
          _count: {
            select: {
              tracks: true,
              releases: true,
            },
          },
        },
      });

      if (!artist) {
        res.sendFile(distIndexPath);
        return;
      }

      const pathname = `/artist/${encodeURIComponent(artist.slug)}`;
      const url = toCanonicalUrl(pathname);
      const genreNames = artist.genres.map((entry) => entry.genre.name).filter(Boolean);
      const image =
        artist.bannerUrl ||
        artist.avatarUrl ||
        artist.releases.find((release) => Boolean(release.coverArtUrl))?.coverArtUrl ||
        defaultSeo.image;
      const description =
        cleanText(artist.bio, 170) ||
        cleanText(
          `${artist.name} on WAMM HUB. ${artist.releases.length} published release${
            artist.releases.length === 1 ? "" : "s"
          } and ${artist._count.tracks} track${artist._count.tracks === 1 ? "" : "s"}.`,
          170,
        );

      const artistSchema = {
        "@context": "https://schema.org",
        "@type": "MusicGroup",
        "@id": `${url}#artist`,
        name: artist.name,
        url,
        description,
        image: [toAbsoluteUrl(image)],
        genre: genreNames,
        album: artist.releases.map((release) =>
          toCanonicalUrl(`/release/${encodeURIComponent(release.slug)}`),
        ),
      };

      const artistReleasesListSchema = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: `${artist.name} releases`,
        itemListElement: artist.releases.map((release, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: toCanonicalUrl(`/release/${encodeURIComponent(release.slug)}`),
          name: release.title,
        })),
      };

      const meta = {
        title: `${artist.name} — Music, Releases, Tracks | WAMM HUB`,
        description,
        pathname,
        image,
        imageAlt: `${artist.name} artist profile`,
        type: "profile",
        keywords: uniqueJoinKeywords([
          artist.name,
          ...genreNames,
          ...artist.releases.map((release) => release.title),
          "independent artist",
          "music releases",
          "WAMM HUB",
        ]),
        jsonLd: [artistSchema, artistReleasesListSchema],
      };

      res
        .status(200)
        .set("Content-Type", "text/html; charset=utf-8")
        .send(buildSeoHtml(meta));
    } catch (error) {
      next(error);
    }
  });

  app.get(["/releases", "/discover"], async (req, res, next) => {
    if (!acceptsHtmlRequest(req)) return next();

    try {
      const releases = await prisma.release.findMany({
        where: publishedReleaseWhere,
        include: {
          artist: {
            select: {
              name: true,
            },
          },
          genres: {
            include: {
              genre: {
                select: { name: true },
              },
            },
          },
        },
        orderBy: [{ releaseDate: "desc" }, { createdAt: "desc" }],
        take: 30,
      });

      const pathname = normalizePathname(req.path);
      const topTitles = releases.slice(0, 5).map((release) => release.title).filter(Boolean);
      const meta = {
        title:
          pathname === "/discover"
            ? "Discover Music — New Independent Releases | WAMM HUB"
            : "Latest Music Releases | WAMM HUB",
        description: cleanText(
          topTitles.length
            ? `Discover new independent releases on WAMM HUB. Featured now: ${topTitles.join(", ")}.`
            : "Discover new independent music releases on WAMM HUB.",
          170,
        ),
        pathname,
        type: "website",
        keywords: uniqueJoinKeywords([
          "latest releases",
          "discover music",
          "independent music",
          ...topTitles,
          ...releases.flatMap((release) => release.genres.map((entry) => entry.genre.name)),
          "WAMM HUB",
        ]),
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Latest releases on WAMM HUB",
          itemListElement: releases.map((release, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: toCanonicalUrl(`/release/${encodeURIComponent(release.slug)}`),
            name: `${release.title} — ${release.artist?.name ?? "Artist"}`,
          })),
        },
      };

      res
        .status(200)
        .set("Content-Type", "text/html; charset=utf-8")
        .send(buildSeoHtml(meta));
    } catch (error) {
      next(error);
    }
  });

  app.get("/artists", async (req, res, next) => {
    if (!acceptsHtmlRequest(req)) return next();

    try {
      const artists = await prisma.artist.findMany({
        where: {
          releases: {
            some: publishedReleaseWhere,
          },
        },
        include: {
          genres: {
            include: {
              genre: {
                select: { name: true },
              },
            },
          },
          _count: {
            select: {
              releases: true,
              tracks: true,
            },
          },
        },
        orderBy: [{ followers: "desc" }, { monthlyListeners: "desc" }],
        take: 40,
      });

      const topArtists = artists.slice(0, 6).map((artist) => artist.name).filter(Boolean);
      const meta = {
        title: "Independent Artists | WAMM HUB",
        description: cleanText(
          topArtists.length
            ? `Explore independent artists on WAMM HUB, including ${topArtists.join(", ")}.`
            : "Explore independent artists on WAMM HUB.",
          170,
        ),
        pathname: "/artists",
        type: "website",
        keywords: uniqueJoinKeywords([
          "independent artists",
          "music artists",
          ...topArtists,
          ...artists.flatMap((artist) => artist.genres.map((entry) => entry.genre.name)),
          "WAMM HUB",
        ]),
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Artists on WAMM HUB",
          itemListElement: artists.map((artist, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: toCanonicalUrl(`/artist/${encodeURIComponent(artist.slug)}`),
            name: artist.name,
          })),
        },
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
    if (!acceptsHtmlRequest(req)) return next();

    const pathname = normalizePathname(req.path);
    const exactIndexable = new Set(["/", "/discover", "/releases", "/artists"]);
    const prefixIndexable = ["/release/", "/artist/"];
    const isIndexable =
      exactIndexable.has(pathname) || prefixIndexable.some((prefix) => pathname.startsWith(prefix));

    const meta = isIndexable
      ? { pathname }
      : {
          title: "WAMM HUB",
          description: defaultSeo.description,
          pathname,
          robots: "noindex,nofollow,noarchive",
          includeBaseJsonLd: false,
        };

    res
      .status(200)
      .set("Content-Type", "text/html; charset=utf-8")
      .send(buildSeoHtml(meta));
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

  const statusCode = Number(error?.statusCode ?? error?.status);
  if (Number.isFinite(statusCode) && statusCode >= 400 && statusCode < 500) {
    if (statusCode === 404) {
      res.status(404).json({ message: "Resource not found." });
      return;
    }
    res.status(statusCode).json({
      message: error?.message || "Request failed.",
    });
    return;
  }

  console.error(error);
  res.status(500).json({ message: "Unexpected server error." });
});

app.listen(port, () => {
  console.log(`WAMM server listening on http://localhost:${port}`);
});
