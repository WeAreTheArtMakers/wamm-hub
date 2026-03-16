import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import type { Artist } from '@/types/music';
import { formatNumber } from '@/lib/music';
import { motion } from 'framer-motion';

interface ArtistCardProps {
  artist: Artist;
  index?: number;
}

export function ArtistCard({ artist, index = 0 }: ArtistCardProps) {
  const trackCount = artist.trackCount ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
    >
      <Link to={`/artist/${artist.slug}`} className="group block">
        <div className="relative aspect-square overflow-hidden bg-secondary mb-3">
          {artist.avatarUrl ? (
            <img src={artist.avatarUrl} alt={artist.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-accent/5 flex items-center justify-center">
              <span className="font-display text-3xl text-muted-foreground/30">
                {artist.name.charAt(0)}
              </span>
            </div>
          )}
          <div className="absolute inset-0 bg-background/0 group-hover:bg-background/40 transition-colors flex items-center justify-center">
            <div className="w-10 h-10 flex items-center justify-center bg-foreground text-background opacity-0 group-hover:opacity-100 transition-opacity press-effect">
              <Play className="w-4 h-4 ml-0.5" />
            </div>
          </div>
          {artist.verified && (
            <div className="absolute top-2 left-2 bg-accent px-1.5 py-0.5 font-mono-data text-accent-foreground">
              ✓
            </div>
          )}
        </div>
        <h3 className="text-sm font-bold uppercase tracking-tight truncate group-hover:text-accent transition-colors">
          {artist.name}
        </h3>
        <div className="flex items-center gap-2 font-mono-data text-muted-foreground">
          <span>{trackCount} tracks</span>
          <span>·</span>
          <span>{formatNumber(artist.followers)} followers</span>
        </div>
      </Link>
    </motion.div>
  );
}
