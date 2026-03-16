import type { PlayerTrack } from "@/store/usePlayer";
import type { Track } from "@/types/music";

export const trackToPlayerTrack = (track: Track): PlayerTrack => ({
  id: track.id,
  title: track.title,
  artistName: track.artistName,
  artistSlug: track.artistSlug,
  coverArtUrl: track.coverArtUrl,
  audioUrl: track.previewUrl || track.audioUrl,
  duration: track.duration,
  bpm: track.bpm,
  waveform: track.waveform,
});

export const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export const formatNumber = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};
