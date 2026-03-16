import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import { usePlayer } from "@/store/usePlayer";
import { autoAvatarUrl } from "@/lib/avatar";

interface WaveformDisplayProps {
  waveform: number[];
  duration: number;
  trackId: string;
  comments?: {
    id: string;
    timestamp: number;
    content: string;
    username: string;
    avatarUrl?: string;
  }[];
  height?: number;
}

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export function WaveformDisplay({
  waveform,
  duration,
  trackId,
  comments = [],
  height = 64,
}: WaveformDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pinnedCommentId, setPinnedCommentId] = useState<string | null>(null);
  const { currentTrack, currentTime, setProgress } = usePlayer();

  const isActive = currentTrack?.id === trackId;
  const safeDuration = Math.max(duration, 1);
  const progress = isActive && safeDuration > 0 ? currentTime / safeDuration : 0;

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(Math.floor(entry.contentRect.width));
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleWaveClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current || !isActive) return;
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      setProgress(Math.floor(ratio * safeDuration));
    },
    [isActive, safeDuration, setProgress],
  );

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

  const sortedComments = useMemo(
    () => [...comments].sort((a, b) => a.timestamp - b.timestamp),
    [comments],
  );

  const liveComment = useMemo(() => {
    if (!isActive || sortedComments.length === 0) return null;

    let latest = null as (typeof sortedComments)[number] | null;
    const playbackTime = currentTime + 0.35;
    for (let i = 0; i < sortedComments.length; i += 1) {
      const item = sortedComments[i];
      if (item.timestamp <= playbackTime) {
        latest = item;
      } else {
        break;
      }
    }
    return latest;
  }, [isActive, sortedComments, currentTime]);

  const pinnedComment =
    (pinnedCommentId && sortedComments.find((comment) => comment.id === pinnedCommentId)) ||
    null;
  const activeComment = pinnedComment || liveComment;
  const barCount = Math.max(bars.length, 1);

  const seekToComment = (timestamp: number) => {
    if (!isActive) return;
    setProgress(Math.floor(Math.max(0, Math.min(safeDuration, timestamp))));
  };

  return (
    <div className="space-y-3 min-w-0">
      <div className="relative w-full group min-w-0 overflow-hidden" ref={containerRef}>
        <div
          onClick={handleWaveClick}
          className={`relative flex items-end gap-px w-full min-w-0 overflow-hidden ${
            isActive ? "cursor-pointer" : "cursor-default"
          }`}
          style={{ height }}
        >
          {bars.map((peak, i) => {
            const barProgress = i / barCount;
            const isPassed = isActive && barProgress < progress;
            return (
              <div
                key={i}
                className={`flex-1 transition-colors duration-75 ${
                  isPassed ? "bg-accent" : "bg-foreground/10 group-hover:bg-foreground/15"
                }`}
                style={{ height: `${Math.max(0.04, peak) * 100}%`, minWidth: 1 }}
              />
            );
          })}

          {sortedComments.map((comment) => {
            const left =
              (Math.max(0, Math.min(safeDuration, comment.timestamp)) / safeDuration) * 100;
            const isCurrent = activeComment?.id === comment.id;

            return (
              <button
                type="button"
                key={comment.id}
                onClick={(event) => {
                  event.stopPropagation();
                  setPinnedCommentId(comment.id);
                  seekToComment(comment.timestamp);
                }}
                className={`absolute bottom-0 z-10 h-full w-1.5 transition-colors ${
                  isCurrent ? "bg-accent" : "bg-foreground/30 hover:bg-foreground/60"
                }`}
                style={{ left: `calc(${left}% - 2px)` }}
                title={`${formatTime(comment.timestamp)} ${comment.username}: ${comment.content}`}
              />
            );
          })}
        </div>
      </div>

      {activeComment && (
        <div className="razor-border bg-background/70 p-2.5 sm:p-3 text-sm">
          <div className="flex items-start gap-2">
            <img
              src={activeComment.avatarUrl || autoAvatarUrl(activeComment.username)}
              alt={activeComment.username}
              className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 razor-border object-cover"
              loading="lazy"
            />
            <div className="min-w-0">
              <div className="font-mono-data text-accent">
                {formatTime(activeComment.timestamp)} · {activeComment.username}
              </div>
              <p className="text-muted-foreground break-words">{activeComment.content}</p>
            </div>
          </div>
        </div>
      )}

      {sortedComments.length > 0 && (
        <div className="razor-border overflow-hidden">
          <div className="max-h-[240px] sm:max-h-[280px] overflow-y-auto divide-y divide-border">
            {sortedComments.map((comment) => {
              const isCurrent = activeComment?.id === comment.id;
              return (
                <button
                  type="button"
                  key={comment.id}
                  onClick={() => {
                    setPinnedCommentId(comment.id);
                    seekToComment(comment.timestamp);
                  }}
                  className={`w-full text-left p-2.5 sm:p-3 transition-colors ${
                    isCurrent ? "bg-foreground/10" : "hover:bg-foreground/5"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <img
                      src={comment.avatarUrl || autoAvatarUrl(comment.username)}
                      alt={comment.username}
                      className="w-6 h-6 sm:w-7 sm:h-7 shrink-0 razor-border object-cover"
                      loading="lazy"
                    />
                    <div className="min-w-0">
                      <div className="font-mono-data text-accent">
                        {formatTime(comment.timestamp)} · {comment.username}
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground break-words">
                        {comment.content}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
