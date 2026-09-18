import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Remembers which users on this device have finished the first-run tour, so
 * a new cashier signing in on a shared phone still gets it. `forcedOpen` is
 * not persisted — it is how Profile replays the tour on demand.
 */
interface WalkthroughState {
  seenUserIds: string[];
  forcedOpen: boolean;
  markSeen: (userId: string) => void;
  replay: () => void;
}

export const useWalkthroughStore = create<WalkthroughState>()(
  persist(
    (set) => ({
      seenUserIds: [],
      forcedOpen: false,
      markSeen: (userId) =>
        set((state) => ({
          forcedOpen: false,
          seenUserIds: state.seenUserIds.includes(userId) ? state.seenUserIds : [...state.seenUserIds, userId],
        })),
      replay: () => set({ forcedOpen: true }),
    }),
    {
      name: "lapak-walkthrough",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ seenUserIds: state.seenUserIds }),
    },
  ),
);
