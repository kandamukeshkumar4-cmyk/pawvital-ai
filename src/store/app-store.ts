import { create } from "zustand";
import type { Pet, UserProfile } from "@/types";

interface AppState {
  user: UserProfile | null;
  pets: Pet[];
  activePet: Pet | null;
  /** True after first Supabase user+pets load completes, or demo bootstrap finishes. */
  userDataLoaded: boolean;
  sidebarOpen: boolean;
  setUser: (user: UserProfile | null) => void;
  setPets: (pets: Pet[]) => void;
  setActivePet: (pet: Pet | null) => void;
  setUserDataLoaded: (loaded: boolean) => void;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  pets: [],
  activePet: null,
  userDataLoaded: false,
  sidebarOpen: true,
  setUser: (user) => set({ user }),
  setPets: (pets) => set({ pets }),
  setActivePet: (pet) => set({ activePet: pet }),
  setUserDataLoaded: (userDataLoaded) => set({ userDataLoaded }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));
