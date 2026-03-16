import { useRef, useCallback } from 'react';
import { usePlayer } from '@/store/usePlayer';

interface WaveformDisplayProps {
  waveform: number[];
  duration: number;
  trackId: string;
  comments?: { id: string; timestamp: number; content: string; username: string }[];
  height?: number;
}

export function WaveformDisplay({ waveform, duration, trackId, comments = [], height = 64 }: WaveformDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { currentTrack, currentTime, setProgress } = usePlayer();
  const isActive = currentTrack?.id === trackId;
  const progress = isActive && duration > 0 ? currentTime / duration : 0;

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !isActive) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setProgress(Math.floor(ratio * duration));
  }, [isActive, duration, setProgress]);

  const barCount = waveform.length;

  return (
    <div className="relative w-full group" ref={containerRef}>
      {/* Waveform bars */}
      <div
        onClick={handleClick}
        className={`flex items-end gap-px w-full ${isActive ? 'cursor-pointer' : 'cursor-default'}`}
        style={{ height }}
      >
        {waveform.map((peak, i) => {
          const barProgress = i / barCount;
          const isPassed = isActive && barProgress < progress;
          return (
            <div
              key={i}
              className={`flex-1 transition-colors duration-75 ${
                isPassed ? 'bg-accent' : 'bg-foreground/10 group-hover:bg-foreground/15'
              }`}
              style={{ height: `${peak * 100}%`, minWidth: 1 }}
            />
          );
        })}
      </div>

      {/* Comment markers */}
      {comments.map((comment) => (
        <div
          key={comment.id}
          className="absolute top-0 w-px h-full bg-foreground/20 hover:bg-accent transition-colors cursor-help z-10"
          style={{ left: `${(comment.timestamp / duration) * 100}%` }}
          title={`${comment.username}: ${comment.content}`}
        />
      ))}
    </div>
  );
}
