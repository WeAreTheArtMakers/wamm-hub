const DICEBEAR_BASE = "https://api.dicebear.com/9.x";

const normalizeSeed = (value: string) =>
  encodeURIComponent(
    String(value || "wamm-user")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .slice(0, 80),
  );

export const autoAvatarUrl = (seed: string, style = "bottts-neutral") =>
  `${DICEBEAR_BASE}/${encodeURIComponent(style)}/svg?seed=${normalizeSeed(seed)}&backgroundType=gradientLinear`;

