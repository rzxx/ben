import { ReactNode } from "react";
import { BootstrapProvider } from "./BootstrapProvider";
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
            <StatsProvider>
              <ThemeProvider>{props.children}</ThemeProvider>
            </StatsProvider>
          </ScannerProvider>
        </PlaybackStoreProvider>
      </BootstrapProvider>
    </QueryProvider>
  );
}
