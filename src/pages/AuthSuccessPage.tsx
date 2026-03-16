import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { setSession } from "@/lib/auth";

const parseRole = (value: string | null): "listener" | "artist" =>
  value === "artist" ? "artist" : "listener";

export default function AuthSuccessPage() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get("token");
    const id = params.get("id");
    const email = params.get("email");
    const role = parseRole(params.get("role"));

    if (!token || !id || !email) {
      navigate("/login?error=Google+sign-in+failed", { replace: true });
      return;
    }

    setSession(token, { id, email, role });
    navigate("/", { replace: true });
  }, [location.search, navigate]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-md mx-auto px-4 py-24 text-center"
    >
      <h1 className="font-display text-2xl mb-2">Signing you in...</h1>
      <p className="text-sm text-muted-foreground">Completing Google authentication.</p>
    </motion.div>
  );
}
