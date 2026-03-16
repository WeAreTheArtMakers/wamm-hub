import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArtistCard } from "@/components/music/ArtistCard";
import { api } from "@/lib/api";

export default function ArtistsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["artists"],
    queryFn: () => api.getArtists(),
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-[1400px] mx-auto px-4 py-8"
    >
      <h1 className="font-display text-3xl mb-6">Artists</h1>

      {isLoading && (
        <p className="font-mono-data text-muted-foreground">Loading artists...</p>
      )}

      {error && (
        <p className="font-mono-data text-destructive">Failed to load artists.</p>
      )}

      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {data.map((artist, i) => (
            <ArtistCard key={artist.id} artist={artist} index={i} />
          ))}
        </div>
      )}
    </motion.div>
  );
}
