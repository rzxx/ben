import { ReactNode } from "react";
import { BootstrapProvider } from "./BootstrapProvider";
import { LibraryProvider } from "./LibraryProvider";
import { PlaybackProvider } from "./PlaybackProvider";
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
        <PlaybackProvider>
          <ScannerProvider>
            <LibraryProvider>
              <StatsProvider>
                <ThemeProvider>{props.children}</ThemeProvider>
              </StatsProvider>
            </LibraryProvider>
          </ScannerProvider>
        </PlaybackProvider>
      </BootstrapProvider>
    </QueryProvider>
  );
}
