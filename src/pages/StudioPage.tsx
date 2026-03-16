import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Save,
  Upload,
  Wallet,
  Landmark,
  Music2,
  ImagePlus,
} from "lucide-react";
import { api } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";

const toPositiveNumber = (value: string): number | undefined => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
};

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

  const [profileName, setProfileName] = useState("");
  const [profileBio, setProfileBio] = useState("");
  const [profileLocation, setProfileLocation] = useState("");
  const [payoutIban, setPayoutIban] = useState("");
  const [payoutIbanName, setPayoutIbanName] = useState("");
  const [payoutWallet, setPayoutWallet] = useState("");
  const [payoutNetwork, setPayoutNetwork] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | undefined>(undefined);
  const [bannerFile, setBannerFile] = useState<File | undefined>(undefined);
  const [clearAvatar, setClearAvatar] = useState(false);
  const [clearBanner, setClearBanner] = useState(false);

  const [activeReleaseId, setActiveReleaseId] = useState<string | null>(null);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);

  const studioQuery = useQuery({
    queryKey: ["studio-dashboard"],
    queryFn: api.getStudioDashboard,
    enabled: sessionUser?.role === "artist",
  });

  const dashboardArtist = studioQuery.data?.artist;

  useEffect(() => {
    if (!dashboardArtist) return;
    const artist = dashboardArtist;
    setProfileName(artist.name ?? "");
    setProfileBio(artist.bio ?? "");
    setProfileLocation(artist.location ?? "");
    setPayoutIban(artist.paymentSettings.iban ?? "");
    setPayoutIbanName(artist.paymentSettings.ibanName ?? "");
    setPayoutWallet(artist.paymentSettings.wallet ?? "");
    setPayoutNetwork(artist.paymentSettings.network ?? "");
  }, [dashboardArtist]);

  const invalidateStudioData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["studio-dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["home"] }),
      queryClient.invalidateQueries({ queryKey: ["releases"] }),
      queryClient.invalidateQueries({ queryKey: ["discover"] }),
      queryClient.invalidateQueries({ queryKey: ["tracks"] }),
      queryClient.invalidateQueries({ queryKey: ["artists"] }),
    ]);
  };

  const uploadMutation = useMutation({
    mutationFn: api.uploadStudioRelease,
    onSuccess: async () => {
      setTitle("");
      setDescription("");
      setTracks([]);
      setCover(undefined);
      await invalidateStudioData();
    },
  });

  const publishMutation = useMutation({
    mutationFn: api.publishStudioRelease,
    onSuccess: invalidateStudioData,
  });

  const profileMutation = useMutation({
    mutationFn: api.updateStudioProfile,
    onSuccess: async () => {
      setAvatarFile(undefined);
      setBannerFile(undefined);
      setClearAvatar(false);
      setClearBanner(false);
      await invalidateStudioData();
    },
  });

  const updateReleaseMutation = useMutation({
    mutationFn: ({
      releaseId,
      payload,
    }: {
      releaseId: string;
      payload: Parameters<typeof api.updateStudioRelease>[1];
    }) => api.updateStudioRelease(releaseId, payload),
    onSuccess: invalidateStudioData,
    onSettled: () => setActiveReleaseId(null),
  });

  const updateTrackMutation = useMutation({
    mutationFn: ({
      trackId,
      payload,
    }: {
      trackId: string;
      payload: Parameters<typeof api.updateStudioTrack>[1];
    }) => api.updateStudioTrack(trackId, payload),
    onSuccess: invalidateStudioData,
    onSettled: () => setActiveTrackId(null),
  });

  const handleUploadSubmit = (event: React.FormEvent) => {
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

  const handleProfileSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    profileMutation.mutate({
      name: profileName,
      bio: profileBio,
      location: profileLocation,
      payoutIban,
      payoutIbanName,
      payoutWallet,
      payoutNetwork,
      avatar: avatarFile,
      banner: bannerFile,
      clearAvatar,
      clearBanner,
    });
  };

  const handleReleaseSubmit = (
    event: React.FormEvent<HTMLFormElement>,
    releaseId: string,
  ) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const titleInput = String(formData.get("title") ?? "").trim();
    const descriptionInput = String(formData.get("description") ?? "").trim();
    const priceInput = toPositiveNumber(String(formData.get("price") ?? ""));
    const statusInput = String(formData.get("status") ?? "").trim();
    const isForSale = formData.get("isForSale") === "on";
    const coverFile = formData.get("cover");

    setActiveReleaseId(releaseId);
    updateReleaseMutation.mutate({
      releaseId,
      payload: {
        title: titleInput,
        description: descriptionInput,
        price: priceInput,
        status:
          statusInput === "DRAFT" ||
          statusInput === "PUBLISHED" ||
          statusInput === "ARCHIVED"
            ? statusInput
            : undefined,
        isForSale,
        cover: coverFile instanceof File && coverFile.size > 0 ? coverFile : undefined,
      },
    });
  };

  const handleTrackSubmit = (
    event: React.FormEvent<HTMLFormElement>,
    trackId: string,
  ) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const titleInput = String(formData.get("title") ?? "").trim();
    const genreInput = String(formData.get("genre") ?? "").trim();
    const priceInput = toPositiveNumber(String(formData.get("price") ?? ""));
    const bpmInput = toPositiveNumber(String(formData.get("bpm") ?? ""));
    const keySignatureInput = String(formData.get("keySignature") ?? "").trim();
    const isForSale = formData.get("isForSale") === "on";
    const coverFile = formData.get("cover");

    setActiveTrackId(trackId);
    updateTrackMutation.mutate({
      trackId,
      payload: {
        title: titleInput,
        genre: genreInput,
        price: priceInput,
        bpm: typeof bpmInput === "number" ? Math.round(bpmInput) : undefined,
        keySignature: keySignatureInput,
        isForSale,
        cover: coverFile instanceof File && coverFile.size > 0 ? coverFile : undefined,
      },
    });
  };

  if (!sessionUser) {
    return (
      <div className="max-w-[1000px] mx-auto px-4 py-16">
        <h1 className="font-display text-3xl mb-3">Artist Studio</h1>
        <p className="text-muted-foreground mb-6">Studioya erişmek için giriş yapmalısın.</p>
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
        <p className="text-muted-foreground">Studio yalnızca artist hesapları için aktif.</p>
      </div>
    );
  }

  const artist = studioQuery.data?.artist;
  const releases = studioQuery.data?.releases ?? [];
  const artistTracks = studioQuery.data?.tracks ?? [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-[1400px] mx-auto px-4 py-6 sm:py-8"
    >
      <Link
        to="/"
        className="inline-flex items-center gap-1 font-mono-data text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="w-3 h-3" /> Back
      </Link>

      <h1 className="font-display text-3xl mb-2">WAMM Artist Studio</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Profil, ödeme bilgileri, release ve parçaları tek panelden yönet.
      </p>

      {studioQuery.isLoading && (
        <p className="font-mono-data text-muted-foreground">Loading studio...</p>
      )}
      {studioQuery.isError && (
        <p className="font-mono-data text-destructive">{studioQuery.error.message}</p>
      )}

      {artist && (
        <div className="space-y-6">
          <section className="razor-border p-4 sm:p-5 space-y-4">
            <h2 className="font-display text-xl">Artist Profile & Payout</h2>

            {(artist.avatarUrl || artist.bannerUrl) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="font-mono-data text-muted-foreground">Current Avatar</span>
                  <div className="w-full aspect-square razor-border overflow-hidden bg-secondary">
                    {artist.avatarUrl ? (
                      <img
                        src={artist.avatarUrl}
                        alt={artist.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        N/A
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="font-mono-data text-muted-foreground">Current Banner</span>
                  <div className="w-full aspect-square razor-border overflow-hidden bg-secondary">
                    {artist.bannerUrl ? (
                      <img
                        src={artist.bannerUrl}
                        alt={artist.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        N/A
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="font-mono-data text-muted-foreground mb-1 block">Artist Name</label>
                  <input
                    value={profileName}
                    onChange={(event) => setProfileName(event.target.value)}
                    className="w-full px-3 py-2.5 bg-secondary razor-border text-sm"
                  />
                </div>
                <div>
                  <label className="font-mono-data text-muted-foreground mb-1 block">Location</label>
                  <input
                    value={profileLocation}
                    onChange={(event) => setProfileLocation(event.target.value)}
                    className="w-full px-3 py-2.5 bg-secondary razor-border text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="font-mono-data text-muted-foreground mb-1 block">Bio</label>
                <textarea
                  value={profileBio}
                  onChange={(event) => setProfileBio(event.target.value)}
                  className="w-full min-h-[100px] px-3 py-2.5 bg-secondary razor-border text-sm"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="font-mono-data text-muted-foreground mb-1 block">
                    <Landmark className="w-3 h-3 inline mr-1" /> IBAN
                  </label>
                  <input
                    value={payoutIban}
                    onChange={(event) => setPayoutIban(event.target.value)}
                    className="w-full px-3 py-2.5 bg-secondary razor-border text-sm"
                    placeholder="TR..."
                  />
                </div>
                <div>
                  <label className="font-mono-data text-muted-foreground mb-1 block">IBAN Account Name</label>
                  <input
                    value={payoutIbanName}
                    onChange={(event) => setPayoutIbanName(event.target.value)}
                    className="w-full px-3 py-2.5 bg-secondary razor-border text-sm"
                    placeholder="Beneficiary name"
                  />
                </div>
                <div>
                  <label className="font-mono-data text-muted-foreground mb-1 block">
                    <Wallet className="w-3 h-3 inline mr-1" /> Crypto Wallet
                  </label>
                  <input
                    value={payoutWallet}
                    onChange={(event) => setPayoutWallet(event.target.value)}
                    className="w-full px-3 py-2.5 bg-secondary razor-border text-sm"
                    placeholder="0x..."
                  />
                </div>
                <div>
                  <label className="font-mono-data text-muted-foreground mb-1 block">Network</label>
                  <input
                    value={payoutNetwork}
                    onChange={(event) => setPayoutNetwork(event.target.value)}
                    className="w-full px-3 py-2.5 bg-secondary razor-border text-sm"
                    placeholder="Ethereum / Base / TRON"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="font-mono-data text-muted-foreground mb-1 block">Avatar</label>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp"
                    onChange={(event) => setAvatarFile(event.target.files?.[0])}
                    className="w-full text-sm"
                  />
                  <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground font-mono-data">
                    <input
                      type="checkbox"
                      checked={clearAvatar}
                      onChange={(event) => setClearAvatar(event.target.checked)}
                    />
                    Remove current avatar
                  </label>
                </div>
                <div>
                  <label className="font-mono-data text-muted-foreground mb-1 block">Banner</label>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp"
                    onChange={(event) => setBannerFile(event.target.files?.[0])}
                    className="w-full text-sm"
                  />
                  <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground font-mono-data">
                    <input
                      type="checkbox"
                      checked={clearBanner}
                      onChange={(event) => setClearBanner(event.target.checked)}
                    />
                    Remove current banner
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={profileMutation.isPending}
                className="w-full sm:w-auto px-4 py-2.5 bg-foreground text-background font-mono-data hover:bg-accent hover:text-accent-foreground transition-colors press-effect disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {profileMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Save Profile
              </button>

              {profileMutation.isSuccess && (
                <p className="text-sm text-accent flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Profile updated
                </p>
              )}
              {profileMutation.isError && (
                <p className="text-sm text-destructive">{profileMutation.error.message}</p>
              )}
            </form>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-6">
            <form onSubmit={handleUploadSubmit} className="razor-border p-4 space-y-4">
              <h2 className="font-display text-xl">Upload Release</h2>

              <div>
                <label className="font-mono-data text-muted-foreground mb-1 block">Title</label>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full px-3 py-2.5 bg-secondary razor-border text-sm"
                  placeholder="Release title"
                />
              </div>

              <div>
                <label className="font-mono-data text-muted-foreground mb-1 block">Description</label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="w-full min-h-[90px] px-3 py-2.5 bg-secondary razor-border text-sm"
                  placeholder="Short description"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-mono-data text-muted-foreground mb-1 block">Price (USD)</label>
                  <input
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                    className="w-full px-3 py-2.5 bg-secondary razor-border text-sm"
                  />
                </div>
                <div>
                  <label className="font-mono-data text-muted-foreground mb-1 block">Genres</label>
                  <input
                    value={genres}
                    onChange={(event) => setGenres(event.target.value)}
                    className="w-full px-3 py-2.5 bg-secondary razor-border text-sm"
                    placeholder="Electronic, Ambient"
                  />
                </div>
              </div>

              <div>
                <label className="font-mono-data text-muted-foreground mb-1 block">Track Files</label>
                <input
                  type="file"
                  multiple
                  accept=".mp3,.wav,.flac,.m4a"
                  onChange={(event) => setTracks(Array.from(event.target.files || []))}
                  className="w-full text-sm"
                />
              </div>

              <div>
                <label className="font-mono-data text-muted-foreground mb-1 block">Release Cover</label>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  onChange={(event) => setCover(event.target.files?.[0])}
                  className="w-full text-sm"
                />
              </div>

              <label className="flex items-center gap-2 font-mono-data text-muted-foreground text-sm">
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
                {uploadMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
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
              <h2 className="font-display text-xl">Release Management</h2>
              {releases.length === 0 && (
                <p className="font-mono-data text-muted-foreground">No releases yet.</p>
              )}

              {releases.map((release) => (
                <form
                  key={release.id}
                  onSubmit={(event) => handleReleaseSubmit(event, release.id)}
                  className="razor-border p-4 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="font-display text-lg truncate">{release.title}</h3>
                      <p className="font-mono-data text-muted-foreground text-sm">
                        {release.trackCount} tracks · {release.currency} {release.price.toFixed(2)}
                      </p>
                    </div>
                    {release.status !== "PUBLISHED" && (
                      <button
                        type="button"
                        onClick={() => publishMutation.mutate(release.id)}
                        disabled={publishMutation.isPending}
                        className="px-3 py-2 bg-foreground text-background font-mono-data hover:bg-accent hover:text-accent-foreground transition-colors press-effect disabled:opacity-50"
                      >
                        Publish
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      name="title"
                      defaultValue={release.title}
                      className="w-full px-3 py-2.5 bg-secondary razor-border text-sm"
                      placeholder="Release title"
                    />
                    <input
                      name="price"
                      defaultValue={release.price.toFixed(2)}
                      className="w-full px-3 py-2.5 bg-secondary razor-border text-sm"
                      placeholder="Price"
                    />
                  </div>

                  <textarea
                    name="description"
                    defaultValue={release.description}
                    className="w-full min-h-[80px] px-3 py-2.5 bg-secondary razor-border text-sm"
                    placeholder="Release description"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                    <select
                      name="status"
                      defaultValue={release.status}
                      className="w-full px-3 py-2.5 bg-secondary razor-border text-sm"
                    >
                      <option value="DRAFT">DRAFT</option>
                      <option value="PUBLISHED">PUBLISHED</option>
                      <option value="ARCHIVED">ARCHIVED</option>
                    </select>
                    <label className="flex items-center gap-2 text-sm font-mono-data text-muted-foreground">
                      <input type="checkbox" name="isForSale" defaultChecked={release.isForSale} />
                      For Sale
                    </label>
                    <input
                      type="file"
                      name="cover"
                      accept=".jpg,.jpeg,.png,.webp"
                      className="w-full text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={updateReleaseMutation.isPending && activeReleaseId === release.id}
                    className="w-full sm:w-auto px-4 py-2.5 bg-foreground text-background font-mono-data hover:bg-accent hover:text-accent-foreground transition-colors press-effect disabled:opacity-50 inline-flex items-center justify-center gap-2"
                  >
                    {updateReleaseMutation.isPending && activeReleaseId === release.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ImagePlus className="w-3.5 h-3.5" />
                    )}
                    Save Release
                  </button>
                </form>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-xl">Track Management</h2>
            {artistTracks.length === 0 && (
              <p className="font-mono-data text-muted-foreground">No tracks yet.</p>
            )}
            {artistTracks.map((track) => (
              <form
                key={track.id}
                onSubmit={(event) => handleTrackSubmit(event, track.id)}
                className="razor-border p-4 space-y-3"
              >
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 razor-border overflow-hidden bg-secondary shrink-0">
                    {track.coverArtUrl ? (
                      <img src={track.coverArtUrl} alt={track.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music2 className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display text-lg truncate">{track.title}</h3>
                    <p className="font-mono-data text-muted-foreground text-sm">
                      {track.likes} likes · {Math.round(track.plays / 100) / 10}K plays · {track.comments.length} comments
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <input
                    name="title"
                    defaultValue={track.title}
                    className="w-full px-3 py-2.5 bg-secondary razor-border text-sm"
                    placeholder="Track title"
                  />
                  <input
                    name="genre"
                    defaultValue={track.genre}
                    className="w-full px-3 py-2.5 bg-secondary razor-border text-sm"
                    placeholder="Genre"
                  />
                  <input
                    name="price"
                    defaultValue={track.price.toFixed(2)}
                    className="w-full px-3 py-2.5 bg-secondary razor-border text-sm"
                    placeholder="Price"
                  />
                  <input
                    name="bpm"
                    defaultValue={track.bpm ?? ""}
                    className="w-full px-3 py-2.5 bg-secondary razor-border text-sm"
                    placeholder="BPM"
                  />
                  <input
                    name="keySignature"
                    defaultValue={track.key ?? ""}
                    className="w-full px-3 py-2.5 bg-secondary razor-border text-sm"
                    placeholder="Key"
                  />
                  <input
                    type="file"
                    name="cover"
                    accept=".jpg,.jpeg,.png,.webp"
                    className="w-full text-sm"
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <label className="flex items-center gap-2 text-sm font-mono-data text-muted-foreground">
                    <input type="checkbox" name="isForSale" defaultChecked={track.isForSale} />
                    For Sale
                  </label>
                  <button
                    type="submit"
                    disabled={updateTrackMutation.isPending && activeTrackId === track.id}
                    className="w-full sm:w-auto px-4 py-2.5 bg-foreground text-background font-mono-data hover:bg-accent hover:text-accent-foreground transition-colors press-effect disabled:opacity-50 inline-flex items-center justify-center gap-2"
                  >
                    {updateTrackMutation.isPending && activeTrackId === track.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Save Track
                  </button>
                </div>
              </form>
            ))}
            {updateTrackMutation.isError && (
              <p className="text-sm text-destructive">{updateTrackMutation.error.message}</p>
            )}
          </section>
        </div>
      )}
    </motion.div>
  );
}
