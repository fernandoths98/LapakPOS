import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * The outlet the app is currently acting on. A cashier/stocker is pinned to
 * the outlet on their token (set at login and never changed here); an
 * owner/manager can switch outlets, and the choice is sent to the backend as
 * the `X-Outlet-Id` header on every request.
 *
 * `null` means "use whatever the token says" — the backend falls back to the
 * user's own outlet, then the primary outlet.
 */
interface OutletState {
  activeOutletId: string | null;
  setActiveOutlet: (outletId: string | null) => void;
  clear: () => void;
}

export const useOutletStore = create<OutletState>()(
  persist(
    (set) => ({
      activeOutletId: null,
      setActiveOutlet: (outletId) => set({ activeOutletId: outletId }),
      clear: () => set({ activeOutletId: null }),
    }),
    {
      name: "lapak-outlet",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ activeOutletId: state.activeOutletId }),
    },
  ),
);

/** Non-hook accessor for the axios interceptor. */
export const getActiveOutletId = (): string | null => useOutletStore.getState().activeOutletId;

/**
 * A stable value to append to an outlet-scoped React Query key so switching
 * outlets keeps each outlet's cache separate (instant switch-back, no flash
 * of the previous outlet's data). `"token"` = "whatever the JWT outlet is".
 */
export function useOutletScopeKey(): string {
  return useOutletStore((s) => s.activeOutletId) ?? "token";
}
