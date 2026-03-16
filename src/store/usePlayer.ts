import { create } from 'zustand';

export interface PlayerTrack {
  id: string;
  title: string;
  artistName: string;
  artistSlug: string;
  coverArtUrl: string;
  audioUrl: string;
  duration: number;
  bpm?: number;
  waveform: number[];
}

interface PlayerState {
  currentTrack: PlayerTrack | null;
  queue: PlayerTrack[];
  isPlaying: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  isMuted: boolean;
  repeat: 'off' | 'one' | 'all';
  shuffle: boolean;

  setTrack: (track: PlayerTrack, queue?: PlayerTrack[]) => void;
  togglePlay: () => void;
  play: () => void;
  pause: () => void;
  setProgress: (time: number) => void;
  setDuration: (d: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  next: () => void;
  previous: () => void;
  addToQueue: (track: PlayerTrack) => void;
  clearQueue: () => void;
}

export const usePlayer = create<PlayerState>((set, get) => ({
  currentTrack: null,
  queue: [],
  isPlaying: false,
  volume: 0.8,
  currentTime: 0,
  duration: 0,
  isMuted: false,
  repeat: 'off',
  shuffle: false,

  setTrack: (track, queue = []) => set({
    currentTrack: track,
    queue,
    isPlaying: true,
    currentTime: 0,
  }),

  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  setProgress: (time) => set({ currentTime: time }),
  setDuration: (d) => set({ duration: d }),
  setVolume: (v) => set({ volume: v, isMuted: false }),
  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
  toggleRepeat: () => set((s) => ({
    repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off',
  })),
  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),

  next: () => {
    const { queue, shuffle } = get();
    if (queue.length === 0) return;
    const idx = shuffle ? Math.floor(Math.random() * queue.length) : 0;
    const next = queue[idx];
    const remaining = queue.filter((_, i) => i !== idx);
    set({ currentTrack: next, queue: remaining, isPlaying: true, currentTime: 0 });
  },

  previous: () => set({ currentTime: 0 }),

  addToQueue: (track) => set((s) => ({ queue: [...s.queue, track] })),
  clearQueue: () => set({ queue: [] }),
}));
