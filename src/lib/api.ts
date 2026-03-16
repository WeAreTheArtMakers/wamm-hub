import type {
  Artist,
  ArtistDetailsResponse,
  AuthMeResponse,
  AuthResponse,
  DiscoverResponse,
  HomeResponse,
  Order,
  OrderDownloadsResponse,
  Release,
  ReleasePurchaseResponse,
  SearchResponse,
  StudioDashboardResponse,
  StudioReleaseUploadResponse,
  Track,
} from "@/types/music";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

const buildQuery = (params?: Record<string, string | undefined>) => {
  if (!params) return "";
  const entries = Object.entries(params).filter(([, value]) => value);
  if (entries.length === 0) return "";
  const searchParams = new URLSearchParams(entries as [string, string][]);
  return `?${searchParams.toString()}`;
};

const getErrorMessage = (payload: unknown, fallback: string): string => {
  if (payload && typeof payload === "object" && "message" in payload) {
    const value = (payload as { message?: unknown }).message;
    if (typeof value === "string" && value) return value;
  }
  return fallback;
};

const getAuthToken = () => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("authToken");
};

const getBaseHeaders = (asJson: boolean) => {
  const token = getAuthToken();
  return {
    ...(asJson ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...getBaseHeaders(!isFormData),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, `Request failed with ${response.status}`));
  }

  return payload as T;
}

export const api = {
  getHome: () => request<HomeResponse>("/api/home"),

  getReleases: (params?: { genre?: string; featured?: boolean; q?: string }) =>
    request<Release[]>(
      `/api/releases${buildQuery({
        genre: params?.genre,
        featured: params?.featured ? "true" : undefined,
        q: params?.q,
      })}`,
    ),

  getReleaseBySlug: (slug: string) =>
    request<Release>(`/api/releases/${encodeURIComponent(slug)}`),

  getArtists: (params?: { q?: string }) =>
    request<Artist[]>(`/api/artists${buildQuery({ q: params?.q })}`),

  getArtistBySlug: (slug: string) =>
    request<ArtistDetailsResponse>(`/api/artists/${encodeURIComponent(slug)}`),

  getTracks: (params?: {
    genre?: string;
    artistId?: string;
    releaseId?: string;
    q?: string;
    sort?: "plays" | "newest";
  }) =>
    request<Track[]>(
      `/api/tracks${buildQuery({
        genre: params?.genre,
        artistId: params?.artistId,
        releaseId: params?.releaseId,
        q: params?.q,
        sort: params?.sort,
      })}`,
    ),

  getDiscover: (params?: { genre?: string }) =>
    request<DiscoverResponse>(`/api/discover${buildQuery({ genre: params?.genre })}`),

  search: (query: string) => request<SearchResponse>(`/api/search${buildQuery({ q: query })}`),

  register: (payload: {
    email: string;
    password: string;
    role: "listener" | "artist";
    artistName?: string;
  }) =>
    request<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  login: (payload: { email: string; password: string }) =>
    request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  me: () => request<AuthMeResponse>("/api/auth/me"),

  purchaseRelease: (
    releaseId: string,
    payload: {
      paymentMethod?: "STRIPE" | "CRYPTO" | "MANUAL";
      walletAddress?: string;
      txHash?: string;
      ibanReference?: string;
    } = {},
  ) =>
    request<ReleasePurchaseResponse>(
      `/api/orders/release/${encodeURIComponent(releaseId)}`,
      {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: payload.paymentMethod ?? "MANUAL",
          walletAddress: payload.walletAddress,
          txHash: payload.txHash,
          ibanReference: payload.ibanReference,
        }),
      },
    ),

  getMyOrders: () => request<Order[]>("/api/orders/my"),

  getOrderDownloads: (orderId: string) =>
    request<OrderDownloadsResponse>(`/api/orders/${encodeURIComponent(orderId)}/downloads`),

  getStudioDashboard: () => request<StudioDashboardResponse>("/api/studio/dashboard"),

  uploadStudioRelease: (payload: {
    title: string;
    description?: string;
    type?: "SINGLE" | "EP" | "ALBUM";
    price?: number;
    currency?: string;
    genres?: string;
    publish?: boolean;
    trackPrice?: number;
    tracks: File[];
    cover?: File;
  }) => {
    const formData = new FormData();
    formData.append("title", payload.title);
    if (payload.description) formData.append("description", payload.description);
    if (payload.type) formData.append("type", payload.type);
    if (typeof payload.price === "number") formData.append("price", String(payload.price));
    if (typeof payload.trackPrice === "number") {
      formData.append("trackPrice", String(payload.trackPrice));
    }
    if (payload.currency) formData.append("currency", payload.currency);
    if (payload.genres) formData.append("genres", payload.genres);
    formData.append("publish", payload.publish ? "true" : "false");
    payload.tracks.forEach((file) => formData.append("tracks", file));
    if (payload.cover) formData.append("cover", payload.cover);

    return request<StudioReleaseUploadResponse>("/api/studio/releases", {
      method: "POST",
      body: formData,
    });
  },

  publishStudioRelease: (releaseId: string) =>
    request<{ message: string; release: Release }>(
      `/api/studio/releases/${encodeURIComponent(releaseId)}/publish`,
      { method: "POST" },
    ),

  updateStudioProfile: (payload: {
    name?: string;
    bio?: string;
    location?: string;
    payoutIban?: string;
    payoutIbanName?: string;
    payoutWallet?: string;
    payoutNetwork?: string;
    avatar?: File;
    banner?: File;
    clearAvatar?: boolean;
    clearBanner?: boolean;
  }) => {
    const formData = new FormData();
    if (typeof payload.name === "string") formData.append("name", payload.name);
    if (typeof payload.bio === "string") formData.append("bio", payload.bio);
    if (typeof payload.location === "string") formData.append("location", payload.location);
    if (typeof payload.payoutIban === "string") {
      formData.append("payoutIban", payload.payoutIban);
    }
    if (typeof payload.payoutIbanName === "string") {
      formData.append("payoutIbanName", payload.payoutIbanName);
    }
    if (typeof payload.payoutWallet === "string") {
      formData.append("payoutWallet", payload.payoutWallet);
    }
    if (typeof payload.payoutNetwork === "string") {
      formData.append("payoutNetwork", payload.payoutNetwork);
    }
    if (payload.avatar) formData.append("avatar", payload.avatar);
    if (payload.banner) formData.append("banner", payload.banner);
    if (payload.clearAvatar) formData.append("clearAvatar", "true");
    if (payload.clearBanner) formData.append("clearBanner", "true");

    return request<{ message: string; artist: Artist }>(
      "/api/studio/profile",
      {
        method: "PATCH",
        body: formData,
      },
    );
  },

  updateStudioRelease: (
    releaseId: string,
    payload: {
      title?: string;
      description?: string;
      price?: number;
      isForSale?: boolean;
      status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
      cover?: File;
    },
  ) => {
    const formData = new FormData();
    if (typeof payload.title === "string") formData.append("title", payload.title);
    if (typeof payload.description === "string") {
      formData.append("description", payload.description);
    }
    if (typeof payload.price === "number") formData.append("price", String(payload.price));
    if (typeof payload.isForSale === "boolean") {
      formData.append("isForSale", payload.isForSale ? "true" : "false");
    }
    if (payload.status) formData.append("status", payload.status);
    if (payload.cover) formData.append("cover", payload.cover);

    return request<{ message: string; release: Release }>(
      `/api/studio/releases/${encodeURIComponent(releaseId)}`,
      {
        method: "PATCH",
        body: formData,
      },
    );
  },

  updateStudioTrack: (
    trackId: string,
    payload: {
      title?: string;
      genre?: string;
      price?: number;
      bpm?: number;
      keySignature?: string;
      isForSale?: boolean;
      cover?: File;
    },
  ) => {
    const formData = new FormData();
    if (typeof payload.title === "string") formData.append("title", payload.title);
    if (typeof payload.genre === "string") formData.append("genre", payload.genre);
    if (typeof payload.price === "number") formData.append("price", String(payload.price));
    if (typeof payload.bpm === "number") formData.append("bpm", String(payload.bpm));
    if (typeof payload.keySignature === "string") {
      formData.append("keySignature", payload.keySignature);
    }
    if (typeof payload.isForSale === "boolean") {
      formData.append("isForSale", payload.isForSale ? "true" : "false");
    }
    if (payload.cover) formData.append("cover", payload.cover);

    return request<{ message: string; track: Track }>(
      `/api/studio/tracks/${encodeURIComponent(trackId)}`,
      {
        method: "PATCH",
        body: formData,
      },
    );
  },
};
