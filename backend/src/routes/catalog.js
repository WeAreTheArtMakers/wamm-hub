import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import {
  serializeArtist,
  serializeRelease,
  serializeTourDate,
  serializeTrack,
} from "../lib/serializers.js";

const router = Router();

const trackInclude = {
  artist: { select: { id: true, name: true, slug: true } },
  genre: { select: { name: true } },
  comments: { orderBy: { createdAt: "asc" } },
};

const releaseInclude = {
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
  genres: { include: { genre: true } },
  tracks: { include: trackInclude, orderBy: { createdAt: "asc" } },
};

const artistInclude = {
  genres: { include: { genre: true } },
  _count: { select: { tracks: true } },
};

const publishedReleaseWhere = {
  published: true,
  status: "PUBLISHED",
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

router.get(
  "/home",
  asyncHandler(async (_req, res) => {
    const [featured, latest, trendingTracks, artists] = await Promise.all([
      prisma.release.findMany({
        where: { ...publishedReleaseWhere, featured: true },
        include: releaseInclude,
        orderBy: { releaseDate: "desc" },
      }),
      prisma.release.findMany({
        where: publishedReleaseWhere,
        include: releaseInclude,
        orderBy: { releaseDate: "desc" },
      }),
      prisma.track.findMany({
        where: {
          release: publishedReleaseWhere,
        },
        include: trackInclude,
        orderBy: [{ plays: "desc" }, { createdAt: "desc" }],
        take: 12,
      }),
      prisma.artist.findMany({
        include: artistInclude,
        orderBy: [{ followers: "desc" }, { monthlyListeners: "desc" }],
      }),
    ]);

    res.json({
      featuredReleases: featured.map(serializeRelease),
      latestReleases: latest.map(serializeRelease),
      trendingTracks: trendingTracks.map(serializeTrack).slice(0, 6),
      artists: artists.map((artist) => serializeArtist(artist)),
    });
  }),
);

router.get(
  "/genres",
  asyncHandler(async (_req, res) => {
    const genres = await prisma.genre.findMany({ orderBy: { name: "asc" } });
    res.json(genres.map((genre) => genre.name));
  }),
);

router.get(
  "/releases",
  asyncHandler(async (req, res) => {
    const genre = typeof req.query.genre === "string" ? req.query.genre : undefined;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const featured = req.query.featured === "true";

    const releases = await prisma.release.findMany({
      where: {
        ...publishedReleaseWhere,
        ...(featured ? { featured: true } : {}),
        ...(genre
          ? {
              genres: {
                some: {
                  genre: {
                    name: genre,
                  },
                },
              },
            }
          : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q } },
                { artist: { name: { contains: q } } },
              ],
            }
          : {}),
      },
      include: releaseInclude,
      orderBy: [{ releaseDate: "desc" }, { createdAt: "desc" }],
    });

    res.json(releases.map(serializeRelease));
  }),
);

router.get(
  "/releases/:slug",
  asyncHandler(async (req, res) => {
    const release = await prisma.release.findUnique({
      where: { slug: req.params.slug },
      include: releaseInclude,
    });

    if (!release || !release.published || release.status !== "PUBLISHED") {
      res.status(404).json({ message: "Release not found" });
      return;
    }

    res.json(serializeRelease(release));
  }),
);

router.get(
  "/artists",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const artists = await prisma.artist.findMany({
      where: q
        ? {
            OR: [{ name: { contains: q } }, { slug: { contains: q } }],
          }
        : undefined,
      include: artistInclude,
      orderBy: [{ followers: "desc" }, { monthlyListeners: "desc" }],
    });

    res.json(artists.map((artist) => serializeArtist(artist)));
  }),
);

router.get(
  "/artists/:slug",
  asyncHandler(async (req, res) => {
    const artist = await prisma.artist.findUnique({
      where: { slug: req.params.slug },
      include: {
        genres: { include: { genre: true } },
        releases: {
          where: publishedReleaseWhere,
          include: releaseInclude,
          orderBy: { releaseDate: "desc" },
        },
        tracks: {
          where: { release: publishedReleaseWhere },
          include: trackInclude,
          orderBy: { createdAt: "desc" },
        },
        tourDates: { orderBy: { date: "asc" } },
      },
    });

    if (!artist) {
      res.status(404).json({ message: "Artist not found" });
      return;
    }

    res.json({
      artist: serializeArtist(artist, artist.tracks.length),
      releases: artist.releases.map(serializeRelease),
      tracks: artist.tracks.map(serializeTrack),
      tourDates: artist.tourDates.map(serializeTourDate),
    });
  }),
);

router.get(
  "/tracks",
  asyncHandler(async (req, res) => {
    const genre = typeof req.query.genre === "string" ? req.query.genre : undefined;
    const artistId =
      typeof req.query.artistId === "string" ? req.query.artistId : undefined;
    const releaseId =
      typeof req.query.releaseId === "string" ? req.query.releaseId : undefined;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const sort = req.query.sort === "newest" ? "newest" : "plays";

    const tracks = await prisma.track.findMany({
      where: {
        release: publishedReleaseWhere,
        ...(genre ? { genre: { name: genre } } : {}),
        ...(artistId ? { artistId } : {}),
        ...(releaseId ? { releaseId } : {}),
        ...(q
          ? {
              OR: [{ title: { contains: q } }, { artist: { name: { contains: q } } }],
            }
          : {}),
      },
      include: trackInclude,
      orderBy: sort === "newest" ? { createdAt: "desc" } : { plays: "desc" },
    });

    res.json(tracks.map(serializeTrack));
  }),
);

router.get(
  "/discover",
  asyncHandler(async (req, res) => {
    const genre = typeof req.query.genre === "string" ? req.query.genre : undefined;

    const [releases, tracks, artists, genres] = await Promise.all([
      prisma.release.findMany({
        where: {
          ...publishedReleaseWhere,
          ...(genre
            ? {
                genres: {
                  some: {
                    genre: { name: genre },
                  },
                },
              }
            : {}),
        },
        include: releaseInclude,
        orderBy: { releaseDate: "desc" },
      }),
      prisma.track.findMany({
        where: {
          release: publishedReleaseWhere,
          ...(genre ? { genre: { name: genre } } : {}),
        },
        include: trackInclude,
        orderBy: { plays: "desc" },
      }),
      prisma.artist.findMany({
        include: artistInclude,
        orderBy: [{ followers: "desc" }, { monthlyListeners: "desc" }],
      }),
      prisma.genre.findMany({ orderBy: { name: "asc" } }),
    ]);

    res.json({
      genres: genres.map((entry) => entry.name),
      releases: releases.map(serializeRelease),
      tracks: tracks.map(serializeTrack),
      artists: artists.map((artist) => serializeArtist(artist)),
    });
  }),
);

router.get(
  "/search",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) {
      res.json({ artists: [], releases: [], tracks: [] });
      return;
    }

    const [artists, releases, tracks] = await Promise.all([
      prisma.artist.findMany({
        where: { OR: [{ name: { contains: q } }, { slug: { contains: q } }] },
        include: artistInclude,
        take: 12,
      }),
      prisma.release.findMany({
        where: {
          ...publishedReleaseWhere,
          OR: [{ title: { contains: q } }, { artist: { name: { contains: q } } }],
        },
        include: releaseInclude,
        take: 12,
      }),
      prisma.track.findMany({
        where: {
          release: publishedReleaseWhere,
          OR: [{ title: { contains: q } }, { artist: { name: { contains: q } } }],
        },
        include: trackInclude,
        take: 20,
      }),
    ]);

    res.json({
      artists: artists.map((artist) => serializeArtist(artist)),
      releases: releases.map(serializeRelease),
      tracks: tracks.map(serializeTrack),
    });
  }),
);

export { router as catalogRouter };
