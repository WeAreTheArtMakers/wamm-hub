import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, MapPin, CheckCircle, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { ReleaseCard } from "@/components/music/ReleaseCard";
import { TrackList } from "@/components/music/TrackList";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/music";

type Tab = "releases" | "tracks" | "about" | "tour";

export default function ArtistProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("releases");

  const { data, isLoading, error } = useQuery({
    queryKey: ["artist", slug],
    queryFn: () => api.getArtistBySlug(slug ?? ""),
    enabled: Boolean(slug),
  });

  if (isLoading) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 py-20 text-center">
        <p className="font-mono-data text-muted-foreground">Loading artist...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 py-20 text-center">
        <h1 className="font-display text-2xl mb-4">Artist not found</h1>
        <Link to="/" className="font-mono-data text-accent">
          Go home
        </Link>
      </div>
    );
  }

  const { artist, releases, tracks, tourDates } = data;

  const tabs: { key: Tab; label: string }[] = [
    { key: "releases", label: `Releases (${releases.length})` },
    { key: "tracks", label: `Tracks (${tracks.length})` },
    { key: "about", label: "About" },
    { key: "tour", label: `Tour (${tourDates.length})` },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="h-48 md:h-64 bg-secondary relative">
        {artist.bannerUrl ? (
          <img src={artist.bannerUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-accent/10 to-background" />
        )}
      </div>

      <div className="max-w-[1400px] mx-auto px-4">
        <Link
          to="/"
          className="inline-flex items-center gap-1 font-mono-data text-muted-foreground hover:text-foreground transition-colors mt-4"
        >
          <ArrowLeft className="w-3 h-3" /> Back
        </Link>

        <div className="flex items-end gap-4 -mt-12 mb-8 relative z-10">
          <div className="w-24 h-24 md:w-32 md:h-32 bg-secondary razor-border overflow-hidden flex-shrink-0">
            {artist.avatarUrl ? (
              <img src={artist.avatarUrl} alt={artist.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-accent/10 flex items-center justify-center">
                <span className="font-display text-4xl text-muted-foreground/30">
                  {artist.name.charAt(0)}
                </span>
              </div>
            )}
          </div>
          <div className="pb-1">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl md:text-3xl">{artist.name}</h1>
              {artist.verified && <CheckCircle className="w-4 h-4 text-accent" />}
            </div>
            <div className="flex items-center gap-3 font-mono-data text-muted-foreground mt-1">
              <span className="flex items-center gap-1">
                <MapPin className="w-2.5 h-2.5" /> {artist.location}
              </span>
              <span>{formatNumber(artist.followers)} followers</span>
              <span>{formatNumber(artist.monthlyListeners)} monthly</span>
            </div>
            <div className="flex gap-1.5 mt-2">
              {artist.genres.map((genre) => (
                <span
                  key={genre}
                  className="px-2 py-0.5 razor-border font-mono-data text-muted-foreground"
                >
                  {genre}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-0 border-b razor-border mb-8 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 font-mono-data whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === tab.key
                  ? "text-foreground border-accent"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mb-16">
          {activeTab === "releases" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 md:gap-6">
              {releases.map((release, i) => (
                <ReleaseCard key={release.id} release={release} index={i} />
              ))}
            </div>
          )}

          {activeTab === "tracks" && (
            <div className="razor-border overflow-hidden">
              <TrackList tracks={tracks} showArtist={false} showCover />
            </div>
          )}

          {activeTab === "about" && (
            <div className="max-w-lg space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {artist.bio}
              </p>
            </div>
          )}

          {activeTab === "tour" && (
            <div className="space-y-2">
              {tourDates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming dates.</p>
              ) : (
                tourDates.map((tourDate) => (
                  <div
                    key={tourDate.id}
                    className="flex items-center gap-4 p-3 razor-border surface surface-hover"
                  >
                    <div className="flex-shrink-0 w-16 text-center">
                      <span className="font-mono-data text-accent">
                        {new Date(tourDate.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold truncate">{tourDate.venue}</h4>
                      <p className="font-mono-data text-muted-foreground">
                        {tourDate.city}, {tourDate.country}
                      </p>
                    </div>
                    {tourDate.ticketUrl && (
                      <a
                        href={tourDate.ticketUrl}
                        className="flex items-center gap-1 px-3 py-1 razor-border font-mono-data text-muted-foreground hover:text-foreground transition-colors press-effect"
                      >
                        <Calendar className="w-3 h-3" /> Tickets
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
