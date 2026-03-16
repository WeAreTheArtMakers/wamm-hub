import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { ReleaseCard } from "@/components/music/ReleaseCard";
import { ArtistCard } from "@/components/music/ArtistCard";
import { TrackList } from "@/components/music/TrackList";
import { api } from "@/lib/api";

function SectionHeader({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h2 className="font-display text-lg">{title}</h2>
      {href && (
        <Link
          to={href}
          className="font-mono-data text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          View All <ArrowRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}

const Index = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["home"],
    queryFn: api.getHome,
  });

  if (isLoading) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 py-16">
        <p className="font-mono-data text-muted-foreground">Loading home feed...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 py-16">
        <p className="font-mono-data text-destructive">Failed to load home feed.</p>
      </div>
    );
  }

  const { featuredReleases, latestReleases, trendingTracks, artists } = data;

  return (
    <div className="max-w-[1400px] mx-auto px-4">
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="py-16 md:py-24"
      >
        <div className="max-w-2xl">
          <h1 className="font-display text-4xl md:text-6xl leading-[0.95] mb-4">
            Music deserves
            <br />
            <span className="text-accent">better.</span>
          </h1>
          <p className="text-muted-foreground text-base md:text-lg max-w-md mb-8 leading-relaxed">
            Direct-to-fan releases. Transparent fees. Artists keep 90%. Discover,
            stream, buy, and support independent music.
          </p>
          <div className="flex items-center gap-3">
            <Link
              to="/discover"
              className="px-5 py-2.5 bg-foreground text-background font-mono-data hover:bg-accent hover:text-accent-foreground transition-colors press-effect"
            >
              Explore Music
            </Link>
            <Link
              to="/register"
              className="px-5 py-2.5 razor-border font-mono-data text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors press-effect"
            >
              Start Selling
            </Link>
          </div>
        </div>
      </motion.section>

      <section className="mb-16">
        <SectionHeader title="Featured" href="/releases" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
          {featuredReleases.map((release, i) => (
            <ReleaseCard key={release.id} release={release} index={i} />
          ))}
        </div>
      </section>

      <section className="mb-16">
        <SectionHeader title="Trending" href="/discover" />
        <div className="razor-border overflow-hidden">
          <TrackList tracks={trendingTracks} showCover showArtist numbered={false} />
        </div>
      </section>

      <section className="mb-16">
        <SectionHeader title="Artists" href="/artists" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {artists.map((artist, i) => (
            <ArtistCard key={artist.id} artist={artist} index={i} />
          ))}
        </div>
      </section>

      <section className="mb-16">
        <SectionHeader title="Latest Releases" href="/releases" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
          {latestReleases.map((release, i) => (
            <ReleaseCard key={release.id} release={release} index={i} />
          ))}
        </div>
      </section>

      <section className="mb-16 py-12 border-t razor-border">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              label: "Artist Payout",
              value: "90%",
              desc: "Artists keep 90% of every sale. Transparent, always.",
            },
            {
              label: "Platform Fee",
              value: "10%",
              desc: "Simple, flat fee. No hidden costs or surprise deductions.",
            },
            {
              label: "Payment Options",
              value: "FIAT + CRYPTO",
              desc: "Accept card payments and crypto. USDT, USDC on multiple networks.",
            },
          ].map((item) => (
            <div key={item.label} className="space-y-2">
              <span className="font-mono-data text-muted-foreground">{item.label}</span>
              <h3 className="font-display text-3xl text-accent">{item.value}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Index;
