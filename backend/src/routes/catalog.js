import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authOptional, requireAuth } from "../lib/auth.js";
import {
  serializeArtist,
  serializeComment,
  serializeRelease,
  serializeTourDate,
  serializeTrack,
} from "../lib/serializers.js";

const router = Router();

const trackInclude = {
  artist: { select: { id: true, name: true, slug: true } },
  genre: { select: { name: true } },
  release: {
    select: {
      id: true,
      slug: true,
      coverArtUrl: true,
    },
  },
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
  _count: { select: { likes: true } },
  tracks: {
    where: { isVisible: true },
    include: trackInclude,
    orderBy: { createdAt: "asc" },
  },
};

const artistInclude = {
  genres: { include: { genre: true } },
  _count: { select: { tracks: true } },
};

const publishedReleaseWhere = {
  published: true,
  status: "PUBLISHED",
  tracks: {
    some: {
      isVisible: true,
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

const commentPayloadSchema = z.object({
  content: z.string().trim().min(1).max(280),
  timestamp: z
    .preprocess((value) => {
      if (value === undefined || value === null || value === "") return undefined;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? Math.floor(numeric) : undefined;
    }, z.number().int().nonnegative().optional())
    .optional(),
});

router.use(authOptional);

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
          isVisible: true,
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
    let release = await prisma.release.findUnique({
      where: { slug: req.params.slug },
      include: {
        ...releaseInclude,
        likes: req.user
          ? {
              where: { userId: req.user.id },
              select: { userId: true },
              take: 1,
            }
          : false,
      },
    });

    if (!release) {
      release = await prisma.release.findUnique({
        where: { id: req.params.slug },
        include: {
          ...releaseInclude,
          likes: req.user
            ? {
                where: { userId: req.user.id },
                select: { userId: true },
                take: 1,
              }
            : false,
        },
      });
    }

    if (!release || !release.published || release.status !== "PUBLISHED") {
      res.status(404).json({ message: "Release not found" });
      return;
    }

    const serialized = serializeRelease(release);
    if (serialized.trackCount === 0) {
      res.status(404).json({ message: "Release not found" });
      return;
    }
    res.json({
      ...serialized,
      likedByMe: Array.isArray(release.likes) ? release.likes.length > 0 : false,
    });
  }),
);

router.get(
  "/releases/:releaseId/like",
  asyncHandler(async (req, res) => {
    const release = await prisma.release.findUnique({
      where: { id: req.params.releaseId },
      select: {
        id: true,
        published: true,
        status: true,
        _count: { select: { likes: true } },
        likes: req.user
          ? {
              where: { userId: req.user.id },
              select: { userId: true },
              take: 1,
            }
          : false,
      },
    });

    if (!release || !release.published || release.status !== "PUBLISHED") {
      res.status(404).json({ message: "Release not found." });
      return;
    }

    res.json({
      likedByMe: Array.isArray(release.likes) ? release.likes.length > 0 : false,
      totalLikes: release._count.likes,
    });
  }),
);

router.post(
  "/tracks/:trackId/comments",
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = commentPayloadSchema.parse(req.body ?? {});

    const track = await prisma.track.findUnique({
      where: { id: req.params.trackId },
      select: {
        id: true,
        duration: true,
        isVisible: true,
        release: {
          select: {
            published: true,
            status: true,
          },
        },
      },
    });

    if (
      !track ||
      !track.isVisible ||
      !track.release ||
      !track.release.published ||
      track.release.status !== "PUBLISHED"
    ) {
      res.status(404).json({ message: "Track not found." });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        ownedArtist: {
          select: { name: true },
        },
      },
    });

    if (!user) {
      res.status(401).json({ message: "Authentication required." });
      return;
    }

    const username =
      user.ownedArtist?.name ||
      user.email.split("@")[0]?.trim() ||
      "Listener";
    const timestamp = Math.max(
      0,
      Math.min(track.duration, payload.timestamp ?? 0),
    );

    const created = await prisma.trackComment.create({
      data: {
        id: `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        trackId: track.id,
        userId: user.id,
        username: username.slice(0, 64),
        content: payload.content,
        timestamp,
        createdAt: new Date(),
      },
    });

    res.status(201).json(serializeComment(created));
  }),
);

router.post(
  "/releases/:releaseId/like",
  requireAuth,
  asyncHandler(async (req, res) => {
    const release = await prisma.release.findUnique({
      where: { id: req.params.releaseId },
      select: { id: true, published: true, status: true },
    });

    if (!release || !release.published || release.status !== "PUBLISHED") {
      res.status(404).json({ message: "Release not found." });
      return;
    }

    const existing = await prisma.releaseLike.findUnique({
      where: {
        releaseId_userId: {
          releaseId: release.id,
          userId: req.user.id,
        },
      },
    });

    if (existing) {
      await prisma.releaseLike.delete({
        where: {
          releaseId_userId: {
            releaseId: release.id,
            userId: req.user.id,
          },
        },
      });
    } else {
      await prisma.releaseLike.create({
        data: {
          releaseId: release.id,
          userId: req.user.id,
        },
      });
    }

    const count = await prisma.releaseLike.count({
      where: { releaseId: release.id },
    });

    res.json({
      likedByMe: !existing,
      totalLikes: count,
    });
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
          where: { isVisible: true, release: publishedReleaseWhere },
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
        isVisible: true,
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
          isVisible: true,
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
          isVisible: true,
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
