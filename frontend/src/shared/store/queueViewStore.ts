import { create } from "zustand";

type QueueViewState = {
  shuffleDebugOpen: boolean;
  setShuffleDebugOpen: (open: boolean) => void;
};

export const useQueueViewStore = create<QueueViewState>((set) => ({
  shuffleDebugOpen: false,
  setShuffleDebugOpen: (open) => set({ shuffleDebugOpen: open }),
}));
