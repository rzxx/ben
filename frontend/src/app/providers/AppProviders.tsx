import { ReactNode } from "react";
import { AppStartupProvider } from "./AppStartupProvider";
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
      <AppStartupProvider>
        <PlaybackStoreProvider>
          <ScannerStoreProvider>
            <ThemeStoreProvider>{props.children}</ThemeStoreProvider>
          </ScannerStoreProvider>
        </PlaybackStoreProvider>
      </AppStartupProvider>
    </QueryProvider>
  );
}
