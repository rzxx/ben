import { ReactNode } from "react";
import { BootstrapProvider } from "./BootstrapProvider";
import { LibraryProvider } from "./LibraryProvider";
import { PlaybackStoreProvider } from "./PlaybackStoreProvider";
import { QueryProvider } from "./QueryProvider";
import { ScannerProvider } from "./ScannerProvider";
import { StatsProvider } from "./StatsProvider";
import { ThemeProvider } from "./ThemeProvider";

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders(props: AppProvidersProps) {
  return (
    <QueryProvider>
      <BootstrapProvider>
        <PlaybackStoreProvider>
          <ScannerProvider>
            <LibraryProvider>
              <StatsProvider>
                <ThemeProvider>{props.children}</ThemeProvider>
              </StatsProvider>
            </LibraryProvider>
          </ScannerProvider>
        </PlaybackStoreProvider>
      </BootstrapProvider>
    </QueryProvider>
  );
}
