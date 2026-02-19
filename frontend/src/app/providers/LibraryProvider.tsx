import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "wouter";
import {
  GetAlbumDetail as getAlbumDetail,
  GetArtistDetail as getArtistDetail,
  GetArtistTopTracks as getArtistTopTracks,
  ListAlbums as listAlbums,
  ListArtists as listArtists,
  ListTracks as listTracks,
} from "../../../bindings/ben/libraryservice";
import {
  AlbumDetail,
  ArtistDetail,
  ArtistTopTrack,
  LibraryAlbum,
  LibraryArtist,
  LibraryTrack,
  PagedResult,
} from "../../features/types";
import {
  browseLimit,
  createEmptyPage,
  detailLimit,
  normalizePagedResult,
  parseError,
} from "../utils/appUtils";
import { useBootstrap } from "./BootstrapContext";
import { LibraryContext, LibraryContextValue } from "./LibraryContext";
import { useScanner } from "./ScannerContext";

type LibraryProviderProps = {
  children: ReactNode;
};

export function LibraryProvider(props: LibraryProviderProps) {
  const [location] = useLocation();
  const { state: bootstrapState } = useBootstrap();
  const { meta: scannerMeta } = useScanner();

  const albumDetailRequestTokenRef = useRef(0);
  const artistDetailRequestTokenRef = useRef(0);

  const [albumsPage, setAlbumsPage] = useState<PagedResult<LibraryAlbum> | null>(null);
  const [artistsPage, setArtistsPage] = useState<PagedResult<LibraryArtist>>({
    items: [],
    page: createEmptyPage(browseLimit, 0),
  });
  const [tracksPage, setTracksPage] = useState<PagedResult<LibraryTrack>>({
    items: [],
    page: createEmptyPage(browseLimit, 0),
  });

  const [hasLoadedArtistsPage, setHasLoadedArtistsPage] = useState(false);
  const [hasLoadedTracksPage, setHasLoadedTracksPage] = useState(false);

  const [albumDetail, setAlbumDetail] = useState<AlbumDetail | null>(null);
  const [albumDetailKey, setAlbumDetailKey] = useState<string | null>(null);
  const [artistDetail, setArtistDetail] = useState<ArtistDetail | null>(null);
  const [artistDetailKey, setArtistDetailKey] = useState<string | null>(null);
  const [artistTopTracks, setArtistTopTracks] = useState<ArtistTopTrack[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resolvedAlbumsPage = albumsPage ?? bootstrapState.albumsPage;

  const loadAlbumsPage = useCallback(async () => {
    const albumRows = await listAlbums("", "", browseLimit, 0);
    setAlbumsPage(normalizePagedResult<LibraryAlbum>(albumRows, browseLimit));
  }, []);

  const loadArtistsPage = useCallback(async () => {
    const artistRows = await listArtists("", browseLimit, 0);
    setArtistsPage(normalizePagedResult<LibraryArtist>(artistRows, browseLimit));
    setHasLoadedArtistsPage(true);
  }, []);

  const loadTracksPage = useCallback(async () => {
    const trackRows = await listTracks("", "", "", browseLimit, 0);
    setTracksPage(normalizePagedResult<LibraryTrack>(trackRows, browseLimit));
    setHasLoadedTracksPage(true);
  }, []);

  const ensureArtistsPageLoaded = useCallback(async () => {
    if (hasLoadedArtistsPage) {
      return;
    }

    try {
      await loadArtistsPage();
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  }, [hasLoadedArtistsPage, loadArtistsPage]);

  const ensureTracksPageLoaded = useCallback(async () => {
    if (hasLoadedTracksPage) {
      return;
    }

    try {
      await loadTracksPage();
    } catch (error) {
      setErrorMessage(parseError(error));
    }
  }, [hasLoadedTracksPage, loadTracksPage]);

  const loadAlbumDetailAction = useCallback(
    async (title: string, albumArtist: string) => {
      const detailKey = `${albumArtist}::${title}`;

      const requestToken = albumDetailRequestTokenRef.current + 1;
      albumDetailRequestTokenRef.current = requestToken;

      setAlbumDetailKey(detailKey);
      setAlbumDetail(null);

      try {
        setErrorMessage(null);
        const detail = await getAlbumDetail(title, albumArtist, detailLimit, 0);
        if (requestToken !== albumDetailRequestTokenRef.current) {
          return;
        }

        setAlbumDetail((detail ?? null) as AlbumDetail | null);
      } catch (error) {
        if (requestToken !== albumDetailRequestTokenRef.current) {
          return;
        }

        setErrorMessage(parseError(error));
      }
    },
    [],
  );

  const loadArtistDetailAction = useCallback(
    async (artistName: string) => {
      const requestToken = artistDetailRequestTokenRef.current + 1;
      artistDetailRequestTokenRef.current = requestToken;

      setArtistDetailKey(artistName);
      setArtistDetail(null);
      setArtistTopTracks([]);

      try {
        setErrorMessage(null);
        const [detail, topTracks] = await Promise.all([
          getArtistDetail(artistName, detailLimit, 0),
          getArtistTopTracks(artistName, 5),
        ]);

        if (requestToken !== artistDetailRequestTokenRef.current) {
          return;
        }

        setArtistDetail((detail ?? null) as ArtistDetail | null);
        setArtistTopTracks((topTracks ?? []) as ArtistTopTrack[]);
      } catch (error) {
        if (requestToken !== artistDetailRequestTokenRef.current) {
          return;
        }

        setErrorMessage(parseError(error));
      }
    },
    [],
  );

  useEffect(() => {
    if (!location.startsWith("/artists") || hasLoadedArtistsPage) {
      return;
    }

    const timer = window.setTimeout(() => {
      void ensureArtistsPageLoaded();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [ensureArtistsPageLoaded, hasLoadedArtistsPage, location]);

  useEffect(() => {
    if (!location.startsWith("/tracks") || hasLoadedTracksPage) {
      return;
    }

    const timer = window.setTimeout(() => {
      void ensureTracksPageLoaded();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [ensureTracksPageLoaded, hasLoadedTracksPage, location]);

  useEffect(() => {
    if (scannerMeta.scanCompletionCount <= 0) {
      return;
    }

    const refreshFromScan = async () => {
      try {
        setErrorMessage(null);
        await loadAlbumsPage();
        if (location.startsWith("/artists")) {
          await loadArtistsPage();
        }
        if (location.startsWith("/tracks")) {
          await loadTracksPage();
        }
      } catch (error) {
        setErrorMessage(parseError(error));
      }
    };

    void refreshFromScan();
  }, [loadAlbumsPage, loadArtistsPage, loadTracksPage, location, scannerMeta.scanCompletionCount]);

  const clearErrorAction = useCallback(() => {
    setErrorMessage(null);
  }, []);

  const contextValue = useMemo<LibraryContextValue>(
    () => ({
      state: {
        albumsPage: resolvedAlbumsPage,
        artistsPage,
        tracksPage,
        albumDetail,
        albumDetailKey,
        artistDetail,
        artistDetailKey,
        artistTopTracks,
        errorMessage,
      },
      actions: {
        loadAlbumsPage,
        ensureArtistsPageLoaded,
        ensureTracksPageLoaded,
        loadAlbumDetail: loadAlbumDetailAction,
        loadArtistDetail: loadArtistDetailAction,
        clearError: clearErrorAction,
      },
      meta: {
        hasLoadedArtistsPage,
        hasLoadedTracksPage,
      },
    }),
    [
      albumDetail,
      albumDetailKey,
      artistsPage,
      resolvedAlbumsPage,
      artistDetail,
      artistDetailKey,
      artistTopTracks,
      clearErrorAction,
      ensureArtistsPageLoaded,
      ensureTracksPageLoaded,
      errorMessage,
      hasLoadedArtistsPage,
      hasLoadedTracksPage,
      loadAlbumDetailAction,
      loadAlbumsPage,
      loadArtistDetailAction,
      tracksPage,
    ],
  );

  return (
    <LibraryContext.Provider value={contextValue}>
      {props.children}
    </LibraryContext.Provider>
  );
}
