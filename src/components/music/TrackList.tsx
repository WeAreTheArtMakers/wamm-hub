import { Play, Pause, Heart, MessageCircle } from 'lucide-react';
import type { Track } from '@/types/music';
import { getCoverForTrack } from '@/data/covers';
import { formatDuration, formatNumber, trackToPlayerTrack } from '@/lib/music';
import { usePlayer } from '@/store/usePlayer';

interface TrackListProps {
  tracks: Track[];
  showCover?: boolean;
  showArtist?: boolean;
  numbered?: boolean;
  onTrackSelect?: (track: Track) => void;
}

export function TrackList({
  tracks,
  showCover = false,
  showArtist = true,
  numbered = true,
  onTrackSelect,
}: TrackListProps) {
  const { currentTrack, isPlaying, setTrack, togglePlay } = usePlayer();

  const handleTrackClick = (track: Track) => {
    onTrackSelect?.(track);
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      const playerTrack = {
        ...trackToPlayerTrack(track),
        coverArtUrl:
          track.coverArtUrl || getCoverForTrack(track.id, track.releaseId),
      };
      const queue = tracks
        .filter((t) => t.id !== track.id)
        .map((t) => ({
          ...trackToPlayerTrack(t),
          coverArtUrl: t.coverArtUrl || getCoverForTrack(t.id, t.releaseId),
        }));
      setTrack(playerTrack, queue);
    }
  };

  return (
    <div className="divide-y divide-border">
      {tracks.map((track, idx) => {
        const isActive = currentTrack?.id === track.id;
        const cover = track.coverArtUrl || getCoverForTrack(track.id, track.releaseId);

        return (
          <div
            key={track.id}
            onClick={() => handleTrackClick(track)}
            className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors surface-hover group ${
              isActive ? 'bg-secondary' : 'hover:bg-secondary/50'
            }`}
          >
            {/* Number / play icon */}
            <div className="w-6 flex-shrink-0 text-center">
              <span className={`font-mono-data group-hover:hidden ${isActive ? 'text-accent' : 'text-muted-foreground'}`}>
                {numbered ? String(idx + 1).padStart(2, '0') : ''}
              </span>
              <span className="hidden group-hover:inline text-foreground">
                {isActive && isPlaying ? <Pause className="w-3 h-3 inline" /> : <Play className="w-3 h-3 inline ml-0.5" />}
              </span>
            </div>

            {/* Cover */}
            {showCover && (
              <div className="w-8 h-8 bg-secondary flex-shrink-0 overflow-hidden">
                {cover ? (
                  <img src={cover} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-accent/10" />
                )}
              </div>
            )}

            {/* Title & Artist */}
            <div className="flex-1 min-w-0">
              <h4 className={`text-sm font-medium truncate ${isActive ? 'text-accent' : ''}`}>
                {track.title}
              </h4>
              {showArtist && (
                <p className="font-mono-data text-muted-foreground truncate">{track.artistName}</p>
              )}
            </div>

            {/* Stats */}
            <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
              <span className="font-mono-data text-muted-foreground flex items-center gap-1">
                <Heart className="w-2.5 h-2.5" /> {formatNumber(track.likes)}
              </span>
              <span className="font-mono-data text-muted-foreground flex items-center gap-1">
                <MessageCircle className="w-2.5 h-2.5" /> {track.comments.length}
              </span>
            </div>

            {/* BPM & Key */}
            <div className="hidden md:flex items-center gap-3 flex-shrink-0">
              {track.bpm && <span className="font-mono-data text-muted-foreground">{track.bpm}</span>}
              {track.key && <span className="font-mono-data text-muted-foreground">{track.key}</span>}
            </div>

            {/* Duration */}
            <span className="font-mono-data text-muted-foreground flex-shrink-0 w-10 text-right">
              {formatDuration(track.duration)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
