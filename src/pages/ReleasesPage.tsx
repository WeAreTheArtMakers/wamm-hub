import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ReleaseCard } from "@/components/music/ReleaseCard";
import { api } from "@/lib/api";

export default function ReleasesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["releases"],
    queryFn: () => api.getReleases(),
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-[1400px] mx-auto px-4 py-8"
    >
      <h1 className="font-display text-3xl mb-6">All Releases</h1>

      {isLoading && (
        <p className="font-mono-data text-muted-foreground">Loading releases...</p>
      )}

      {error && (
        <p className="font-mono-data text-destructive">Failed to load releases.</p>
      )}

      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
          {data.map((release, i) => (
            <ReleaseCard key={release.id} release={release} index={i} />
          ))}
        </div>
      )}
    </motion.div>
  );
}
