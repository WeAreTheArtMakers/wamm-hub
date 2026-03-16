import fs from "node:fs/promises";
import path from "node:path";

export const PROJECT_ROOT = process.cwd();
export const CONTENT_ROOT = path.resolve(PROJECT_ROOT, "content");
export const GENERATED_COVERS_ROOT = path.resolve(
  PROJECT_ROOT,
  "public/generated/covers",
);

export const ensureDirectory = async (directoryPath) => {
  await fs.mkdir(directoryPath, { recursive: true });
};

export const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

export const listDirectories = async (directoryPath) => {
  if (!(await fileExists(directoryPath))) return [];
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
};

export const listFiles = async (directoryPath) => {
  if (!(await fileExists(directoryPath))) return [];
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
};

export const relativeToContent = (absolutePath) => {
  const relativePath = path.relative(CONTENT_ROOT, absolutePath);
  return relativePath.split(path.sep).join("/");
};

export const toMediaUrl = (absolutePath) => {
  return `/media/${relativeToContent(absolutePath)}`;
};

export const parsePeaksFile = async (peaksPath) => {
  try {
    const content = await fs.readFile(peaksPath, "utf8");
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .map((value) => Math.max(0, Math.min(1, value)));
  } catch {
    return [];
  }
};

export const createSyntheticWaveform = (seed, length = 180) =>
  Array.from({ length }, (_, index) => {
    const x = (index + 1) * (seed + 17) * 0.097;
    const value = 0.5 + Math.sin(x) * 0.34 + Math.cos(x * 0.2) * 0.09;
    return Number(Math.max(0.08, Math.min(0.98, value)).toFixed(4));
  });
