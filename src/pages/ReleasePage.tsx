import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Play, Share2, Heart, ShoppingCart, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { TrackList } from "@/components/music/TrackList";
import { WaveformDisplay } from "@/components/music/WaveformDisplay";
import { getCoverForRelease } from "@/data/covers";
import { api } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { formatDuration, formatNumber, trackToPlayerTrack } from "@/lib/music";
import { usePlayer } from "@/store/usePlayer";

const PLATFORM_FEE_RATE = 0.03;

export default function ReleasePage() {
  const { slug } = useParams<{ slug: string }>();
  const setTrack = usePlayer((state) => state.setTrack);
  const [downloadItems, setDownloadItems] = useState<
    Array<{ trackId: string; title: string; url: string; format: string }>
  >([]);

  const { data: release, isLoading, error } = useQuery({
    queryKey: ["release", slug],
    queryFn: () => api.getReleaseBySlug(slug ?? ""),
    enabled: Boolean(slug),
  });

  const purchaseMutation = useMutation({
    mutationFn: async (releaseId: string) => {
      const purchase = await api.purchaseRelease(releaseId, "MANUAL");
      const downloads = await api.getOrderDownloads(purchase.order.id);
      return downloads.downloads;
    },
    onSuccess: (downloads) => {
      setDownloadItems(downloads);
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 py-20 text-center">
        <p className="font-mono-data text-muted-foreground">Loading release...</p>
      </div>
    );
  }

  if (error || !release) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 py-20 text-center">
        <h1 className="font-display text-2xl mb-4">Release not found</h1>
        <Link to="/" className="font-mono-data text-accent">
          Go home
        </Link>
      </div>
    );
  }

  const releaseTracks = release.tracks ?? [];
  const cover = release.coverArtUrl || getCoverForRelease(release.id);
  const totalDuration = releaseTracks.reduce((sum, track) => sum + track.duration, 0);
  const totalPlays =
    release.totalPlays ?? releaseTracks.reduce((sum, track) => sum + track.plays, 0);
  const totalLikes =
    release.totalLikes ?? releaseTracks.reduce((sum, track) => sum + track.likes, 0);
  const platformFee = release.price * PLATFORM_FEE_RATE;
  const artistNet = release.price - platformFee;

  const handlePlayAll = () => {
    if (releaseTracks.length === 0) return;
    const first = releaseTracks[0];
    setTrack(
      {
        ...trackToPlayerTrack(first),
        coverArtUrl: cover,
      },
      releaseTracks.slice(1).map((track) => ({
        ...trackToPlayerTrack(track),
        coverArtUrl: cover,
      })),
    );
  };

  const handleBuy = () => {
    const user = getSessionUser();
    if (!user) {
      window.location.href = "/login";
      return;
    }
    purchaseMutation.mutate(release.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-[1400px] mx-auto px-4 py-8"
    >
      <Link
        to="/"
        className="inline-flex items-center gap-1 font-mono-data text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft className="w-3 h-3" /> Back
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] lg:grid-cols-[400px_1fr] gap-8 mb-12">
        <div className="space-y-4">
          <div className="aspect-square overflow-hidden bg-secondary">
            <img src={cover} alt={release.title} className="w-full h-full object-cover" />
          </div>

          <div className="razor-border p-4 space-y-3 surface">
            <span className="font-mono-data text-muted-foreground">Order Breakdown</span>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Release Price</span>
                <span>${release.price.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>WAMM Fee (3%)</span>
                <span>-${platformFee.toFixed(2)}</span>
              </div>
              <div className="h-px bg-border my-1" />
              <div className="flex justify-between text-accent font-bold">
                <span>Artist Receives</span>
                <span>${artistNet.toFixed(2)}</span>
              </div>
            </div>
            <button
              onClick={handleBuy}
              disabled={purchaseMutation.isPending || !release.isForSale}
              className="w-full py-3 bg-foreground text-background font-mono-data hover:bg-accent hover:text-accent-foreground transition-colors press-effect flex items-center justify-center gap-2"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              {purchaseMutation.isPending
                ? "Processing..."
                : release.isForSale
                  ? `Buy & Download — $${release.price.toFixed(2)}`
                  : "Not For Sale"}
            </button>
            {purchaseMutation.isError && (
              <p className="text-sm text-destructive">
                {purchaseMutation.error.message}
              </p>
            )}
            {downloadItems.length > 0 && (
              <div className="pt-2 space-y-1">
                <p className="font-mono-data text-accent text-xs">Downloads ready</p>
                {downloadItems.map((item) => (
                  <a
                    key={item.trackId}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    {item.title} ({item.format})
                  </a>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button className="flex-1 py-2 razor-border font-mono-data text-muted-foreground hover:text-foreground transition-colors press-effect flex items-center justify-center gap-1">
                <Heart className="w-3 h-3" /> Like
              </button>
              <button className="flex-1 py-2 razor-border font-mono-data text-muted-foreground hover:text-foreground transition-colors press-effect flex items-center justify-center gap-1">
                <Share2 className="w-3 h-3" /> Share
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <span className="font-mono-data text-accent">{release.type}</span>
            <h1 className="font-display text-3xl md:text-4xl mt-1">{release.title}</h1>
            <Link
              to={`/artist/${release.artistSlug}`}
              className="font-mono-data text-muted-foreground hover:text-foreground transition-colors mt-1 inline-block"
            >
              {release.artistName}
            </Link>
          </div>

          <div className="flex flex-wrap gap-4 font-mono-data text-muted-foreground">
            <span>{release.trackCount ?? releaseTracks.length} tracks</span>
            <span>{formatDuration(totalDuration)}</span>
            <span>{formatNumber(totalPlays)} plays</span>
            <span>{formatNumber(totalLikes)} likes</span>
            <span>{release.releaseDate}</span>
          </div>

          {release.description && (
            <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
              {release.description}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {release.genres.map((genre) => (
              <span
                key={genre}
                className="px-2 py-0.5 razor-border font-mono-data text-muted-foreground"
              >
                {genre}
              </span>
            ))}
          </div>

          <button
            onClick={handlePlayAll}
            className="flex items-center gap-2 px-4 py-2 bg-foreground text-background font-mono-data hover:bg-accent hover:text-accent-foreground transition-colors press-effect"
          >
            <Play className="w-3.5 h-3.5 ml-0.5" /> Play All
          </button>

          <div className="razor-border overflow-hidden">
            <TrackList tracks={releaseTracks} showArtist={false} />
          </div>

          {releaseTracks.length > 0 && (
            <div className="space-y-2">
              <span className="font-mono-data text-muted-foreground">
                {releaseTracks[0].title} — Waveform
              </span>
              <WaveformDisplay
                waveform={releaseTracks[0].waveform}
                duration={releaseTracks[0].duration}
                trackId={releaseTracks[0].id}
                comments={releaseTracks[0].comments}
                height={80}
              />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
