import fs from "node:fs/promises";
import path from "node:path";

const REMOTE_UPLOAD_URL = process.env.REMOTE_MEDIA_UPLOAD_URL?.trim() ?? "";
const REMOTE_UPLOAD_TOKEN = process.env.REMOTE_MEDIA_TOKEN?.trim() ?? "";
const REMOTE_PUBLIC_BASE_URL = (
  process.env.REMOTE_MEDIA_PUBLIC_BASE_URL ?? "https://wearetheartmakers.com/music"
).replace(/\/$/, "");
const REMOTE_STRICT =
  String(process.env.REMOTE_MEDIA_STRICT ?? "true").toLowerCase() === "true";

const sanitizeSegment = (value, fallback = "item") => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");

  return normalized || fallback;
};

const sanitizeFileName = (value, fallback = "file.bin") => {
  const candidate = path.basename(String(value || fallback));
  const ext = path.extname(candidate);
  const stem = candidate.slice(0, ext ? -ext.length : undefined);
  const safeStem = sanitizeSegment(stem, "file");
  const safeExt = ext.replace(/[^a-z0-9.]/gi, "").toLowerCase();
  return `${safeStem}${safeExt}`;
};

const toAbsoluteRemoteUrl = (rawUrl) => {
  if (!rawUrl) return "";
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) return rawUrl;
  const normalized = rawUrl.replace(/^\/+/, "");
  return `${REMOTE_PUBLIC_BASE_URL}/${normalized}`;
};

export const isRemoteUploadEnabled = () =>
  Boolean(REMOTE_UPLOAD_URL && REMOTE_UPLOAD_TOKEN);

export const isRemoteUploadStrict = () => REMOTE_STRICT;

export const uploadFileToRemote = async ({
  localFilePath,
  artistSlug,
  releaseSlug,
  trackSlug,
  kind,
  fileName,
  mimeType,
}) => {
  if (!isRemoteUploadEnabled()) return null;

  const buffer = await fs.readFile(localFilePath);
  const form = new FormData();
  form.append("artistSlug", sanitizeSegment(artistSlug, "artist"));
  form.append("releaseSlug", sanitizeSegment(releaseSlug, "release"));
  form.append("trackSlug", sanitizeSegment(trackSlug, "track"));
  form.append("kind", sanitizeSegment(kind, "asset"));
  const safeFileName = sanitizeFileName(fileName, path.basename(localFilePath));
  form.append("targetFileName", safeFileName);
  form.append(
    "file",
    new Blob([buffer], { type: mimeType || "application/octet-stream" }),
    safeFileName,
  );

  const response = await fetch(REMOTE_UPLOAD_URL, {
    method: "POST",
    headers: {
      "X-WAMM-TOKEN": REMOTE_UPLOAD_TOKEN,
    },
    body: form,
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && typeof payload.message === "string"
        ? payload.message
        : text.slice(0, 200);
    throw new Error(`Remote upload failed (${response.status}): ${message}`);
  }

  const candidateUrl =
    payload && typeof payload === "object"
      ? typeof payload.url === "string"
        ? payload.url
        : typeof payload.path === "string"
          ? payload.path
          : ""
      : "";

  const absoluteUrl = toAbsoluteRemoteUrl(candidateUrl);
  if (!absoluteUrl) {
    throw new Error("Remote upload response did not include url/path.");
  }

  return absoluteUrl;
};
