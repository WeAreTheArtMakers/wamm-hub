import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { setSession } from "@/lib/auth";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"listener" | "artist">("listener");
  const [artistName, setArtistName] = useState("");
  const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
  const googleAuthUrl = `${apiBase}/api/auth/google/start?returnTo=${encodeURIComponent("/auth/success")}`;

  const registerMutation = useMutation({
    mutationFn: api.register,
    onSuccess: (payload) => {
      setSession(payload.token, payload.user);
      navigate("/");
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    registerMutation.mutate({
      email,
      password,
      role,
      artistName: role === "artist" ? artistName.trim() : undefined,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-md mx-auto px-4 py-16"
    >
      <Link
        to="/"
        className="inline-flex items-center gap-1 font-mono-data text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft className="w-3 h-3" /> Back
      </Link>

      <h1 className="font-display text-3xl mb-2">Join WAMM</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Support artists. Discover music. Keep it independent.
      </p>

      <a
        href={googleAuthUrl}
        className="w-full mb-4 py-3 razor-border font-mono-data text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-2"
      >
        Continue with Google
      </a>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="font-mono-data text-muted-foreground mb-2 block">
            I am a
          </label>
          <div className="flex gap-2">
            {(["listener", "artist"] as const).map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => setRole(candidate)}
                className={`flex-1 py-2 font-mono-data transition-colors press-effect ${
                  role === candidate
                    ? "bg-foreground text-background"
                    : "razor-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {candidate.charAt(0).toUpperCase() + candidate.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="font-mono-data text-muted-foreground mb-1 block">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full px-3 py-2.5 bg-secondary razor-border text-foreground text-sm focus:outline-none focus:border-accent transition-colors"
            placeholder="you@email.com"
          />
        </div>
        <div>
          <label className="font-mono-data text-muted-foreground mb-1 block">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full px-3 py-2.5 bg-secondary razor-border text-foreground text-sm focus:outline-none focus:border-accent transition-colors"
            placeholder="Min. 8 characters"
          />
        </div>
        {role === "artist" && (
          <div>
            <label className="font-mono-data text-muted-foreground mb-1 block">
              Artist Name
            </label>
            <input
              type="text"
              value={artistName}
              onChange={(event) => setArtistName(event.target.value)}
              className="w-full px-3 py-2.5 bg-secondary razor-border text-foreground text-sm focus:outline-none focus:border-accent transition-colors"
              placeholder="Baran Gulesen"
            />
          </div>
        )}
        <button
          type="submit"
          disabled={registerMutation.isPending}
          className="w-full py-3 bg-foreground text-background font-mono-data hover:bg-accent hover:text-accent-foreground transition-colors press-effect disabled:opacity-50"
        >
          {registerMutation.isPending ? "Creating Account..." : "Create Account"}
        </button>
      </form>

      {registerMutation.isError && (
        <p className="text-sm text-destructive mt-4">
          {registerMutation.error.message}
        </p>
      )}

      <p className="text-sm text-muted-foreground mt-6 text-center">
        Already have an account?{" "}
        <Link to="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </motion.div>
  );
}
