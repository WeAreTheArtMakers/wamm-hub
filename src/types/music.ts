export interface Artist {
  id: string;
  name: string;
  slug: string;
  bio: string;
  avatarUrl: string;
  bannerUrl: string;
  verified: boolean;
  location: string;
  genres: string[];
  followers: number;
  monthlyListeners: number;
  trackCount: number;
  ownerUserId?: string;
  paymentSettings: {
    iban: string;
    ibanName: string;
    wallet: string;
    network: string;
  };
}

export interface TrackComment {
  id: string;
  userId: string;
  username: string;
  avatarUrl: string;
  content: string;
  timestamp: number;
  createdAt: string;
}

export interface Track {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  artistSlug: string;
  releaseId?: string;
  coverArtUrl: string;
  audioUrl: string;
  previewUrl?: string;
  highQualityUrl?: string;
  originalUrl?: string;
  duration: number;
  bpm?: number;
  key?: string;
  genre: string;
  waveform: number[];
  price: number;
  currency: string;
  isForSale: boolean;
  sourcePath?: string;
  plays: number;
  likes: number;
  comments: TrackComment[];
  createdAt: string;
}

export interface Release {
  id: string;
  title: string;
  slug: string;
  artistId: string;
  artistName: string;
  artistSlug: string;
  artistPayment: {
    iban: string;
    ibanName: string;
    wallet: string;
    network: string;
  };
  type: "SINGLE" | "EP" | "ALBUM";
  coverArtUrl: string;
  description: string;
  price: number;
  currency: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  isForSale: boolean;
  sourceRepo?: string;
  trackIds: string[];
  tracks: Track[];
  trackCount: number;
  totalPlays: number;
  totalLikes: number;
  communityLikes: number;
  likedByMe?: boolean;
  genres: string[];
  releaseDate: string;
  published: boolean;
  featured: boolean;
}

export interface TourDate {
  id: string;
  artistId: string;
  date: string;
  venue: string;
  city: string;
  country: string;
  ticketUrl?: string;
}

export interface HomeResponse {
  featuredReleases: Release[];
  latestReleases: Release[];
  trendingTracks: Track[];
  artists: Artist[];
}

export interface DiscoverResponse {
  genres: string[];
  releases: Release[];
  tracks: Track[];
  artists: Artist[];
}

export interface SearchResponse {
  artists: Artist[];
  releases: Release[];
  tracks: Track[];
}

export interface ArtistDetailsResponse {
  artist: Artist;
  releases: Release[];
  tracks: Track[];
  tourDates: TourDate[];
}

export interface AuthUser {
  id: string;
  email: string;
  role: "listener" | "artist";
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface AuthMeResponse {
  user: AuthUser;
  artist: {
    id: string;
    name: string;
    slug: string;
    verified: boolean;
  } | null;
}

export interface Order {
  id: string;
  userId: string;
  releaseId?: string;
  trackId?: string;
  releaseTitle: string;
  artistName: string;
  status: "PENDING_PAYMENT" | "UNDER_REVIEW" | "PAID" | "FULFILLED" | "FAILED";
  totalAmount: number;
  platformFee: number;
  artistPayout: number;
  paymentMethod: "STRIPE" | "CRYPTO" | "MANUAL";
  cryptoTxHash?: string;
  paymentNote?: string;
  buyerWallet?: string;
  artistWallet?: string;
  platformWallet?: string;
  createdAt: string;
}

export interface PurchasePayload {
  paymentMethod?: "STRIPE" | "CRYPTO" | "MANUAL";
  walletAddress?: string;
  txHash?: string;
  ibanReference?: string;
}

export interface ReleasePurchaseResponse {
  order: Order;
  message: string;
}

export interface OrderDownloadsResponse {
  order: Order;
  downloads: Array<{
    trackId: string;
    title: string;
    url: string;
    format: string;
  }>;
}

export interface StudioDashboardResponse {
  artist: Artist;
  releases: Release[];
  tracks: Track[];
  recentOrders: Order[];
  activityLogs: Array<{
    id: string;
    entityType: string;
    action: string;
    details: Record<string, unknown>;
    createdAt: string;
  }>;
}

export interface StudioReleaseUploadResponse {
  message: string;
  release: Release;
  tracks: Track[];
}
