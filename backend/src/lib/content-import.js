import fs from "node:fs/promises";
import path from "node:path";
import { parseFile } from "music-metadata";
import {
  CONTENT_ROOT,
  GENERATED_COVERS_ROOT,
  createSyntheticWaveform,
  ensureDirectory,
  fileExists,
  listDirectories,
  listFiles,
  parsePeaksFile,
  toMediaUrl,
} from "./content.js";
import { humanizeSlug, slugify } from "./text.js";

const COVER_EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const COVER_CACHE = new Map();

const seconds = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(1, Math.round(n));
};

const isLfsPointerFile = async (filePath) => {
  if (!(await fileExists(filePath))) return false;
  try {
    const handle = await fs.open(filePath, "r");
    const buffer = Buffer.alloc(200);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    await handle.close();
    const head = buffer.subarray(0, bytesRead).toString("utf8");
    return head.startsWith("version https://git-lfs.github.com/spec/v1");
  } catch {
    return false;
  }
};

const isUsableAudioFile = async (filePath) => {
  if (!(await fileExists(filePath))) return false;
  return !(await isLfsPointerFile(filePath));
};

const pickAudioSource = async (trackDirectory) => {
  const candidates = ["original.mp3", "high.mp3", "master.wav", "preview.mp3"];
  for (const filename of candidates) {
    const filePath = path.join(trackDirectory, filename);
    if (await isUsableAudioFile(filePath)) return filePath;
  }
  const files = await listFiles(trackDirectory);
  const audio = files.find((name) => /\.(mp3|wav|flac|m4a)$/i.test(name));
  if (!audio) return null;
  const fallbackPath = path.join(trackDirectory, audio);
  if (!(await isUsableAudioFile(fallbackPath))) return null;
  return fallbackPath;
};

const extractCoverFromAudio = async (audioPath, stableKey) => {
  if (COVER_CACHE.has(stableKey)) return COVER_CACHE.get(stableKey);

  try {
    const metadata = await parseFile(audioPath, { duration: true, skipCovers: false });
    const picture = metadata.common.picture?.[0];
    if (!picture?.data?.length) {
      COVER_CACHE.set(stableKey, null);
      return null;
    }

    const ext = COVER_EXT_BY_MIME[picture.format?.toLowerCase()] ?? "jpg";
    await ensureDirectory(GENERATED_COVERS_ROOT);
    const fileName = `${slugify(stableKey)}.${ext}`;
    const destinationPath = path.join(GENERATED_COVERS_ROOT, fileName);
    await fs.writeFile(destinationPath, picture.data);
    const coverUrl = `/generated/covers/${fileName}`;
    COVER_CACHE.set(stableKey, coverUrl);
    return coverUrl;
  } catch {
    COVER_CACHE.set(stableKey, null);
    return null;
  }
};

const readAudioMetadata = async (audioPath) => {
  try {
    const metadata = await parseFile(audioPath, { duration: true, skipCovers: false });
    return {
      title: metadata.common.title ?? "",
      artist: metadata.common.artist ?? "",
      genre: metadata.common.genre?.[0] ?? "",
      bpm:
        typeof metadata.common.bpm === "number"
          ? Math.round(metadata.common.bpm)
          : undefined,
      key:
        typeof metadata.common.key === "string" && metadata.common.key
          ? metadata.common.key
          : undefined,
      duration: seconds(metadata.format.duration),
    };
  } catch {
    return {
      title: "",
      artist: "",
      genre: "",
      bpm: undefined,
      key: undefined,
      duration: 0,
    };
  }
};

const parseTrackFromReleaseFolder = async ({
  artistSlug,
  artistName,
  releaseSlug,
  trackSlug,
  trackDirectory,
  index,
}) => {
  const previewPath = path.join(trackDirectory, "preview.mp3");
  const highPath = path.join(trackDirectory, "high.mp3");
  const originalPath = path.join(trackDirectory, "original.mp3");
  const masterPath = path.join(trackDirectory, "master.wav");
  const hasPreview = await isUsableAudioFile(previewPath);
  const hasHigh = await isUsableAudioFile(highPath);
  const hasOriginal = await isUsableAudioFile(originalPath);
  const hasMaster = await isUsableAudioFile(masterPath);
  const hasFullSource = hasOriginal || hasHigh || hasMaster;
  if (!hasFullSource) return null;
  const sourceAudioPath =
    (hasOriginal && originalPath) ||
    (hasHigh && highPath) ||
    (hasMaster && masterPath) ||
    (await pickAudioSource(trackDirectory));
  if (!sourceAudioPath) return null;

  const metadata = await readAudioMetadata(sourceAudioPath);
  const peaksPath = path.join(trackDirectory, "peaks.json");
  const parsedWaveform = await parsePeaksFile(peaksPath);
  const waveform =
    parsedWaveform.length > 0 ? parsedWaveform : createSyntheticWaveform(index + 1);

  const coverArtUrl = await extractCoverFromAudio(
    sourceAudioPath,
    `${artistSlug}-${releaseSlug}-${trackSlug}`,
  );

  return {
    id: `${artistSlug}__${releaseSlug}__${trackSlug}`,
    title: metadata.title || humanizeSlug(trackSlug),
    slug: trackSlug,
    artistSlug,
    artistName,
    releaseSlug,
    coverArtUrl: coverArtUrl ?? "",
    audioUrl: toMediaUrl(sourceAudioPath),
    previewUrl: hasPreview ? toMediaUrl(previewPath) : null,
    highQualityUrl: hasHigh ? toMediaUrl(highPath) : null,
    originalUrl: hasOriginal
      ? toMediaUrl(originalPath)
      : hasMaster
        ? toMediaUrl(masterPath)
        : null,
    duration: metadata.duration,
    bpm: metadata.bpm,
    keySignature: metadata.key,
    genre: metadata.genre || "Electronic",
    waveform,
    sourcePath: path.relative(process.cwd(), sourceAudioPath),
  };
};

const parseSingleTrack = async ({
  artistSlug,
  artistName,
  singlesDirectory,
  fileName,
  index,
}) => {
  const absoluteAudioPath = path.join(singlesDirectory, fileName);
  if (!(await isUsableAudioFile(absoluteAudioPath))) return null;
  const baseName = path.basename(fileName, path.extname(fileName));
  const releaseSlug = slugify(baseName);

  const metadata = await readAudioMetadata(absoluteAudioPath);
  const coverFromMetadata = await extractCoverFromAudio(
    absoluteAudioPath,
    `${artistSlug}-${releaseSlug}`,
  );
  const jpgCandidate = path.join(singlesDirectory, `${baseName}.jpg`);
  const pngCandidate = path.join(singlesDirectory, `${baseName}.png`);
  const fallbackCoverPath = (await fileExists(jpgCandidate))
    ? jpgCandidate
    : (await fileExists(pngCandidate))
      ? pngCandidate
      : null;
  const fallbackCoverUrl = fallbackCoverPath ? toMediaUrl(fallbackCoverPath) : "";
  const coverArtUrl = coverFromMetadata ?? fallbackCoverUrl;
  const title = metadata.title || humanizeSlug(baseName);
  const trackSlug = slugify(baseName);

  return {
    release: {
      id: `${artistSlug}__${releaseSlug}`,
      slug: releaseSlug,
      title,
      type: "SINGLE",
      coverArtUrl,
      description: `${artistName} single release`,
      releaseDate: new Date(),
      genres: [metadata.genre || "Electronic"],
      isForSale: true,
      status: "PUBLISHED",
      published: true,
      featured: false,
      sourceRepo: "wamm-content",
    },
    track: {
      id: `${artistSlug}__${releaseSlug}__${trackSlug}`,
      title,
      slug: trackSlug,
      artistSlug,
      artistName,
      releaseSlug,
      coverArtUrl,
      audioUrl: toMediaUrl(absoluteAudioPath),
      previewUrl: toMediaUrl(absoluteAudioPath),
      highQualityUrl: toMediaUrl(absoluteAudioPath),
      originalUrl: toMediaUrl(absoluteAudioPath),
      duration: metadata.duration,
      bpm: metadata.bpm,
      keySignature: metadata.key,
      genre: metadata.genre || "Electronic",
      waveform: createSyntheticWaveform(index + 13),
      sourcePath: path.relative(process.cwd(), absoluteAudioPath),
    },
  };
};

const listArtistSlugs = async () => {
  const artistsRoot = path.join(CONTENT_ROOT, "artists");
  return listDirectories(artistsRoot);
};

export const loadWammCatalog = async () => {
  const artistsRoot = path.join(CONTENT_ROOT, "artists");
  const artistSlugs = await listArtistSlugs();

  const artists = [];
  const releases = [];
  const tracks = [];
  const genres = new Set();

  for (let artistIndex = 0; artistIndex < artistSlugs.length; artistIndex += 1) {
    const artistSlug = artistSlugs[artistIndex];
    const artistDirectoryName = artistSlug;
    const artistSlugNormalized = slugify(artistDirectoryName);
    const artistName = humanizeSlug(artistDirectoryName);
    const artistDirectory = path.join(artistsRoot, artistDirectoryName);
    const releasesDirectory = path.join(artistDirectory, "releases");
    const singlesDirectory = path.join(artistDirectory, "singles");

    artists.push({
      id: `artist__${artistSlugNormalized}`,
      slug: artistSlugNormalized,
      name: artistName,
      bio: `${artistName} on WAMM`,
      location: "Independent",
      verified: true,
      followers: 6_000 + artistIndex * 1_250,
      monthlyListeners: 18_000 + artistIndex * 2_100,
      genres: [],
    });

    const releaseSlugs = await listDirectories(releasesDirectory);
    const createdReleaseSlugs = new Set();

    for (const releaseSlugRaw of releaseSlugs) {
      const releaseSlug = slugify(releaseSlugRaw);
      const releaseDirectory = path.join(releasesDirectory, releaseSlugRaw);
      const tracksDirectory = path.join(releaseDirectory, "tracks");
      const trackSlugs = await listDirectories(tracksDirectory);
      if (trackSlugs.length === 0) continue;

      const parsedTracks = [];
      for (let i = 0; i < trackSlugs.length; i += 1) {
        const trackSlugRaw = trackSlugs[i];
        const trackSlug = slugify(trackSlugRaw);
        const trackDirectory = path.join(tracksDirectory, trackSlugRaw);
        const parsedTrack = await parseTrackFromReleaseFolder({
          artistSlug: artistSlugNormalized,
          artistName,
          releaseSlug,
          trackSlug,
          trackDirectory,
          index: i,
        });
        if (!parsedTrack) continue;
        parsedTracks.push(parsedTrack);
      }

      if (parsedTracks.length === 0) continue;
      const firstTrack = parsedTracks[0];
      const releaseTitle = humanizeSlug(releaseSlugRaw);
      const releaseGenres = [...new Set(parsedTracks.map((track) => track.genre))];
      releaseGenres.forEach((genre) => genres.add(genre));
      artists[artists.length - 1].genres.push(...releaseGenres);

      releases.push({
        id: `${artistSlugNormalized}__${releaseSlug}`,
        slug: releaseSlug,
        title: releaseTitle,
        type: parsedTracks.length > 1 ? "ALBUM" : "SINGLE",
        coverArtUrl: firstTrack.coverArtUrl,
        description: `${releaseTitle} by ${artistName}`,
        releaseDate: new Date(),
        genres: releaseGenres,
        isForSale: true,
        status: "PUBLISHED",
        published: true,
        featured: parsedTracks.length > 1,
        sourceRepo: "wamm-content",
      });

      tracks.push(...parsedTracks);
      createdReleaseSlugs.add(releaseSlug);
    }

    const singleFiles = (await listFiles(singlesDirectory)).filter((fileName) =>
      /\.mp3$/i.test(fileName),
    );

    for (let i = 0; i < singleFiles.length; i += 1) {
      const parsed = await parseSingleTrack({
        artistSlug: artistSlugNormalized,
        artistName,
        singlesDirectory,
        fileName: singleFiles[i],
        index: i,
      });
      if (!parsed) continue;
      if (createdReleaseSlugs.has(parsed.release.slug)) continue;
      releases.push(parsed.release);
      tracks.push(parsed.track);
      parsed.release.genres.forEach((genre) => genres.add(genre));
      artists[artists.length - 1].genres.push(...parsed.release.genres);
      createdReleaseSlugs.add(parsed.release.slug);
    }

    artists[artists.length - 1].genres = [
      ...new Set(artists[artists.length - 1].genres),
    ];
  }

  return {
    artists,
    releases,
    tracks,
    genres: [...genres],
  };
};
