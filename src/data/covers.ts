const defaultCover = "/placeholder.svg";

export function getCoverForRelease(_releaseId: string): string {
  return defaultCover;
}

export function getCoverForTrack(_trackId: string, _releaseId?: string): string {
  return defaultCover;
}
