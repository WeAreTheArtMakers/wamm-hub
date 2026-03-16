import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ReleaseCard } from "@/components/music/ReleaseCard";
import { TrackList } from "@/components/music/TrackList";
import { ArtistCard } from "@/components/music/ArtistCard";
import { api } from "@/lib/api";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const q = query.toLowerCase().trim();

  const { data, isLoading, error } = useQuery({
    queryKey: ["search", q],
    queryFn: () => api.search(q),
    enabled: q.length > 0,
  });

  const matchedReleases = data?.releases ?? [];
  const matchedTracks = data?.tracks ?? [];
  const matchedArtists = data?.artists ?? [];
  const hasResults =
    matchedReleases.length > 0 ||
    matchedTracks.length > 0 ||
    matchedArtists.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-[1400px] mx-auto px-4 py-8"
    >
      <Link
        to="/"
        className="inline-flex items-center gap-1 font-mono-data text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="w-3 h-3" /> Back
      </Link>

      <div className="relative mb-8">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search artists, tracks, releases..."
          className="w-full pl-10 pr-4 py-3 bg-secondary razor-border text-foreground text-sm focus:outline-none focus:border-accent transition-colors"
          autoFocus
        />
      </div>

      {isLoading && q && (
        <p className="text-sm text-muted-foreground">Searching...</p>
      )}

      {error && q && (
        <p className="text-sm text-destructive">Search failed.</p>
      )}

      {q && !isLoading && !error && !hasResults && (
        <p className="text-sm text-muted-foreground">No results for "{query}"</p>
      )}

      {matchedArtists.length > 0 && (
        <div className="mb-8">
          <h2 className="font-mono-data text-muted-foreground mb-4">Artists</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            {matchedArtists.map((artist, i) => (
              <ArtistCard key={artist.id} artist={artist} index={i} />
            ))}
          </div>
        </div>
      )}

      {matchedReleases.length > 0 && (
        <div className="mb-8">
          <h2 className="font-mono-data text-muted-foreground mb-4">Releases</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {matchedReleases.map((release, i) => (
              <ReleaseCard key={release.id} release={release} index={i} />
            ))}
          </div>
        </div>
      )}

      {matchedTracks.length > 0 && (
        <div className="mb-8">
          <h2 className="font-mono-data text-muted-foreground mb-4">Tracks</h2>
          <div className="razor-border overflow-hidden">
            <TrackList tracks={matchedTracks} showCover showArtist />
          </div>
        </div>
      )}
    </motion.div>
  );
}
