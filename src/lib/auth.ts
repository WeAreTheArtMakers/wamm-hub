import type { AuthUser } from "@/types/music";

const TOKEN_KEY = "authToken";
const USER_KEY = "authUser";

export const setSession = (token: string, user: AuthUser) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

export const getSessionToken = () => localStorage.getItem(TOKEN_KEY);

export const getSessionUser = (): AuthUser | null => {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.id !== "string") return null;
    if (typeof parsed.email !== "string") return null;
    if (parsed.role !== "listener" && parsed.role !== "artist") return null;
    return parsed;
  } catch {
    return null;
  }
};
