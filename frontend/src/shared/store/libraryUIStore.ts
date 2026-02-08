import { create } from "zustand";
import { SelectedAlbum } from "../../features/types";

type LibraryUIState = {
  libraryQueryInput: string;
  libraryQuery: string;
  artistOffset: number;
  albumOffset: number;
  trackOffset: number;
  selectedArtist: string | null;
  selectedAlbum: SelectedAlbum | null;
  setLibraryQueryInput: (value: string) => void;
  submitLibrarySearch: () => void;
  setArtistOffset: (value: number) => void;
  setAlbumOffset: (value: number) => void;
  setTrackOffset: (value: number) => void;
  selectArtist: (name: string) => void;
  selectAlbum: (album: SelectedAlbum) => void;
  clearSelections: () => void;
};

export const useLibraryUIStore = create<LibraryUIState>((set) => ({
  libraryQueryInput: "",
  libraryQuery: "",
  artistOffset: 0,
  albumOffset: 0,
  trackOffset: 0,
  selectedArtist: null,
  selectedAlbum: null,
  setLibraryQueryInput: (value: string) => set({ libraryQueryInput: value }),
  submitLibrarySearch: () =>
    set((state) => ({
      libraryQuery: state.libraryQueryInput.trim(),
      artistOffset: 0,
      albumOffset: 0,
      trackOffset: 0,
      selectedArtist: null,
      selectedAlbum: null,
    })),
  setArtistOffset: (value: number) => set({ artistOffset: Math.max(0, value) }),
  setAlbumOffset: (value: number) => set({ albumOffset: Math.max(0, value) }),
  setTrackOffset: (value: number) => set({ trackOffset: Math.max(0, value) }),
  selectArtist: (name: string) =>
    set({
      selectedArtist: name,
      selectedAlbum: null,
    }),
  selectAlbum: (album: SelectedAlbum) =>
    set({
      selectedAlbum: album,
    }),
  clearSelections: () =>
    set({
      selectedArtist: null,
      selectedAlbum: null,
    }),
}));
