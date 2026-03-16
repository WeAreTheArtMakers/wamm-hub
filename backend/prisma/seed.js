import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { loadWammCatalog } from "../src/lib/content-import.js";

const prisma = new PrismaClient();

const hashPassword = (input) =>
  crypto.createHash("sha256").update(input).digest("hex");

const now = () => new Date();

const listeners = [
  { id: "u_listener_1", email: "listener1@wamm.local" },
  { id: "u_listener_2", email: "listener2@wamm.local" },
];

const artistAccounts = [
  {
    id: "u_artist_baran",
    email: "baran.gulesen@wamm.local",
    slug: "baran-gulesen",
    name: "Baran Gulesen",
  },
];

async function clearDatabase() {
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
        passwordHash: hashPassword("password123"),
        role: "LISTENER",
      })),
      ...artistAccounts.map((artist) => ({
        id: artist.id,
        email: artist.email,
        passwordHash: hashPassword("password123"),
        role: "ARTIST",
      })),
    ],
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

  for (let i = 0; i < catalog.tracks.length; i += 1) {
    const track = catalog.tracks[i];
    const artist = catalog.artists.find((entry) => entry.slug === track.artistSlug);
    if (!artist) continue;
    const releaseId = releaseIdBySlug.get(
      `${track.artistSlug}::${track.releaseSlug}`,
    );
    const genreId = genreIdByName.get(track.genre);

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
          plays: 4_000 + i * 320,
          likes: 180 + i * 18,
          createdAt: now(),
        },
      });
  }

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
        platformFee: Number((firstRelease.price * 0.1).toFixed(2)),
        artistPayout: Number((firstRelease.price * 0.9).toFixed(2)),
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

    const hasCatalogData =
      artistCount > 0 && releaseCount > 0 && trackCount > 0;

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
