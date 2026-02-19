import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import type { ReactNode } from "react";
import { appQueryClient } from "../query/client";

type QueryProviderProps = {
  children: ReactNode;
};

export function QueryProvider(props: QueryProviderProps) {
  return (
    <QueryClientProvider client={appQueryClient}>
      {props.children}
      {import.meta.env.DEV ? (
        <ReactQueryDevtools buttonPosition="bottom-left" initialIsOpen={false} />
      ) : null}
    </QueryClientProvider>
  );
}
