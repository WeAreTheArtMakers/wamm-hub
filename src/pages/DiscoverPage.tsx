import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { ReleaseCard } from "@/components/music/ReleaseCard";
import { TrackList } from "@/components/music/TrackList";
import { ArtistCard } from "@/components/music/ArtistCard";
import { api } from "@/lib/api";

type DiscoverTab = "releases" | "tracks" | "artists";

export default function DiscoverPage() {
  const [tab, setTab] = useState<DiscoverTab>("releases");
  const [genre, setGenre] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["discover", genre],
    queryFn: () => api.getDiscover({ genre: genre ?? undefined }),
  });

  const tabs: { key: DiscoverTab; label: string }[] = [
    { key: "releases", label: "Releases" },
    { key: "tracks", label: "Tracks" },
    { key: "artists", label: "Artists" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-[1400px] mx-auto px-4 py-8"
    >
      <h1 className="font-display text-3xl mb-6">Discover</h1>

      <div className="flex gap-0 border-b razor-border mb-6 overflow-x-auto scrollbar-hide">
        {tabs.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`px-4 py-2.5 font-mono-data whitespace-nowrap transition-colors border-b-2 -mb-px ${
              tab === item.key
                ? "text-foreground border-accent"
                : "text-muted-foreground border-transparent hover:text-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab !== "artists" && data && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setGenre(null)}
            className={`px-2.5 py-1 font-mono-data transition-colors press-effect ${
              !genre
                ? "bg-foreground text-background"
                : "razor-border text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          {data.genres.map((item) => (
            <button
              key={item}
              onClick={() => setGenre(item === genre ? null : item)}
              className={`px-2.5 py-1 font-mono-data transition-colors press-effect ${
                genre === item
                  ? "bg-foreground text-background"
                  : "razor-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      )}

      {isLoading && (
        <p className="font-mono-data text-muted-foreground">Loading discover feed...</p>
      )}

      {error && (
        <p className="font-mono-data text-destructive">Failed to load discover feed.</p>
      )}

      {data && tab === "releases" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
          {data.releases.map((release, i) => (
            <ReleaseCard key={release.id} release={release} index={i} />
          ))}
        </div>
      )}

      {data && tab === "tracks" && (
        <div className="razor-border overflow-hidden">
          <TrackList tracks={data.tracks} showCover showArtist />
        </div>
      )}

      {data && tab === "artists" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {data.artists.map((artist, i) => (
            <ArtistCard key={artist.id} artist={artist} index={i} />
          ))}
        </div>
      )}
    </motion.div>
  );
}
