import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import {
  clearAdminToken,
  getAdminToken,
  setAdminToken,
} from "@/lib/adminAuth";

const ADMIN_HINT_PATH = "/__wamm-console-9f4ad8";

export default function AdminGatePage() {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("adminwamm");
  const [password, setPassword] = useState("");
  const [adminToken, setLocalAdminToken] = useState<string | null>(getAdminToken());
  const [feedback, setFeedback] = useState("");

  const loginMutation = useMutation({
    mutationFn: api.adminLogin,
    onSuccess: (payload) => {
      setAdminToken(payload.token);
      setLocalAdminToken(payload.token);
      setFeedback("Admin session created.");
    },
    onError: (error) => setFeedback(error.message),
  });

  const ordersQuery = useQuery({
    queryKey: ["admin-manual-orders", adminToken],
    queryFn: () => api.getAdminManualOrders(adminToken ?? ""),
    enabled: Boolean(adminToken),
  });

  const refreshPending = () =>
    queryClient.invalidateQueries({
      queryKey: ["admin-manual-orders", adminToken],
    });

  const approveMutation = useMutation({
    mutationFn: (orderId: string) =>
      api.approveAdminManualOrder(adminToken ?? "", orderId),
    onSuccess: async (result) => {
      setFeedback(result.message);
      await refreshPending();
    },
    onError: (error) => setFeedback(error.message),
  });

  const rejectMutation = useMutation({
    mutationFn: (orderId: string) =>
      api.rejectAdminManualOrder(adminToken ?? "", orderId),
    onSuccess: async (result) => {
      setFeedback(result.message);
      await refreshPending();
    },
    onError: (error) => setFeedback(error.message),
  });

  const pending = useMemo(() => ordersQuery.data?.pending ?? [], [ordersQuery.data]);

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault();
    loginMutation.mutate({ username, password });
  };

  const handleLogout = () => {
    clearAdminToken();
    setLocalAdminToken(null);
    setFeedback("Admin session cleared.");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-[1200px] mx-auto px-4 py-8 space-y-6"
    >
      <div className="razor-border p-4 sm:p-5 space-y-3">
        <h1 className="font-display text-2xl">WAMM Manual Payment Control</h1>
        <p className="text-xs text-muted-foreground font-mono-data">
          Hidden route: {ADMIN_HINT_PATH}
        </p>
        {!adminToken ? (
          <form onSubmit={handleLogin} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Admin username"
              className="px-3 py-2.5 bg-secondary razor-border text-sm"
            />
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              placeholder="Admin password"
              className="px-3 py-2.5 bg-secondary razor-border text-sm"
            />
            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="px-3 py-2.5 bg-foreground text-background font-mono-data hover:bg-accent hover:text-accent-foreground transition-colors inline-flex items-center justify-center gap-2"
            >
              {loginMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                "Admin Login"
              )}
            </button>
          </form>
        ) : (
          <div className="flex flex-wrap gap-3 items-center">
            <span className="font-mono-data text-accent">Authenticated</span>
            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-2 razor-border text-muted-foreground hover:text-foreground font-mono-data"
            >
              Logout
            </button>
          </div>
        )}
        {feedback && <p className="text-sm text-muted-foreground">{feedback}</p>}
      </div>

      {adminToken && (
        <section className="razor-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-display text-xl">Pending IBAN Orders</h2>
            <span className="font-mono-data text-muted-foreground">
              {ordersQuery.data?.total ?? 0} pending
            </span>
          </div>
          <div className="divide-y divide-border">
            {ordersQuery.isLoading && (
              <div className="p-4 text-muted-foreground font-mono-data">Loading...</div>
            )}
            {!ordersQuery.isLoading && pending.length === 0 && (
              <div className="p-4 text-muted-foreground font-mono-data">
                No pending IBAN payments.
              </div>
            )}
            {pending.map((item) => (
              <div key={item.order.id} className="p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-display text-lg">{item.order.releaseTitle}</span>
                  <span className="font-mono-data text-muted-foreground">
                    {item.order.id}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Buyer: {item.buyerEmail}</p>
                  <p>Artist: {item.order.artistName}</p>
                  <p>Reference: {item.paymentNote || "-"}</p>
                  <p>Amount: ${item.order.totalAmount.toFixed(2)}</p>
                  <p>IBAN: {item.artistIban || "-"}</p>
                  <p>Account Name: {item.artistIbanName || "-"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => approveMutation.mutate(item.order.id)}
                    disabled={approveMutation.isPending || rejectMutation.isPending}
                    className="px-3 py-2 bg-foreground text-background font-mono-data hover:bg-accent hover:text-accent-foreground transition-colors inline-flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => rejectMutation.mutate(item.order.id)}
                    disabled={approveMutation.isPending || rejectMutation.isPending}
                    className="px-3 py-2 razor-border text-muted-foreground hover:text-destructive font-mono-data inline-flex items-center gap-2"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </motion.div>
  );
}

