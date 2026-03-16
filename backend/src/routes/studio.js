import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { parseFile } from "music-metadata";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireArtist } from "../lib/auth.js";
import {
  CONTENT_ROOT,
  GENERATED_COVERS_ROOT,
  createSyntheticWaveform,
  ensureDirectory,
  toMediaUrl,
} from "../lib/content.js";
import { serializeRelease, serializeTrack } from "../lib/serializers.js";
import { humanizeSlug, slugify } from "../lib/text.js";

const router = Router();
const uploadTmpDir = path.resolve(process.cwd(), "tmp/uploads");
const studioStorageRoot = path.join(CONTENT_ROOT, "uploads");

const upload = multer({
  dest: uploadTmpDir,
  limits: {
    fileSize: 250 * 1024 * 1024,
  },
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

const extFromMime = (mimeType) => {
  const value = String(mimeType || "").toLowerCase();
  if (value.includes("png")) return "png";
  if (value.includes("webp")) return "webp";
  return "jpg";
};

const moveFile = async (sourcePath, destinationPath) => {
  await ensureDirectory(path.dirname(destinationPath));
  try {
    await fs.rename(sourcePath, destinationPath);
  } catch {
    await fs.copyFile(sourcePath, destinationPath);
    await fs.unlink(sourcePath);
  }
};

const parseTrackMetadata = async (filePath) => {
  try {
    const metadata = await parseFile(filePath, { duration: true, skipCovers: false });
    return {
      title: metadata.common.title || "",
      genre: metadata.common.genre?.[0] || "",
      bpm:
        typeof metadata.common.bpm === "number"
          ? Math.round(metadata.common.bpm)
          : undefined,
      key:
        typeof metadata.common.key === "string" ? metadata.common.key : undefined,
      duration: Math.max(1, Math.round(metadata.format.duration || 0)),
      picture: metadata.common.picture?.[0] ?? null,
    };
  } catch {
    return {
      title: "",
      genre: "",
      bpm: undefined,
      key: undefined,
      duration: 0,
      picture: null,
    };
  }
};

const getUniqueReleaseSlug = async (baseSlug) => {
  const base = slugify(baseSlug);
  let candidate = base;
  let i = 2;
  while (await prisma.release.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${i}`;
    i += 1;
  }
  return candidate;
};

router.get(
  "/dashboard",
  requireArtist,
  asyncHandler(async (req, res) => {
    const artist = req.artist;
    const [releases, orders] = await Promise.all([
      prisma.release.findMany({
        where: { artistId: artist.id },
        include: {
          artist: { select: { id: true, name: true, slug: true } },
          genres: { include: { genre: true } },
          tracks: {
            include: {
              artist: { select: { id: true, name: true, slug: true } },
              genre: { select: { name: true } },
              comments: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.order.findMany({
        where: {
          release: { artistId: artist.id },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    res.json({
      artist: {
        id: artist.id,
        name: artist.name,
        slug: artist.slug,
      },
      releases: releases.map(serializeRelease),
      recentOrders: orders,
    });
  }),
);

router.post(
  "/releases",
  requireArtist,
  upload.fields([
    { name: "tracks", maxCount: 20 },
    { name: "cover", maxCount: 1 },
  ]),
  asyncHandler(async (req, res) => {
    await ensureDirectory(uploadTmpDir);
    await ensureDirectory(studioStorageRoot);
    await ensureDirectory(GENERATED_COVERS_ROOT);

    const artist = req.artist;
    const filesByField = req.files ?? {};
    const trackFiles = filesByField.tracks ?? [];
    const coverUpload = filesByField.cover?.[0] ?? null;

    if (!trackFiles.length) {
      res.status(400).json({ message: "At least one track file is required." });
      return;
    }

    const title = String(req.body?.title || "").trim();
    if (!title) {
      res.status(400).json({ message: "Release title is required." });
      return;
    }

    const releaseSlug = await getUniqueReleaseSlug(title);
    const releaseType =
      req.body?.type === "EP" || req.body?.type === "ALBUM"
        ? req.body.type
        : trackFiles.length > 1
          ? "ALBUM"
          : "SINGLE";
    const releasePrice = Number(req.body?.price ?? trackFiles.length * 0.99);
    const publishNow = String(req.body?.publish || "").toLowerCase() === "true";
    const releaseGenres = String(req.body?.genres || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    let releaseCoverUrl = "";
    if (coverUpload) {
      const ext =
        path.extname(coverUpload.originalname).replace(".", "").toLowerCase() ||
        extFromMime(coverUpload.mimetype);
      const coverFileName = `${artist.slug}-${releaseSlug}.${ext}`;
      const coverPath = path.join(GENERATED_COVERS_ROOT, coverFileName);
      await moveFile(coverUpload.path, coverPath);
      releaseCoverUrl = `/generated/covers/${coverFileName}`;
    }

    const releaseId = `release_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const createdTrackIds = [];

    await prisma.release.create({
      data: {
        id: releaseId,
        artistId: artist.id,
        title,
        slug: releaseSlug,
        type: releaseType,
        status: publishNow ? "PUBLISHED" : "DRAFT",
        published: publishNow,
        coverArtUrl: releaseCoverUrl,
        description: String(req.body?.description || `${title} by ${artist.name}`),
        price: Number.isFinite(releasePrice) && releasePrice > 0 ? releasePrice : 0.99,
        currency: String(req.body?.currency || "USD").toUpperCase(),
        isForSale: true,
        sourceRepo: "artist-upload",
        releaseDate: new Date(),
        featured: false,
      },
    });

    for (let i = 0; i < releaseGenres.length; i += 1) {
      const genreName = releaseGenres[i];
      const genre = await prisma.genre.upsert({
        where: { name: genreName },
        update: {},
        create: { name: genreName },
      });
      await prisma.releaseGenre.upsert({
        where: { releaseId_genreId: { releaseId, genreId: genre.id } },
        update: {},
        create: { releaseId, genreId: genre.id },
      });
    }

    const releaseTrackRoot = path.join(
      studioStorageRoot,
      artist.slug,
      "releases",
      releaseSlug,
      "tracks",
    );
    await ensureDirectory(releaseTrackRoot);

    for (let i = 0; i < trackFiles.length; i += 1) {
      const file = trackFiles[i];
      const sourceExt = path.extname(file.originalname).toLowerCase() || ".mp3";
      const trackBaseName = path.basename(file.originalname, sourceExt);
      const trackSlug = slugify(trackBaseName || `track-${i + 1}`);
      const trackTitle = humanizeSlug(trackBaseName || `track-${i + 1}`);
      const trackDir = path.join(releaseTrackRoot, trackSlug);
      await ensureDirectory(trackDir);

      const originalFileName = `original${sourceExt}`;
      const originalPath = path.join(trackDir, originalFileName);
      await moveFile(file.path, originalPath);

      const metadata = await parseTrackMetadata(originalPath);
      let trackCoverUrl = releaseCoverUrl;

      if (!trackCoverUrl && metadata.picture?.data?.length) {
        const ext = extFromMime(metadata.picture.format);
        const coverFileName = `${artist.slug}-${releaseSlug}-${trackSlug}.${ext}`;
        const coverPath = path.join(GENERATED_COVERS_ROOT, coverFileName);
        await fs.writeFile(coverPath, metadata.picture.data);
        trackCoverUrl = `/generated/covers/${coverFileName}`;
      }

      if (!releaseCoverUrl && trackCoverUrl) {
        releaseCoverUrl = trackCoverUrl;
      }

      const inferredGenre =
        metadata.genre ||
        releaseGenres[0] ||
        String(req.body?.genre || "Electronic");
      const genre = await prisma.genre.upsert({
        where: { name: inferredGenre },
        update: {},
        create: { name: inferredGenre },
      });
      await prisma.artistGenre.upsert({
        where: { artistId_genreId: { artistId: artist.id, genreId: genre.id } },
        update: {},
        create: { artistId: artist.id, genreId: genre.id },
      });

      const trackId = `track_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
      await prisma.track.create({
        data: {
          id: trackId,
          artistId: artist.id,
          releaseId,
          title: metadata.title || trackTitle,
          coverArtUrl: trackCoverUrl,
          audioUrl: toMediaUrl(originalPath),
          previewUrl: toMediaUrl(originalPath),
          highQualityUrl: toMediaUrl(originalPath),
          originalUrl: toMediaUrl(originalPath),
          duration: metadata.duration || 30,
          bpm: metadata.bpm,
          keySignature: metadata.key,
          genreId: genre.id,
          waveformJson: JSON.stringify(createSyntheticWaveform(i + 1)),
          price: Number(req.body?.trackPrice ?? 0.99),
          currency: String(req.body?.currency || "USD").toUpperCase(),
          isForSale: true,
          sourcePath: path.relative(process.cwd(), originalPath),
          createdAt: new Date(),
        },
      });
      createdTrackIds.push(trackId);
    }

    if (releaseCoverUrl) {
      await prisma.release.update({
        where: { id: releaseId },
        data: { coverArtUrl: releaseCoverUrl },
      });
    }

    const createdRelease = await prisma.release.findUnique({
      where: { id: releaseId },
      include: {
        artist: { select: { id: true, name: true, slug: true } },
        genres: { include: { genre: true } },
        tracks: {
          where: { id: { in: createdTrackIds } },
          include: {
            artist: { select: { id: true, name: true, slug: true } },
            genre: { select: { name: true } },
            comments: true,
          },
        },
      },
    });

    res.status(201).json({
      message: "Release uploaded successfully.",
      release: serializeRelease(createdRelease),
      tracks: createdRelease.tracks.map(serializeTrack),
    });
  }),
);

router.post(
  "/releases/:releaseId/publish",
  requireArtist,
  asyncHandler(async (req, res) => {
    const artist = req.artist;
    const release = await prisma.release.findUnique({
      where: { id: req.params.releaseId },
    });

    if (!release || release.artistId !== artist.id) {
      res.status(404).json({ message: "Release not found." });
      return;
    }

    const updated = await prisma.release.update({
      where: { id: release.id },
      data: {
        status: "PUBLISHED",
        published: true,
        releaseDate: release.releaseDate ?? new Date(),
      },
      include: {
        artist: { select: { id: true, name: true, slug: true } },
        genres: { include: { genre: true } },
        tracks: {
          include: {
            artist: { select: { id: true, name: true, slug: true } },
            genre: { select: { name: true } },
            comments: true,
          },
        },
      },
    });

    res.json({
      message: "Release published.",
      release: serializeRelease(updated),
    });
  }),
);

export { router as studioRouter };
