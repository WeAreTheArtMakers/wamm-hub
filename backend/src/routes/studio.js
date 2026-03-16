import crypto from "node:crypto";
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
import {
  serializeArtist,
  serializeRelease,
  serializeTrack,
} from "../lib/serializers.js";
import { humanizeSlug, slugify } from "../lib/text.js";

const router = Router();
const uploadTmpDir = path.resolve(process.cwd(), "tmp/uploads");
const studioStorageRoot = path.join(CONTENT_ROOT, "uploads");
const generatedArtistsRoot = path.resolve(process.cwd(), "public/generated/artists");

const upload = multer({
  dest: uploadTmpDir,
  limits: {
    fileSize: 250 * 1024 * 1024,
  },
});

const COMMENTER_PROFILES = [
  { email: "arda.synth@wamm.local", username: "ArdaSynth" },
  { email: "lina.echo@wamm.local", username: "LinaEcho" },
  { email: "mert.pulse@wamm.local", username: "MertPulse" },
  { email: "eylul.sky@wamm.local", username: "EylulSky" },
  { email: "kaan.nebula@wamm.local", username: "KaanNebula" },
  { email: "sena.drift@wamm.local", username: "SenaDrift" },
  { email: "ozan.grid@wamm.local", username: "OzanGrid" },
  { email: "zeynep.flux@wamm.local", username: "ZeynepFlux" },
  { email: "jade.noise@wamm.local", username: "JadeNoise" },
  { email: "bora.loop@wamm.local", username: "BoraLoop" },
];

const englishStarts = [
  "That transition hits hard.",
  "This mix feels huge on headphones.",
  "Love the groove here.",
  "The atmosphere is unreal.",
  "Bass sits perfectly in this section.",
  "This drop is so clean.",
  "The synth texture is beautiful.",
  "Drums are super tight.",
  "Great movement in the stereo field.",
  "This part deserves a replay.",
];

const englishEnds = [
  "Instant save for me.",
  "Pure futuristic energy.",
  "Feels cinematic in the best way.",
  "Exactly what I needed tonight.",
  "This section is addictive.",
  "Huge respect to the producer.",
  "Sound design is on point.",
  "Perfect late-night vibe.",
  "I keep coming back to this moment.",
  "Top tier production.",
];

const turkishStarts = [
  "Buradaki geçiş çok iyi olmuş.",
  "Kulaklıkta inanılmaz duyuluyor.",
  "Ritim burada çok sağlam.",
  "Atmosfer efsane bir seviyede.",
  "Baslar net ve dengeli.",
  "Bu kısım direkt tekrar dinletiyor.",
  "Synth tonu çok karakterli.",
  "Davullar aşırı temiz.",
  "Buradaki enerji çok yüksek.",
  "Bu an şarkının zirvesi.",
];

const turkishEnds = [
  "Listeme direkt ekledim.",
  "Prodüksiyon gerçekten çok güçlü.",
  "Gece sürüşü için birebir.",
  "Tekrar tekrar dinlenir.",
  "Burası ayrı bir dünya olmuş.",
  "Detaylar çok iyi düşünülmüş.",
  "Her dinleyişte yeni bir şey yakalıyorum.",
  "Çok profesyonel bir iş.",
  "Yorum bırakmadan geçemedim.",
  "Tam canlı performanslık bölüm.",
];

const studioTrackInclude = {
  artist: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  genre: {
    select: {
      name: true,
    },
  },
  comments: {
    orderBy: {
      createdAt: "asc",
    },
  },
};

const studioReleaseInclude = {
  artist: {
    select: {
      id: true,
      name: true,
      slug: true,
      payoutIban: true,
      payoutIbanName: true,
      payoutWallet: true,
      payoutNetwork: true,
    },
  },
  genres: {
    include: {
      genre: true,
    },
  },
  tracks: {
    include: studioTrackInclude,
    orderBy: {
      createdAt: "asc",
    },
  },
};

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

const safeText = (value, maxLength = 240) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
};

const parseBooleanFlag = (value) => {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return undefined;
};

const parsePositiveNumber = (value) => {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
};

const parseOptionalInt = (value) => {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
};

const randomInt = (min, max) => crypto.randomInt(min, max + 1);

const createRng = (seedInput) => {
  let seed = 0;
  for (const char of seedInput) {
    seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  }
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
};

const createCommentText = (rng) => {
  const isEnglish = rng() < 0.5;
  const starts = isEnglish ? englishStarts : turkishStarts;
  const ends = isEnglish ? englishEnds : turkishEnds;
  const start = starts[Math.floor(rng() * starts.length)];
  const end = ends[Math.floor(rng() * ends.length)];
  return `${start} ${end}`;
};

const resolveCommentProfiles = async () => {
  const existingUsers = await prisma.user.findMany({
    where: {
      email: {
        in: COMMENTER_PROFILES.map((profile) => profile.email),
      },
    },
    select: {
      id: true,
      email: true,
    },
  });
  const idByEmail = new Map(existingUsers.map((user) => [user.email, user.id]));

  return COMMENTER_PROFILES.map((profile) => ({
    ...profile,
    userId: idByEmail.get(profile.email) ?? null,
  }));
};

const buildAutoComments = ({ trackId, duration, profiles }) => {
  if (!profiles.length) return [];

  const safeDuration = Math.max(30, Number(duration) || 30);
  const minTimestamp = 2;
  const maxTimestamp = Math.max(minTimestamp + 1, safeDuration - 1);
  const timestampSpan = Math.max(1, maxTimestamp - minTimestamp + 1);

  const rng = createRng(`${trackId}:${safeDuration}`);
  const totalComments = 42 + Math.floor(rng() * 9);
  const normalizedTrack = trackId.replace(/[^a-z0-9]/gi, "_").toLowerCase();

  const rows = [];
  for (let i = 0; i < totalComments; i += 1) {
    const profile = profiles[Math.floor(rng() * profiles.length)];
    const timestamp = minTimestamp + Math.floor(rng() * timestampSpan);
    const createdAt = new Date(
      Date.now() - Math.floor(rng() * 21 * 24 * 60 * 60 * 1000),
    );

    rows.push({
      id: `c_${normalizedTrack}_${String(i + 1).padStart(2, "0")}_${Math.floor(rng() * 9999)}`,
      trackId,
      userId: profile.userId,
      username: profile.username,
      avatarUrl: "",
      content: createCommentText(rng),
      timestamp,
      createdAt,
    });
  }

  rows.sort((a, b) => a.timestamp - b.timestamp || a.createdAt - b.createdAt);
  return rows;
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
    const artistId = req.artist.id;

    const [artist, releases, tracks, orders] = await Promise.all([
      prisma.artist.findUnique({
        where: { id: artistId },
        include: {
          genres: { include: { genre: true } },
        },
      }),
      prisma.release.findMany({
        where: { artistId },
        include: studioReleaseInclude,
        orderBy: { createdAt: "desc" },
      }),
      prisma.track.findMany({
        where: { artistId },
        include: {
          ...studioTrackInclude,
          release: {
            select: {
              id: true,
              title: true,
              slug: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.order.findMany({
        where: {
          release: { artistId },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    if (!artist) {
      res.status(404).json({ message: "Artist profile not found." });
      return;
    }

    res.json({
      artist: serializeArtist(artist, tracks.length),
      releases: releases.map(serializeRelease),
      tracks: tracks.map(serializeTrack),
      recentOrders: orders,
    });
  }),
);

router.patch(
  "/profile",
  requireArtist,
  upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "banner", maxCount: 1 },
  ]),
  asyncHandler(async (req, res) => {
    await ensureDirectory(uploadTmpDir);
    await ensureDirectory(generatedArtistsRoot);

    const artist = req.artist;
    const filesByField = req.files ?? {};
    const avatarUpload = filesByField.avatar?.[0] ?? null;
    const bannerUpload = filesByField.banner?.[0] ?? null;

    const updateData = {};

    const name = safeText(req.body?.name, 120);
    if (name.length >= 2) {
      updateData.name = name;
    }

    const bio = safeText(req.body?.bio, 1200);
    if (bio) {
      updateData.bio = bio;
    }

    const location = safeText(req.body?.location, 120);
    if (location) {
      updateData.location = location;
    }

    if (typeof req.body?.payoutIban === "string") {
      updateData.payoutIban = safeText(req.body.payoutIban, 80);
    }
    if (typeof req.body?.payoutIbanName === "string") {
      updateData.payoutIbanName = safeText(req.body.payoutIbanName, 120);
    }
    if (typeof req.body?.payoutWallet === "string") {
      updateData.payoutWallet = safeText(req.body.payoutWallet, 160);
    }
    if (typeof req.body?.payoutNetwork === "string") {
      updateData.payoutNetwork = safeText(req.body.payoutNetwork, 60);
    }

    const clearAvatar = parseBooleanFlag(req.body?.clearAvatar);
    if (clearAvatar === true) {
      updateData.avatarUrl = null;
    }
    const clearBanner = parseBooleanFlag(req.body?.clearBanner);
    if (clearBanner === true) {
      updateData.bannerUrl = null;
    }

    if (avatarUpload) {
      const ext =
        path.extname(avatarUpload.originalname).replace(".", "").toLowerCase() ||
        extFromMime(avatarUpload.mimetype);
      const fileName = `${artist.slug}-avatar-${Date.now()}.${ext}`;
      const target = path.join(generatedArtistsRoot, fileName);
      await moveFile(avatarUpload.path, target);
      updateData.avatarUrl = `/generated/artists/${fileName}`;
    }

    if (bannerUpload) {
      const ext =
        path.extname(bannerUpload.originalname).replace(".", "").toLowerCase() ||
        extFromMime(bannerUpload.mimetype);
      const fileName = `${artist.slug}-banner-${Date.now()}.${ext}`;
      const target = path.join(generatedArtistsRoot, fileName);
      await moveFile(bannerUpload.path, target);
      updateData.bannerUrl = `/generated/artists/${fileName}`;
    }

    if (Object.keys(updateData).length === 0) {
      const currentArtist = await prisma.artist.findUnique({
        where: { id: artist.id },
        include: {
          genres: { include: { genre: true } },
          _count: { select: { tracks: true } },
        },
      });
      res.json({
        message: "No profile changes submitted.",
        artist: serializeArtist(currentArtist),
      });
      return;
    }

    const updatedArtist = await prisma.artist.update({
      where: { id: artist.id },
      data: updateData,
      include: {
        genres: { include: { genre: true } },
        _count: { select: { tracks: true } },
      },
    });

    res.json({
      message: "Artist profile updated.",
      artist: serializeArtist(updatedArtist),
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

    const title = safeText(req.body?.title, 180);
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
    const commenterProfiles = await resolveCommentProfiles();

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
      const duration = metadata.duration || 30;
      const plays = randomInt(1000, 5000);
      const likes = randomInt(50, 250);

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
          duration,
          bpm: metadata.bpm,
          keySignature: metadata.key,
          genreId: genre.id,
          waveformJson: JSON.stringify(createSyntheticWaveform(i + 1)),
          price: Number(req.body?.trackPrice ?? 0.99),
          currency: String(req.body?.currency || "USD").toUpperCase(),
          isForSale: true,
          sourcePath: path.relative(process.cwd(), originalPath),
          plays,
          likes,
          createdAt: new Date(),
        },
      });

      const autoComments = buildAutoComments({
        trackId,
        duration,
        profiles: commenterProfiles,
      });
      if (autoComments.length > 0) {
        await prisma.trackComment.createMany({
          data: autoComments,
        });
      }

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
      include: studioReleaseInclude,
    });

    res.status(201).json({
      message: "Release uploaded successfully.",
      release: serializeRelease(createdRelease),
      tracks: createdRelease.tracks
        .filter((track) => createdTrackIds.includes(track.id))
        .map(serializeTrack),
    });
  }),
);

router.patch(
  "/releases/:releaseId",
  requireArtist,
  upload.single("cover"),
  asyncHandler(async (req, res) => {
    await ensureDirectory(uploadTmpDir);
    await ensureDirectory(GENERATED_COVERS_ROOT);

    const artist = req.artist;
    const release = await prisma.release.findUnique({
      where: { id: req.params.releaseId },
    });

    if (!release || release.artistId !== artist.id) {
      res.status(404).json({ message: "Release not found." });
      return;
    }

    const updateData = {};

    const title = safeText(req.body?.title, 180);
    if (title.length >= 2) {
      updateData.title = title;
    }

    if (typeof req.body?.description === "string") {
      updateData.description = safeText(req.body.description, 1600);
    }

    const price = parsePositiveNumber(req.body?.price);
    if (typeof price === "number") {
      updateData.price = price;
    }

    const isForSale = parseBooleanFlag(req.body?.isForSale);
    if (typeof isForSale === "boolean") {
      updateData.isForSale = isForSale;
    }

    if (
      req.body?.status === "DRAFT" ||
      req.body?.status === "PUBLISHED" ||
      req.body?.status === "ARCHIVED"
    ) {
      updateData.status = req.body.status;
      updateData.published = req.body.status === "PUBLISHED";
      if (req.body.status === "PUBLISHED" && !release.releaseDate) {
        updateData.releaseDate = new Date();
      }
    }

    if (req.file) {
      const ext =
        path.extname(req.file.originalname).replace(".", "").toLowerCase() ||
        extFromMime(req.file.mimetype);
      const fileName = `${artist.slug}-${release.slug}-${Date.now()}.${ext}`;
      const target = path.join(GENERATED_COVERS_ROOT, fileName);
      await moveFile(req.file.path, target);
      updateData.coverArtUrl = `/generated/covers/${fileName}`;
    }

    if (Object.keys(updateData).length === 0) {
      const currentRelease = await prisma.release.findUnique({
        where: { id: release.id },
        include: studioReleaseInclude,
      });
      res.json({
        message: "No release changes submitted.",
        release: serializeRelease(currentRelease),
      });
      return;
    }

    await prisma.release.update({
      where: { id: release.id },
      data: updateData,
    });

    const updatedRelease = await prisma.release.findUnique({
      where: { id: release.id },
      include: studioReleaseInclude,
    });

    res.json({
      message: "Release updated.",
      release: serializeRelease(updatedRelease),
    });
  }),
);

router.patch(
  "/tracks/:trackId",
  requireArtist,
  upload.single("cover"),
  asyncHandler(async (req, res) => {
    await ensureDirectory(uploadTmpDir);
    await ensureDirectory(GENERATED_COVERS_ROOT);

    const artist = req.artist;
    const track = await prisma.track.findUnique({
      where: { id: req.params.trackId },
    });

    if (!track || track.artistId !== artist.id) {
      res.status(404).json({ message: "Track not found." });
      return;
    }

    const updateData = {};

    const title = safeText(req.body?.title, 180);
    if (title.length >= 1) {
      updateData.title = title;
    }

    const price = parsePositiveNumber(req.body?.price);
    if (typeof price === "number") {
      updateData.price = price;
    }

    const isForSale = parseBooleanFlag(req.body?.isForSale);
    if (typeof isForSale === "boolean") {
      updateData.isForSale = isForSale;
    }

    const bpm = parseOptionalInt(req.body?.bpm);
    if (typeof bpm === "number") {
      updateData.bpm = bpm;
    }

    if (typeof req.body?.keySignature === "string") {
      updateData.keySignature = safeText(req.body.keySignature, 16);
    }

    const genreName = safeText(req.body?.genre, 80);
    if (genreName) {
      const genre = await prisma.genre.upsert({
        where: { name: genreName },
        update: {},
        create: { name: genreName },
      });

      await prisma.artistGenre.upsert({
        where: {
          artistId_genreId: {
            artistId: artist.id,
            genreId: genre.id,
          },
        },
        update: {},
        create: {
          artistId: artist.id,
          genreId: genre.id,
        },
      });

      updateData.genreId = genre.id;
    }

    if (req.file) {
      const ext =
        path.extname(req.file.originalname).replace(".", "").toLowerCase() ||
        extFromMime(req.file.mimetype);
      const fileName = `${artist.slug}-${slugify(track.title)}-${Date.now()}.${ext}`;
      const target = path.join(GENERATED_COVERS_ROOT, fileName);
      await moveFile(req.file.path, target);
      updateData.coverArtUrl = `/generated/covers/${fileName}`;
    }

    if (Object.keys(updateData).length === 0) {
      const currentTrack = await prisma.track.findUnique({
        where: { id: track.id },
        include: {
          ...studioTrackInclude,
          release: {
            select: {
              id: true,
              title: true,
              slug: true,
              status: true,
            },
          },
        },
      });
      res.json({
        message: "No track changes submitted.",
        track: serializeTrack(currentTrack),
      });
      return;
    }

    await prisma.track.update({
      where: { id: track.id },
      data: updateData,
    });

    const updatedTrack = await prisma.track.findUnique({
      where: { id: track.id },
      include: {
        ...studioTrackInclude,
        release: {
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
          },
        },
      },
    });

    res.json({
      message: "Track updated.",
      track: serializeTrack(updatedTrack),
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
      include: studioReleaseInclude,
    });

    res.json({
      message: "Release published.",
      release: serializeRelease(updated),
    });
  }),
);

export { router as studioRouter };
