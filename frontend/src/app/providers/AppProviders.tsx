import { ReactNode } from "react";
import { BootstrapProvider } from "./BootstrapProvider";
import { PlaybackStoreProvider } from "./PlaybackStoreProvider";
import { QueryProvider } from "./QueryProvider";
import { ScannerProvider } from "./ScannerProvider";
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
            <ThemeProvider>{props.children}</ThemeProvider>
          </ScannerProvider>
        </PlaybackStoreProvider>
      </BootstrapProvider>
    </QueryProvider>
  );
}
