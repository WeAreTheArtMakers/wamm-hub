const ADMIN_TOKEN_KEY = "wammAdminToken";

export const setAdminToken = (token: string) => {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
};

export const getAdminToken = () => localStorage.getItem(ADMIN_TOKEN_KEY);

export const clearAdminToken = () => {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
};

