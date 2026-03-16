import { useRef, useCallback, useEffect, useMemo, useState } from 'react';
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
  const [containerWidth, setContainerWidth] = useState(0);
  const { currentTrack, currentTime, setProgress } = usePlayer();
  const isActive = currentTrack?.id === trackId;
  const progress = isActive && duration > 0 ? currentTime / duration : 0;

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(Math.floor(entry.contentRect.width));
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !isActive) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setProgress(Math.floor(ratio * duration));
  }, [isActive, duration, setProgress]);

  const bars = useMemo(() => {
    if (!Array.isArray(waveform) || waveform.length === 0) return [];
    const maxBars = containerWidth > 0 ? Math.max(48, Math.floor(containerWidth / 3)) : 120;
    if (waveform.length <= maxBars) return waveform;

    const chunkSize = Math.ceil(waveform.length / maxBars);
    const compacted: number[] = [];
    for (let i = 0; i < waveform.length; i += chunkSize) {
      const chunk = waveform.slice(i, i + chunkSize);
      compacted.push(Math.max(...chunk));
    }
    return compacted;
  }, [waveform, containerWidth]);

  const barCount = Math.max(bars.length, 1);

  return (
    <div className="relative w-full group" ref={containerRef}>
      {/* Waveform bars */}
      <div
        onClick={handleClick}
        className={`flex items-end gap-px w-full ${isActive ? 'cursor-pointer' : 'cursor-default'}`}
        style={{ height }}
      >
        {bars.map((peak, i) => {
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
          className="absolute top-0 w-[2px] h-full bg-foreground/20 hover:bg-accent transition-colors cursor-help z-10"
          style={{ left: `${(comment.timestamp / duration) * 100}%` }}
          title={`${comment.username}: ${comment.content}`}
        />
      ))}
    </div>
  );
}
