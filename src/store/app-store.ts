import { create } from "zustand";
import type { Pet, UserProfile } from "@/types";

interface AppState {
  user: UserProfile | null;
  pets: Pet[];
  activePet: Pet | null;
  sidebarOpen: boolean;
  setUser: (user: UserProfile | null) => void;
  setPets: (pets: Pet[]) => void;
  setActivePet: (pet: Pet | null) => void;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  pets: [],
  activePet: null,
  sidebarOpen: true,
  setUser: (user) => set({ user }),
  setPets: (pets) => set({ pets }),
  setActivePet: (pet) => set({ activePet: pet }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));
