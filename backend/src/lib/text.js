import sanitizeFilename from "sanitize-filename";

export const slugify = (value) => {
  return sanitizeFilename(
    String(value ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""),
  )
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
};

export const humanizeSlug = (value) =>
  String(value ?? "")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

export const buildUniqueSlug = (base, existsFn) => {
  let candidate = slugify(base);
  let i = 2;
  while (existsFn(candidate)) {
    candidate = `${slugify(base)}-${i}`;
    i += 1;
  }
  return candidate;
};
