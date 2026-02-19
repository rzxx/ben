import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  bootstrapQueries,
  defaultBootstrapQueryInput,
} from "../query/bootstrapQueries";
import { queryKeys } from "../query/keys";

const defaultAlbumsQueryInput = {
  search: "",
  artist: "",
  limit: defaultBootstrapQueryInput.albumsLimit,
  offset: defaultBootstrapQueryInput.albumsOffset,
} as const;

export function BootstrapCacheHydrator() {
  const queryClient = useQueryClient();

  const bootstrapQuery = useQuery({
    ...bootstrapQueries.snapshot(defaultBootstrapQueryInput),
  });

  useEffect(() => {
    if (!bootstrapQuery.data) {
      return;
    }

    queryClient.setQueryData(
      queryKeys.library.albums(defaultAlbumsQueryInput),
      bootstrapQuery.data.albumsPage,
    );
  }, [bootstrapQuery.data, queryClient]);

  return null;
}
