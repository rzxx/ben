import { ReactNode } from "react";
import { BootstrapProvider } from "./BootstrapProvider";
import { PlaybackStoreProvider } from "./PlaybackStoreProvider";
import { QueryProvider } from "./QueryProvider";
import { ScannerStoreProvider } from "./ScannerStoreProvider";
import { ThemeProvider } from "./ThemeProvider";

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders(props: AppProvidersProps) {
  return (
    <QueryProvider>
      <BootstrapProvider>
        <PlaybackStoreProvider>
          <ScannerStoreProvider>
            <ThemeProvider>{props.children}</ThemeProvider>
          </ScannerStoreProvider>
        </PlaybackStoreProvider>
      </BootstrapProvider>
    </QueryProvider>
  );
}
