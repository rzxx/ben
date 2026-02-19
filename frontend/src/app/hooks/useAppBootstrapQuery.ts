import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  bootstrapQueries,
  createEmptyBootstrapSnapshot,
  defaultBootstrapQueryInput,
} from "../query/bootstrapQueries";
import { parseError } from "../utils/appUtils";

export function useAppBootstrapQuery() {
  const bootstrapQuery = useQuery({
    ...bootstrapQueries.snapshot(defaultBootstrapQueryInput),
  });

  const bootstrapSnapshot = useMemo(
    () => bootstrapQuery.data ?? createEmptyBootstrapSnapshot(),
    [bootstrapQuery.data],
  );

  const isBootstrapped = !bootstrapQuery.isPending;

  return {
    bootstrapQuery,
    bootstrapSnapshot,
    bootstrapErrorMessage: bootstrapQuery.isError ? parseError(bootstrapQuery.error) : null,
    isBootstrapped,
  };
}
