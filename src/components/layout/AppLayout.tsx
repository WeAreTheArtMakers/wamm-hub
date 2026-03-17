import { Navbar } from './Navbar';
import { GlobalPlayer } from './GlobalPlayer';
import { usePlayer } from '@/store/usePlayer';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const currentTrack = usePlayer((s) => s.currentTrack);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className={`pt-14 ${currentTrack ? 'pb-32 sm:pb-28' : 'pb-8'}`}>
        {children}
        <footer className="max-w-[1400px] mx-auto px-4 mt-8 pt-3 pb-2 border-t border-border/60">
          <div className="flex items-center justify-between gap-3 text-[11px] sm:text-xs font-mono-data text-muted-foreground">
            <span>We Are Music Makers (WAMM)</span>
            <a
              href="https://wearetheartmakers.com"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground transition-colors"
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
