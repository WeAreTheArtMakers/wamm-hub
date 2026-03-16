import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import type { Release } from '@/types/music';
import { getCoverForRelease } from '@/data/covers';
import { usePlayer } from '@/store/usePlayer';
import { formatNumber, trackToPlayerTrack } from '@/lib/music';
import { motion } from 'framer-motion';

interface ReleaseCardProps {
  release: Release;
  index?: number;
}

export function ReleaseCard({ release, index = 0 }: ReleaseCardProps) {
  const setTrack = usePlayer((s) => s.setTrack);
  const releaseTracks = release.tracks ?? [];
  const totalPlays = release.totalPlays ?? releaseTracks.reduce((sum, track) => sum + track.plays, 0);
  const cover = release.coverArtUrl || getCoverForRelease(release.id);

  const handlePlay = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (releaseTracks.length > 0) {
      const first = releaseTracks[0];
      const playerTrack = {
        ...trackToPlayerTrack(first),
        coverArtUrl: cover,
      };
      const queue = releaseTracks.slice(1).map((t) => ({
        ...trackToPlayerTrack(t),
        coverArtUrl: cover,
      }));
      setTrack(playerTrack, queue);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
    >
      <Link to={`/release/${release.slug}`} className="group block">
        {/* Cover */}
        <div className="relative aspect-square overflow-hidden bg-secondary mb-3">
          {cover ? (
            <img src={cover} alt={release.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
          ) : (
            <div className="w-full h-full bg-accent/10" />
          )}

          {/* Play overlay */}
          <div className="absolute inset-0 bg-background/0 group-hover:bg-background/40 transition-colors duration-200 flex items-center justify-center">
            <button
              onClick={handlePlay}
              className="w-12 h-12 flex items-center justify-center bg-foreground text-background opacity-0 group-hover:opacity-100 transition-all duration-200 press-effect"
            >
              <Play className="w-5 h-5 ml-0.5" />
            </button>
          </div>

          {/* Price tag */}
          {release.price > 0 && (
            <div className="absolute top-2 right-2 bg-background/90 px-2 py-0.5 font-mono-data text-foreground">
              ${release.price.toFixed(2)}
            </div>
          )}
          {release.price === 0 && (
            <div className="absolute top-2 right-2 bg-accent px-2 py-0.5 font-mono-data text-accent-foreground">
              FREE
            </div>
          )}
        </div>

        {/* Info */}
        <div className="space-y-1">
          <h3 className="text-sm font-bold uppercase tracking-tight truncate group-hover:text-accent transition-colors">
            {release.title}
          </h3>
          <p className="font-mono-data text-muted-foreground">{release.artistName}</p>
          <div className="flex items-center gap-3 font-mono-data text-muted-foreground">
            <span>{release.type}</span>
            <span>·</span>
            <span>{release.trackCount ?? releaseTracks.length} tracks</span>
            <span>·</span>
            <span>{formatNumber(totalPlays)} plays</span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
