import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { setSession } from "@/lib/auth";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const queryError = new URLSearchParams(location.search).get("error");
  const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
  const googleAuthUrl = `${apiBase}/api/auth/google/start?returnTo=${encodeURIComponent("/auth/success")}`;

  const loginMutation = useMutation({
    mutationFn: api.login,
    onSuccess: (payload) => {
      setSession(payload.token, payload.user);
      navigate("/");
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    loginMutation.mutate({ email, password });
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

      <h1 className="font-display text-3xl mb-2">Sign In</h1>
      <p className="text-sm text-muted-foreground mb-8">Welcome back to WAMM.</p>

      <a
        href={googleAuthUrl}
        className="w-full mb-4 py-3 razor-border font-mono-data text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-2"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
          <path
            fill="currentColor"
            d="M21.8 12.23c0-.82-.07-1.4-.23-2H12v3.78h5.62c-.11.94-.72 2.35-2.06 3.3l-.02.13 2.99 2.27.21.02c1.94-1.74 3.06-4.3 3.06-7.92Z"
          />
          <path
            fill="currentColor"
            d="M12 22c2.75 0 5.05-.88 6.74-2.4l-3.21-2.42c-.86.58-2.02.98-3.53.98-2.69 0-4.98-1.74-5.8-4.14l-.13.01-3.11 2.36-.04.12A10.2 10.2 0 0 0 12 22Z"
          />
          <path
            fill="currentColor"
            d="M6.2 14.02a6.1 6.1 0 0 1-.34-2.02c0-.7.12-1.37.32-2.02l-.01-.13-3.16-2.4-.1.05A9.8 9.8 0 0 0 2 12c0 1.58.39 3.08 1.08 4.42l3.12-2.4Z"
          />
          <path
            fill="currentColor"
            d="M12 5.84c1.9 0 3.18.8 3.91 1.48l2.86-2.73C17.04 2.96 14.75 2 12 2a10.2 10.2 0 0 0-9.08 5.52l3.27 2.48c.84-2.4 3.12-4.16 5.81-4.16Z"
          />
        </svg>
        Continue with Google
      </a>

      <form onSubmit={handleSubmit} className="space-y-4">
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
            placeholder="••••••••"
          />
        </div>
        <button
          type="submit"
          disabled={loginMutation.isPending}
          className="w-full py-3 bg-foreground text-background font-mono-data hover:bg-accent hover:text-accent-foreground transition-colors press-effect disabled:opacity-50"
        >
          {loginMutation.isPending ? "Signing In..." : "Sign In"}
        </button>
      </form>

      {loginMutation.isError && (
        <p className="text-sm text-destructive mt-4">
          {loginMutation.error.message}
        </p>
      )}
      {queryError && (
        <div className="text-sm text-destructive mt-2 space-y-1">
          <p>{queryError}</p>
          <a
            href={`${apiBase}/api/auth/google/config`}
            target="_blank"
            rel="noreferrer"
            className="text-xs underline text-muted-foreground"
          >
            Google OAuth redirect config
          </a>
        </div>
      )}

      <p className="text-sm text-muted-foreground mt-6 text-center">
        Don't have an account?{" "}
        <Link to="/register" className="text-accent hover:underline">
          Create one
        </Link>
      </p>
    </motion.div>
  );
}
