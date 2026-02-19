import { ReactNode } from "react";
import { BootstrapCacheHydrator } from "./BootstrapCacheHydrator";
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
      <BootstrapCacheHydrator />
      <PlaybackStoreProvider>
        <ScannerStoreProvider>
          <ThemeStoreProvider>{props.children}</ThemeStoreProvider>
        </ScannerStoreProvider>
      </PlaybackStoreProvider>
    </QueryProvider>
  );
}
