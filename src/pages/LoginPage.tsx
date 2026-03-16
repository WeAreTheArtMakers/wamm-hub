import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { setSession } from "@/lib/auth";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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

      <p className="text-sm text-muted-foreground mt-6 text-center">
        Don't have an account?{" "}
        <Link to="/register" className="text-accent hover:underline">
          Create one
        </Link>
      </p>
    </motion.div>
  );
}
