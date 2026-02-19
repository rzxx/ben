import { QueryClient } from "@tanstack/react-query";
import { appQueryDefaultOptions } from "./options";

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: appQueryDefaultOptions,
  });
}

export const appQueryClient = createAppQueryClient();
