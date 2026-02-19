import { ScrollArea } from "@base-ui/react/scroll-area";
import { lazy, Suspense, useState } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { LeftSidebar } from "../features/layout/LeftSidebar";
import { RightSidebar } from "../features/layout/RightSidebar";
import { PlayerBar } from "../features/player/PlayerBar";
import { TitleBar } from "../features/layout/TitleBar";
import { useRouteModulePreloader } from "./hooks/useRouteModulePreloader";
import { useShellDomainErrorMessage } from "./hooks/useShellDomainErrorMessage";
import { useBootstrap } from "./providers/BootstrapContext";
import { useTheme } from "./providers/ThemeContext";
import {
  usePlaybackActions,
  usePlaybackHasCurrentTrack,
  usePlaybackPlayerState,
  usePlaybackQueueState,
  usePlaybackSeekMax,
  usePlaybackSeekValue,
  usePlaybackTransportBusy,
} from "./state/playback/playbackSelectors";
import { formatDuration } from "./utils/appUtils";
import { buildAlbumDetailPath, buildArtistDetailPath } from "./utils/routePaths";

const AlbumsRoute = lazy(() =>
  import("./routes/AlbumsRoute").then((module) => ({
    default: module.AlbumsRoute,
  })),
);
const AlbumDetailRoute = lazy(() =>
  import("./routes/AlbumDetailRoute").then((module) => ({
    default: module.AlbumDetailRoute,
  })),
);
const ArtistsRoute = lazy(() =>
  import("./routes/ArtistsRoute").then((module) => ({
    default: module.ArtistsRoute,
  })),
);
const ArtistDetailRoute = lazy(() =>
  import("./routes/ArtistDetailRoute").then((module) => ({
    default: module.ArtistDetailRoute,
  })),
);
const TracksRoute = lazy(() =>
  import("./routes/TracksRoute").then((module) => ({
    default: module.TracksRoute,
  })),
);
const SettingsRoute = lazy(() =>
  import("./routes/SettingsRoute").then((module) => ({
    default: module.SettingsRoute,
  })),
);
const StatsRoute = lazy(() =>
  import("./routes/StatsRoute").then((module) => ({
    default: module.StatsRoute,
  })),
);
const DeferredBackgroundShader = lazy(() =>
  import("../shared/components/BackgroundShader").then((module) => ({
    default: module.BackgroundShader,
  })),
);

export function AppShell() {
  const [location, navigate] = useLocation();
  const { state: bootstrapState } = useBootstrap();
  const { meta: themeMeta } = useTheme();
  const preloadRouteModuleByPath = useRouteModulePreloader();

  return (
    <div className="bg-theme-50 text-theme-900 dark:bg-theme-950 dark:text-theme-100 relative isolate flex h-dvh flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(120% 120% at 15% -5%, rgba(120, 120, 120, 0.26) 0%, rgba(12, 12, 12, 0) 58%), radial-gradient(130% 130% at 85% -10%, rgba(90, 90, 90, 0.2) 0%, rgba(12, 12, 12, 0) 62%)",
        }}
      />
      <Suspense fallback={null}>
        {themeMeta.isShaderReady ? <DeferredBackgroundShader /> : null}
      </Suspense>

      <TitleBar />

      <div className="relative z-10 flex min-h-0 flex-1">
        <LeftSidebar
          location={location}
          onNavigate={navigate}
          onNavigateIntent={preloadRouteModuleByPath}
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ScrollArea.Root className="min-h-0 flex-1">
            <ScrollArea.Viewport className="h-full">
              <ScrollArea.Content className="min-w-full px-4 pt-4 pb-36 lg:px-6">
                <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-3">
                  {bootstrapState.errorMessage ? (
                    <p className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                      {bootstrapState.errorMessage}
                    </p>
                  ) : null}

                  <ShellDomainErrorBanner />

                  {!bootstrapState.isBootstrapped ? (
                    <p className="text-theme-600 dark:text-theme-400 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm">
                      Loading your library shell...
                    </p>
                  ) : null}

                  <Suspense
                    fallback={
                      <section className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-sm">
                        <p className="text-theme-700 dark:text-theme-300">Loading view...</p>
                      </section>
                    }
                  >
                    <Switch>
                      <Route path="/">
                        <Redirect to="/albums" replace />
                      </Route>

                      <Route path="/albums" component={AlbumsRoute} />

                      <Route path="/albums/:albumArtist/:albumTitle">
                        {(params) => (
                          <AlbumDetailRoute
                            albumArtistParam={params.albumArtist}
                            albumTitleParam={params.albumTitle}
                          />
                        )}
                      </Route>

                      <Route path="/artists" component={ArtistsRoute} />

                      <Route path="/artists/:artistName">
                        {(params) => (
                          <ArtistDetailRoute artistNameParam={params.artistName} />
                        )}
                      </Route>

                      <Route path="/tracks" component={TracksRoute} />

                      <Route path="/settings" component={SettingsRoute} />

                      <Route path="/stats" component={StatsRoute} />

                      <Route path="*">
                        <section>
                          <h1 className="text-theme-900 dark:text-theme-100 text-xl font-semibold">
                            Not Found
                          </h1>
                          <p className="text-theme-600 dark:text-theme-400 text-sm">
                            Choose Albums, Artists, Tracks, Stats, or Settings.
                          </p>
                        </section>
                      </Route>
                    </Switch>
                  </Suspense>
                </div>
              </ScrollArea.Content>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar className="bg-theme-300/20 dark:bg-theme-300/50 pointer-events-none m-2 flex w-1 justify-center rounded opacity-0 transition-opacity duration-150 data-hovering:pointer-events-auto data-hovering:opacity-100 data-scrolling:pointer-events-auto data-scrolling:opacity-100 data-scrolling:duration-0">
              <ScrollArea.Thumb className="bg-theme-300/50 w-full rounded" />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
        </main>

        <ShellRightSidebar />
      </div>

      <ShellPlayerBar />
    </div>
  );
}

function ShellRightSidebar() {
  const playbackActions = usePlaybackActions();
  const queueState = usePlaybackQueueState();
  const playerState = usePlaybackPlayerState();
  const [rightSidebarTab, setRightSidebarTab] = useState<"queue" | "details">("queue");

  return (
    <RightSidebar
      tab={rightSidebarTab}
      onTabChange={setRightSidebarTab}
      queueState={queueState}
      playerState={playerState}
      onSelectQueueIndex={playbackActions.selectQueueIndex}
      onRemoveQueueTrack={playbackActions.removeQueueTrack}
      onClearQueue={playbackActions.clearQueue}
      formatDuration={formatDuration}
    />
  );
}

function ShellDomainErrorBanner() {
  const errorMessage = useShellDomainErrorMessage();

  if (!errorMessage) {
    return null;
  }

  return (
    <p className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
      {errorMessage}
    </p>
  );
}

function ShellPlayerBar() {
  const [, navigate] = useLocation();
  const playbackActions = usePlaybackActions();
  const playerState = usePlaybackPlayerState();
  const queueState = usePlaybackQueueState();
  const transportBusy = usePlaybackTransportBusy();
  const hasCurrentTrack = usePlaybackHasCurrentTrack();
  const seekMax = usePlaybackSeekMax();
  const seekValue = usePlaybackSeekValue();

  return (
    <PlayerBar
      currentTrack={playerState.currentTrack}
      playerState={playerState}
      queueState={queueState}
      transportBusy={transportBusy}
      hasCurrentTrack={hasCurrentTrack}
      seekMax={seekMax}
      seekValue={seekValue}
      onPreviousTrack={playbackActions.previousTrack}
      onTogglePlayback={playbackActions.togglePlayback}
      onNextTrack={playbackActions.nextTrack}
      onToggleShuffle={playbackActions.toggleShuffle}
      onCycleRepeat={playbackActions.cycleRepeat}
      onSeek={playbackActions.seek}
      onSetVolume={playbackActions.setVolume}
      onOpenAlbum={(track) => {
        navigate(buildAlbumDetailPath(track.album, track.albumArtist));
      }}
      onOpenArtist={(artistName) => {
        navigate(buildArtistDetailPath(artistName));
      }}
      formatDuration={formatDuration}
    />
  );
}
