import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Repeat,
  Shuffle,
} from "lucide-react";
import { usePlayer } from "@/store/usePlayer";
import { formatDuration } from "@/lib/music";
import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useRef } from "react";

export function GlobalPlayer() {
  const {
    currentTrack,
    isPlaying,
    togglePlay,
    currentTime,
    setProgress,
    setDuration,
    volume,
    isMuted,
    toggleMute,
    next,
    previous,
    repeat,
    toggleRepeat,
    shuffle,
    toggleShuffle,
    pause,
    play,
  } = usePlayer();

  const progressRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!audioRef.current || !currentTrack) return;
    const audio = audioRef.current;
    audio.src = currentTrack.audioUrl;
    audio.load();
  }, [currentTrack]);

  useEffect(() => {
    if (!audioRef.current || !currentTrack) return;
    if (isPlaying) {
      audioRef.current
        .play()
        .catch(() => {
          pause();
        });
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, currentTrack, pause]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  const handleProgressClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!progressRef.current || !audioRef.current) return;
      const rect = progressRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const nextTime = ratio * (audioRef.current.duration || currentTrack?.duration || 0);
      audioRef.current.currentTime = nextTime;
      setProgress(Math.floor(nextTime));
    },
    [currentTrack?.duration, setProgress],
  );

  if (!currentTrack) return null;

  const safeDuration = Math.max(currentTrack.duration, 1);
  const progress = Math.max(0, Math.min(100, (currentTime / safeDuration) * 100));

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed bottom-3 left-2 right-2 z-50 sm:bottom-6 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[calc(100%-2rem)] sm:max-w-[680px]"
      >
        <audio
          ref={audioRef}
          preload="metadata"
          onTimeUpdate={(event) =>
            setProgress(Math.floor(event.currentTarget.currentTime || 0))
          }
          onLoadedMetadata={(event) =>
            setDuration(Math.floor(event.currentTarget.duration || currentTrack.duration))
          }
          onEnded={() => {
            if (repeat === "one" && audioRef.current) {
              audioRef.current.currentTime = 0;
              play();
              return;
            }
            next();
          }}
        />

        <div className="bg-background/98 backdrop-blur-xl border razor-border shadow-2xl shadow-background/80 px-3 py-2 sm:px-4 sm:py-3 flex items-center gap-2 sm:gap-4">
          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-secondary overflow-hidden flex-shrink-0">
            {currentTrack.coverArtUrl ? (
              <img
                src={currentTrack.coverArtUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-accent/20" />
            )}
          </div>

          <div className="min-w-0 flex-shrink-0 w-20 sm:w-28">
            <h4 className="text-xs font-bold uppercase tracking-tight truncate">
              {currentTrack.title}
            </h4>
            <p className="font-mono-data text-muted-foreground truncate">
              {currentTrack.artistName}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={previous}
              className="text-muted-foreground hover:text-foreground transition-colors press-effect"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={togglePlay}
              className="w-8 h-8 flex items-center justify-center bg-foreground text-background hover:bg-accent hover:text-accent-foreground transition-colors press-effect"
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5 ml-0.5" />
              )}
            </button>
            <button
              onClick={next}
              className="text-muted-foreground hover:text-foreground transition-colors press-effect"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 flex items-center gap-2 min-w-0">
            <span className="font-mono-data text-muted-foreground flex-shrink-0 w-8 text-right hidden min-[420px]:block">
              {formatDuration(currentTime)}
            </span>
            <div
              ref={progressRef}
              onClick={handleProgressClick}
              className="flex-1 h-[2px] bg-secondary cursor-pointer relative group"
            >
              <div
                className="absolute top-0 left-0 h-full bg-foreground transition-all"
                style={{ width: `${progress}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `${progress}%` }}
              />
            </div>
            <span className="font-mono-data text-muted-foreground flex-shrink-0 w-8 text-right">
              {formatDuration(currentTrack.duration)}
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
            {currentTrack.bpm && (
              <span className="font-mono-data text-muted-foreground">
                {currentTrack.bpm} BPM
              </span>
            )}
            <button
              onClick={toggleShuffle}
              className={`transition-colors press-effect ${shuffle ? "text-accent" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Shuffle className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={toggleRepeat}
              className={`transition-colors press-effect ${repeat !== "off" ? "text-accent" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Repeat className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={toggleMute}
              className="text-muted-foreground hover:text-foreground transition-colors press-effect"
            >
              {isMuted ? (
                <VolumeX className="w-3.5 h-3.5" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
