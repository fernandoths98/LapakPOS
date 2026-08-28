import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { LoginResponse } from "@lapak/shared";
import { useOutletStore } from "../outlet/outletStore";

/**
 * Auth state only — MMKV is reserved for the offline sales queue (Phase 8);
 * AsyncStorage is a deliberate, simpler choice for this small amount of data.
 */
export interface AuthState {
  token: string | null;
  user: LoginResponse["user"] | null;
  hasHydrated: boolean;
  login: (result: LoginResponse) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      hasHydrated: false,
      login: (result) => {
        // A cashier/stocker is pinned to their token outlet; an owner starts
        // on their own outlet and can switch from the Home header.
        useOutletStore.getState().setActiveOutlet(result.user.outletId ?? null);
        set({ token: result.token, user: result.user });
      },
      logout: () => {
        useOutletStore.getState().clear();
        set({ token: null, user: null });
      },
    }),
    {
      name: "lapak-auth",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ token: state.token, user: state.user }),
      onRehydrateStorage: () => () => {
        useAuthStore.setState({ hasHydrated: true });
      },
    },
  ),
);
