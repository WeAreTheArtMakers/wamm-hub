const DICEBEAR_BASE = "https://api.dicebear.com/9.x";

const sanitizeSeed = (value) =>
  encodeURIComponent(
    String(value || "wamm-user")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .slice(0, 80),
  );

export const buildAutoAvatarUrl = (seed, style = "bottts-neutral") => {
  const safeSeed = sanitizeSeed(seed);
  return `${DICEBEAR_BASE}/${encodeURIComponent(style)}/svg?seed=${safeSeed}&backgroundType=gradientLinear`;
};

