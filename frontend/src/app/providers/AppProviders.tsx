import { ReactNode } from "react";
import { BootstrapProvider } from "./BootstrapProvider";
import { PlaybackStoreProvider } from "./PlaybackStoreProvider";
import { QueryProvider } from "./QueryProvider";
import { ScannerStoreProvider } from "./ScannerStoreProvider";
import { ThemeStoreProvider } from "./ThemeStoreProvider";

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders(props: AppProvidersProps) {
  return (
    <QueryProvider>
      <BootstrapProvider>
        <PlaybackStoreProvider>
          <ScannerStoreProvider>
            <ThemeStoreProvider>{props.children}</ThemeStoreProvider>
          </ScannerStoreProvider>
        </PlaybackStoreProvider>
      </BootstrapProvider>
    </QueryProvider>
  );
}
