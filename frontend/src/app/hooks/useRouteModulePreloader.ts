import { useCallback } from "react";

function preloadRouteModules(path: string) {
  if (path.startsWith("/artists")) {
    void Promise.all([
      import("../routes/ArtistsRoute"),
      import("../routes/ArtistDetailRoute"),
    ]);
    return;
  }

  if (path.startsWith("/tracks")) {
    void import("../routes/TracksRoute");
    return;
  }

  if (path.startsWith("/settings")) {
    void import("../routes/SettingsRoute");
    return;
  }

  if (path.startsWith("/stats")) {
    void import("../routes/StatsRoute");
    return;
  }

  if (path.startsWith("/albums")) {
    void Promise.all([
      import("../routes/AlbumsRoute"),
      import("../routes/AlbumDetailRoute"),
    ]);
  }
}

export function useRouteModulePreloader(): (path: string) => void {
  return useCallback((path: string) => {
    preloadRouteModules(path);
  }, []);
}
