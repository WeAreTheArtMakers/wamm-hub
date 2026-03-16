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
      </main>
      <GlobalPlayer />
    </div>
  );
}
