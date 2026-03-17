import { useState } from "react";
import { Navbar } from './Navbar';
import { GlobalPlayer } from './GlobalPlayer';
import { usePlayer } from '@/store/usePlayer';

const PLATFORM_DONATE_WALLET =
  import.meta.env.VITE_PLATFORM_WALLET_ADDRESS ||
  "0xc66aC8bcF729a6398bc879B7454B13983220601e";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

const toWeiHex = (amount: number) => {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) return "0x0";
  const micros = BigInt(Math.round(numeric * 1_000_000));
  const wei = (micros * 10n ** 18n) / 1_000_000n;
  return `0x${wei.toString(16)}`;
};

const shortenWallet = (address: string) => {
  const value = String(address || "").trim();
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

export function AppLayout({ children }: { children: React.ReactNode }) {
  const currentTrack = usePlayer((s) => s.currentTrack);
  const [donateStatus, setDonateStatus] = useState("");

  const handleDonate = async () => {
    const provider = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
    if (!provider) {
      await navigator.clipboard.writeText(PLATFORM_DONATE_WALLET).catch(() => {});
      setDonateStatus("Wallet not detected. Donation address copied.");
      return;
    }
    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const from =
        Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";
      if (!from) {
        setDonateStatus("Wallet account is not available.");
        return;
      }

      const amountInput = window.prompt("Donation amount (native token)", "0.01");
      if (amountInput === null) return;
      const amount = Number(amountInput);
      if (!Number.isFinite(amount) || amount <= 0) {
        setDonateStatus("Please enter a valid donation amount.");
        return;
      }

      const txHash = await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from,
            to: PLATFORM_DONATE_WALLET,
            value: toWeiHex(amount),
          },
        ],
      });
      if (typeof txHash === "string") {
        setDonateStatus(`Donation sent: ${shortenWallet(txHash)}`);
      } else {
        setDonateStatus("Donation request sent.");
      }
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        Number((error as { code?: unknown }).code) === 4001
      ) {
        setDonateStatus("Donation was cancelled.");
        return;
      }
      setDonateStatus("Donation could not be completed.");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className={`pt-14 ${currentTrack ? 'pb-32 sm:pb-28' : 'pb-8'}`}>
        {children}
        <footer className="max-w-[1400px] mx-auto px-4 mt-8 pt-3 pb-2 border-t border-border/60">
          <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-3 text-[11px] sm:text-xs font-mono-data text-muted-foreground">
            <span>We Are Music Makers (WAMM)</span>
            <div className="text-center space-y-1">
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleDonate();
                  }}
                  className="px-2 py-1 razor-border hover:text-foreground transition-colors"
                >
                  Donate
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(PLATFORM_DONATE_WALLET);
                    setDonateStatus("Donation address copied.");
                  }}
                  className="hover:text-foreground transition-colors"
                  title={PLATFORM_DONATE_WALLET}
                >
                  {shortenWallet(PLATFORM_DONATE_WALLET)}
                </button>
              </div>
              {donateStatus && (
                <p className="text-[10px] text-muted-foreground">{donateStatus}</p>
              )}
            </div>
            <a
              href="https://wearetheartmakers.com"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground transition-colors sm:text-right"
            >
              Built with ♡ by WATAM
            </a>
          </div>
        </footer>
      </main>
      <GlobalPlayer />
    </div>
  );
}
