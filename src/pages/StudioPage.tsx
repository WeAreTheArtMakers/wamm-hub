import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Upload, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";

export default function StudioPage() {
  const queryClient = useQueryClient();
  const sessionUser = useMemo(() => getSessionUser(), []);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [genres, setGenres] = useState("Electronic");
  const [price, setPrice] = useState("1.99");
  const [publish, setPublish] = useState(false);
  const [tracks, setTracks] = useState<File[]>([]);
  const [cover, setCover] = useState<File | undefined>(undefined);

  const studioQuery = useQuery({
    queryKey: ["studio-dashboard"],
    queryFn: api.getStudioDashboard,
    enabled: sessionUser?.role === "artist",
  });

  const uploadMutation = useMutation({
    mutationFn: api.uploadStudioRelease,
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setTracks([]);
      setCover(undefined);
      queryClient.invalidateQueries({ queryKey: ["studio-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["releases"] });
      queryClient.invalidateQueries({ queryKey: ["home"] });
    },
  });

  const publishMutation = useMutation({
    mutationFn: api.publishStudioRelease,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studio-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["releases"] });
      queryClient.invalidateQueries({ queryKey: ["home"] });
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || tracks.length === 0) return;
    uploadMutation.mutate({
      title: title.trim(),
      description: description.trim(),
      genres,
      price: Number(price),
      publish,
      tracks,
      cover,
    });
  };

  if (!sessionUser) {
    return (
      <div className="max-w-[1000px] mx-auto px-4 py-16">
        <h1 className="font-display text-3xl mb-3">Artist Studio</h1>
        <p className="text-muted-foreground mb-6">
          Studioya erişmek için giriş yapmalısın.
        </p>
        <Link to="/login" className="font-mono-data text-accent hover:underline">
          Sign in
        </Link>
      </div>
    );
  }

  if (sessionUser.role !== "artist") {
    return (
      <div className="max-w-[1000px] mx-auto px-4 py-16">
        <h1 className="font-display text-3xl mb-3">Artist Studio</h1>
        <p className="text-muted-foreground">
          Studio yalnızca artist hesapları için aktif.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-[1200px] mx-auto px-4 py-8"
    >
      <Link
        to="/"
        className="inline-flex items-center gap-1 font-mono-data text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="w-3 h-3" /> Back
      </Link>

      <h1 className="font-display text-3xl mb-2">WAMM Artist Studio</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Yeni release yükle, draft olarak tut veya hemen yayına al.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-8">
        <form onSubmit={handleSubmit} className="razor-border p-4 space-y-4">
          <h2 className="font-display text-xl">Upload Release</h2>
          <div>
            <label className="font-mono-data text-muted-foreground mb-1 block">
              Title
            </label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full px-3 py-2.5 bg-secondary razor-border text-foreground text-sm focus:outline-none focus:border-accent transition-colors"
              placeholder="Release title"
            />
          </div>
          <div>
            <label className="font-mono-data text-muted-foreground mb-1 block">
              Description
            </label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="w-full min-h-[90px] px-3 py-2.5 bg-secondary razor-border text-foreground text-sm focus:outline-none focus:border-accent transition-colors"
              placeholder="Short description"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-mono-data text-muted-foreground mb-1 block">
                Price (USD)
              </label>
              <input
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                className="w-full px-3 py-2.5 bg-secondary razor-border text-foreground text-sm focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <div>
              <label className="font-mono-data text-muted-foreground mb-1 block">
                Genres
              </label>
              <input
                value={genres}
                onChange={(event) => setGenres(event.target.value)}
                className="w-full px-3 py-2.5 bg-secondary razor-border text-foreground text-sm focus:outline-none focus:border-accent transition-colors"
                placeholder="Electronic, Ambient"
              />
            </div>
          </div>
          <div>
            <label className="font-mono-data text-muted-foreground mb-1 block">
              Track Files (mp3/wav)
            </label>
            <input
              type="file"
              multiple
              accept=".mp3,.wav,.flac,.m4a"
              onChange={(event) =>
                setTracks(Array.from(event.target.files || []))
              }
              className="w-full text-sm"
            />
          </div>
          <div>
            <label className="font-mono-data text-muted-foreground mb-1 block">
              Optional Cover
            </label>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              onChange={(event) => setCover(event.target.files?.[0])}
              className="w-full text-sm"
            />
          </div>
          <label className="flex items-center gap-2 font-mono-data text-muted-foreground">
            <input
              type="checkbox"
              checked={publish}
              onChange={(event) => setPublish(event.target.checked)}
            />
            Publish immediately
          </label>
          <button
            type="submit"
            disabled={uploadMutation.isPending}
            className="w-full py-3 bg-foreground text-background font-mono-data hover:bg-accent hover:text-accent-foreground transition-colors press-effect disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Upload className="w-3.5 h-3.5" />
            {uploadMutation.isPending ? "Uploading..." : "Upload Release"}
          </button>
          {uploadMutation.isError && (
            <p className="text-sm text-destructive">{uploadMutation.error.message}</p>
          )}
          {uploadMutation.isSuccess && (
            <p className="text-sm text-accent flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Upload completed
            </p>
          )}
        </form>

        <div className="space-y-4">
          <h2 className="font-display text-xl">My Releases</h2>
          {studioQuery.isLoading && (
            <p className="font-mono-data text-muted-foreground">Loading studio...</p>
          )}
          {studioQuery.isError && (
            <p className="font-mono-data text-destructive">
              {studioQuery.error.message}
            </p>
          )}
          {studioQuery.data?.releases.length === 0 && (
            <p className="font-mono-data text-muted-foreground">
              No releases yet. Upload your first release.
            </p>
          )}
          {studioQuery.data?.releases.map((release) => (
            <div
              key={release.id}
              className="razor-border p-4 flex items-center justify-between gap-4"
            >
              <div>
                <h3 className="font-display text-lg">{release.title}</h3>
                <p className="font-mono-data text-muted-foreground">
                  {release.trackCount} tracks · {release.price.toFixed(2)}{" "}
                  {release.currency} · {release.status}
                </p>
              </div>
              {release.status !== "PUBLISHED" && (
                <button
                  onClick={() => publishMutation.mutate(release.id)}
                  disabled={publishMutation.isPending}
                  className="px-3 py-2 bg-foreground text-background font-mono-data hover:bg-accent hover:text-accent-foreground transition-colors press-effect disabled:opacity-50"
                >
                  Publish
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
