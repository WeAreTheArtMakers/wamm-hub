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
};
