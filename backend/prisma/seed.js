import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { loadWammCatalog } from "../src/lib/content-import.js";
import { buildAutoAvatarUrl } from "../src/lib/avatar.js";

const prisma = new PrismaClient();
const DEFAULT_PASSWORD = "password123";
const BARAN_PASSWORD = "p3nc3r3l3r";
const PLATFORM_FEE_RATE = 0.03;

const hashPassword = (input) =>
  crypto.createHash("sha256").update(input).digest("hex");

const now = () => new Date();

const baseListeners = [
  { id: "u_listener_1", email: "listener1@wamm.local", password: DEFAULT_PASSWORD },
  { id: "u_listener_2", email: "listener2@wamm.local", password: DEFAULT_PASSWORD },
];

const commentAccounts = [
  { id: "u_cm_arda", username: "ArdaSynth", email: "arda.synth@wamm.local", password: "Arda!808wave" },
  { id: "u_cm_lina", username: "LinaEcho", email: "lina.echo@wamm.local", password: "Lina!Echo77" },
  { id: "u_cm_mert", username: "MertPulse", email: "mert.pulse@wamm.local", password: "Mert#Pulse24" },
  { id: "u_cm_eylul", username: "EylulSky", email: "eylul.sky@wamm.local", password: "Eylul@Sky88" },
  { id: "u_cm_kaan", username: "KaanNebula", email: "kaan.nebula@wamm.local", password: "Kaan$Nebula9" },
  { id: "u_cm_sena", username: "SenaDrift", email: "sena.drift@wamm.local", password: "SenaDrift!42" },
  { id: "u_cm_ozan", username: "OzanGrid", email: "ozan.grid@wamm.local", password: "OzanGrid#5" },
  { id: "u_cm_zeynep", username: "ZeynepFlux", email: "zeynep.flux@wamm.local", password: "Flux&Zeynep7" },
  { id: "u_cm_jade", username: "JadeNoise", email: "jade.noise@wamm.local", password: "JadeNoise!31" },
  { id: "u_cm_bora", username: "BoraLoop", email: "bora.loop@wamm.local", password: "BoraLoop*19" },
];

const listeners = [...baseListeners, ...commentAccounts];

const artistAccounts = [
  {
    id: "u_artist_baran",
    email: "barangulesen@gmail.com",
    slug: "baran-gulesen",
    name: "Baran Gulesen",
    password: BARAN_PASSWORD,
  },
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

async function clearDatabase() {
  await prisma.releaseLike.deleteMany();
  await prisma.artistActivityLog.deleteMany();
  await prisma.trackComment.deleteMany();
  await prisma.order.deleteMany();
  await prisma.tourDate.deleteMany();
  await prisma.track.deleteMany();
  await prisma.releaseGenre.deleteMany();
  await prisma.artistGenre.deleteMany();
  await prisma.release.deleteMany();
  await prisma.artist.deleteMany();
  await prisma.genre.deleteMany();
  await prisma.user.deleteMany();
}

async function seedUsers() {
  await prisma.user.createMany({
    data: [
      ...listeners.map((listener) => ({
        id: listener.id,
        email: listener.email,
        passwordHash: hashPassword(listener.password),
        role: "LISTENER",
      })),
      ...artistAccounts.map((artist) => ({
        id: artist.id,
        email: artist.email,
        passwordHash: hashPassword(artist.password),
        role: "ARTIST",
      })),
    ],
  });
}

const buildTrackComments = (track, trackIndex) => {
  const rng = createRng(`${track.id}:${trackIndex}`);
  const total = 42 + Math.floor(rng() * 9);
  const rows = [];
  const normalizedTrackId = track.id.replace(/[^a-z0-9]/gi, "_").toLowerCase();

  for (let i = 0; i < total; i += 1) {
    const user = commentAccounts[Math.floor(rng() * commentAccounts.length)];
    const spread = Math.max(6, track.duration - 4);
    const timestamp = Math.max(2, Math.min(track.duration - 1, 2 + Math.floor(rng() * spread)));
    const createdAt = new Date(Date.now() - Math.floor(rng() * 16 * 24 * 60 * 60 * 1000));

    rows.push({
      id: `c_${normalizedTrackId}_${String(i + 1).padStart(2, "0")}`,
      trackId: track.id,
      userId: user.id,
      username: user.username,
      avatarUrl: buildAutoAvatarUrl(user.username),
      content: createCommentText(rng),
      timestamp,
      createdAt,
    });
  }

  rows.sort((a, b) => a.timestamp - b.timestamp || a.createdAt - b.createdAt);
  return rows;
};

async function seedTrackComments(createdTracks) {
  const commentRows = createdTracks.flatMap((track, index) =>
    buildTrackComments(track, index),
  );
  if (commentRows.length === 0) return;

  await prisma.trackComment.createMany({
    data: commentRows,
  });
}

async function seedCatalog() {
  const catalog = await loadWammCatalog();
  if (catalog.artists.length === 0 || catalog.tracks.length === 0) {
    throw new Error(
      "No artist/track data found under content/. Check WAMM content files.",
    );
  }

  await prisma.genre.createMany({
    data: catalog.genres.map((name) => ({ name })),
  });

  const genres = await prisma.genre.findMany();
  const genreIdByName = new Map(genres.map((genre) => [genre.name, genre.id]));

  const artistOwnerBySlug = new Map(
    artistAccounts.map((artist) => [artist.slug, artist.id]),
  );

  for (const artist of catalog.artists) {
    await prisma.artist.create({
      data: {
        id: artist.id,
        name: artist.name,
        slug: artist.slug,
        bio: artist.bio,
        location: artist.location,
        verified: artist.verified,
        followers: artist.followers,
        monthlyListeners: artist.monthlyListeners,
        ownerUserId: artistOwnerBySlug.get(artist.slug),
        payoutIban:
          artist.slug === "baran-gulesen"
            ? "TR12 0006 7010 0000 0000 0000 00"
            : null,
        payoutIbanName:
          artist.slug === "baran-gulesen" ? "Baran Gulesen" : null,
        payoutWallet:
          artist.slug === "baran-gulesen"
            ? "0x7f6e51c6b96528d5f95f8e42f04fe4b8f49dd0af"
            : null,
        payoutNetwork:
          artist.slug === "baran-gulesen" ? "Ethereum / Base" : null,
      },
    });

    const uniqueGenres = [...new Set(artist.genres)];
    if (uniqueGenres.length > 0) {
      await prisma.artistGenre.createMany({
        data: uniqueGenres
          .filter((genre) => genreIdByName.has(genre))
          .map((genre) => ({
            artistId: artist.id,
            genreId: genreIdByName.get(genre),
          })),
      });
    }
  }

  const artistBySlug = new Map(
    catalog.artists.map((artist) => [artist.slug, artist]),
  );

  for (const release of catalog.releases) {
    const artistSlug = release.id.split("__")[0];
    const artist = artistBySlug.get(artistSlug);
    if (!artist) continue;

    await prisma.release.create({
      data: {
        id: release.id,
        title: release.title,
        slug: release.slug,
        artistId: artist.id,
        type: release.type,
        status: release.status,
        coverArtUrl: release.coverArtUrl,
        description: release.description,
        price: release.type === "SINGLE" ? 1.99 : 7.99,
        currency: "USD",
        isForSale: true,
        sourceRepo: release.sourceRepo,
        releaseDate: release.releaseDate,
        published: release.published,
        featured: release.featured,
      },
    });

    if (release.genres.length > 0) {
      await prisma.releaseGenre.createMany({
        data: release.genres
          .filter((genre) => genreIdByName.has(genre))
          .map((genre) => ({
            releaseId: release.id,
            genreId: genreIdByName.get(genre),
          })),
      });
    }
  }

  const releaseIdBySlug = new Map(
    catalog.releases.map((release) => {
      const artistSlug = release.id.split("__")[0];
      return [`${artistSlug}::${release.slug}`, release.id];
    }),
  );

  const createdTracks = [];
  for (let i = 0; i < catalog.tracks.length; i += 1) {
    const track = catalog.tracks[i];
    const artist = catalog.artists.find((entry) => entry.slug === track.artistSlug);
    if (!artist) continue;
    const releaseId = releaseIdBySlug.get(
      `${track.artistSlug}::${track.releaseSlug}`,
    );
    const genreId = genreIdByName.get(track.genre);

    const rng = createRng(`${track.id}:${i}`);
    const seededPlays = 1_000 + Math.floor(rng() * 4_001);
    const seededLikes = 50 + Math.floor(rng() * 201);

    await prisma.track.create({
      data: {
        id: track.id,
        title: track.title,
        artistId: artist.id,
        releaseId,
        coverArtUrl: track.coverArtUrl,
        audioUrl: track.audioUrl,
        previewUrl: track.previewUrl,
        highQualityUrl: track.highQualityUrl,
        originalUrl: track.originalUrl,
        duration: track.duration || 30,
        bpm: track.bpm,
        keySignature: track.keySignature,
        genreId,
        waveformJson: JSON.stringify(track.waveform),
        price: 0.99,
        currency: "USD",
        isForSale: true,
        sourcePath: track.sourcePath,
        plays: seededPlays,
        likes: seededLikes,
        createdAt: now(),
      },
    });

    createdTracks.push({
      id: track.id,
      duration: Math.max(30, track.duration || 30),
    });
  }

  await seedTrackComments(createdTracks);

  const firstRelease = await prisma.release.findFirst({
    where: { published: true },
    orderBy: { createdAt: "asc" },
  });

  if (firstRelease) {
    await prisma.order.create({
      data: {
        id: "order_seed_1",
        userId: listeners[0].id,
        releaseId: firstRelease.id,
        trackId: null,
        releaseTitle: firstRelease.title,
        artistName:
          catalog.artists.find((artist) => artist.id === firstRelease.artistId)?.name ??
          "Artist",
        status: "PAID",
        totalAmount: firstRelease.price,
        platformFee: Number((firstRelease.price * PLATFORM_FEE_RATE).toFixed(2)),
        artistPayout: Number(
          (firstRelease.price * (1 - PLATFORM_FEE_RATE)).toFixed(2),
        ),
        paymentMethod: "MANUAL",
        createdAt: now(),
      },
    });
  }
}

async function main() {
  const reset = process.env.SEED_RESET === "true";

  if (!reset) {
    const [artistCount, releaseCount, trackCount] = await Promise.all([
      prisma.artist.count(),
      prisma.release.count(),
      prisma.track.count(),
    ]);

    const hasCatalogData = artistCount > 0 && releaseCount > 0 && trackCount > 0;

    if (hasCatalogData) {
      console.log("Seed skipped: existing catalog detected.");
      return;
    }
  }

  await clearDatabase();
  await seedUsers();
  await seedCatalog();
  console.log("WAMM content seeded successfully.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
