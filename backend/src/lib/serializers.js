const formatDate = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
};

const parseWaveform = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const serializeComment = (comment) => ({
  id: comment.id,
  userId: comment.userId ?? "",
  username: comment.username,
  avatarUrl: comment.avatarUrl ?? "",
  content: comment.content,
  timestamp: comment.timestamp,
  createdAt: formatDate(comment.createdAt),
});

export const serializeTrack = (track) => ({
  id: track.id,
  title: track.title,
  artistId: track.artistId,
  artistName: track.artist?.name ?? "",
  artistSlug: track.artist?.slug ?? "",
  releaseId: track.releaseId ?? undefined,
  coverArtUrl: track.coverArtUrl ?? "",
  audioUrl: track.audioUrl,
  previewUrl: track.previewUrl ?? track.audioUrl,
  highQualityUrl: track.highQualityUrl ?? undefined,
  originalUrl: track.originalUrl ?? undefined,
  duration: track.duration,
  bpm: track.bpm ?? undefined,
  key: track.keySignature ?? undefined,
  genre: track.genre?.name ?? "Unknown",
  waveform: parseWaveform(track.waveformJson),
  price: Number(track.price ?? 0),
  currency: track.currency ?? "USD",
  isForSale: Boolean(track.isForSale),
  sourcePath: track.sourcePath ?? undefined,
  plays: track.plays,
  likes: track.likes,
  comments: (track.comments ?? []).map(serializeComment),
  createdAt: formatDate(track.createdAt),
});

export const serializeRelease = (release) => {
  const tracks = (release.tracks ?? []).map(serializeTrack);
  const totalPlays = tracks.reduce((sum, track) => sum + track.plays, 0);
  const totalLikes = tracks.reduce((sum, track) => sum + track.likes, 0);
  const communityLikes =
    typeof release._count?.likes === "number" ? release._count.likes : 0;

  return {
    id: release.id,
    title: release.title,
    slug: release.slug,
    artistId: release.artistId,
    artistName: release.artist?.name ?? "",
    artistSlug: release.artist?.slug ?? "",
    artistPayment: {
      iban: release.artist?.payoutIban ?? "",
      ibanName: release.artist?.payoutIbanName ?? "",
      wallet: release.artist?.payoutWallet ?? "",
      network: release.artist?.payoutNetwork ?? "",
    },
    type: release.type,
    coverArtUrl: release.coverArtUrl ?? "",
    description: release.description,
    price: Number(release.price),
    currency: release.currency,
    status: release.status,
    isForSale: Boolean(release.isForSale),
    sourceRepo: release.sourceRepo ?? undefined,
    trackIds: tracks.map((track) => track.id),
    tracks,
    trackCount: tracks.length,
    totalPlays,
    totalLikes,
    communityLikes,
    genres: (release.genres ?? []).map((entry) => entry.genre.name),
    releaseDate: formatDate(release.releaseDate),
    published: release.published,
    featured: release.featured,
  };
};

export const serializeArtist = (artist, trackCount) => ({
  id: artist.id,
  name: artist.name,
  slug: artist.slug,
  bio: artist.bio,
  avatarUrl: artist.avatarUrl ?? "",
  bannerUrl: artist.bannerUrl ?? "",
  verified: artist.verified,
  location: artist.location,
  genres: (artist.genres ?? []).map((entry) => entry.genre.name),
  followers: artist.followers,
  monthlyListeners: artist.monthlyListeners,
  trackCount:
    typeof trackCount === "number"
      ? trackCount
      : artist._count?.tracks ?? 0,
  ownerUserId: artist.ownerUserId ?? undefined,
  paymentSettings: {
    iban: artist.payoutIban ?? "",
    ibanName: artist.payoutIbanName ?? "",
    wallet: artist.payoutWallet ?? "",
    network: artist.payoutNetwork ?? "",
  },
});

export const serializeTourDate = (tourDate) => ({
  id: tourDate.id,
  artistId: tourDate.artistId,
  date: formatDate(tourDate.date),
  venue: tourDate.venue,
  city: tourDate.city,
  country: tourDate.country,
  ticketUrl: tourDate.ticketUrl ?? undefined,
});

export const serializeOrder = (order) => ({
  id: order.id,
  userId: order.userId,
  releaseId: order.releaseId ?? undefined,
  trackId: order.trackId ?? undefined,
  releaseTitle: order.releaseTitle,
  artistName: order.artistName,
  status: order.status,
  totalAmount: Number(order.totalAmount),
  platformFee: Number(order.platformFee),
  artistPayout: Number(order.artistPayout),
  paymentMethod: order.paymentMethod,
  cryptoTxHash: order.cryptoTxHash ?? undefined,
  paymentNote: order.paymentNote ?? undefined,
  buyerWallet: order.buyerWallet ?? undefined,
  artistWallet: order.artistWallet ?? undefined,
  platformWallet: order.platformWallet ?? undefined,
  createdAt: formatDate(order.createdAt),
});
