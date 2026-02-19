import { useEffect, useState } from "react";
import { CoverVariant, coverPathToURL } from "../cover";

const loadedCoverSources = new Set<string>();

function rememberLoadedCoverSource(source: string): boolean {
  if (loadedCoverSources.has(source)) {
    return false;
  }

  loadedCoverSources.add(source);
  return true;
}

type CoverArtProps = {
  coverPath?: string;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
  variant?: CoverVariant;
  fallbackVariant?: CoverVariant;
  loadingFallback?: "none" | "skeleton";
};

export function CoverArt(props: CoverArtProps) {
  const [failedSources, setFailedSources] = useState<Record<string, true>>({});
  const [, setLoadedVersion] = useState(0);

  const primarySource = coverPathToURL(
    props.coverPath,
    props.variant ?? "original",
  );
  const fallbackSource = props.fallbackVariant
    ? coverPathToURL(props.coverPath, props.fallbackVariant)
    : undefined;
  const canUseFallback =
    !!fallbackSource && !!primarySource && fallbackSource !== primarySource;
  const loadingFallback = props.loadingFallback ?? "none";

  const shouldPreloadPrimary =
    !!primarySource && (canUseFallback || loadingFallback === "skeleton");
  const isPrimaryReady =
    !primarySource ||
    !shouldPreloadPrimary ||
    loadedCoverSources.has(primarySource);
  const hasPrimaryFailed =
    !!primarySource && failedSources[primarySource] === true;

  useEffect(() => {
    if (
      !primarySource ||
      !shouldPreloadPrimary ||
      isPrimaryReady ||
      hasPrimaryFailed
    ) {
      return;
    }

    let cancelled = false;
    const preloader = new Image();
    preloader.src = primarySource;
    preloader.onload = () => {
      if (!cancelled) {
        if (rememberLoadedCoverSource(primarySource)) {
          setLoadedVersion((current) => current + 1);
        }
      }
    };
    preloader.onerror = () => {
      if (!cancelled) {
        setFailedSources((current) => {
          if (current[primarySource]) {
            return current;
          }

          return {
            ...current,
            [primarySource]: true,
          };
        });
      }
    };

    return () => {
      cancelled = true;
      preloader.onload = null;
      preloader.onerror = null;
    };
  }, [hasPrimaryFailed, isPrimaryReady, primarySource, shouldPreloadPrimary]);

  let source: string | undefined;
  if (!primarySource) {
    source = undefined;
  } else if (hasPrimaryFailed) {
    source = fallbackSource;
  } else if (canUseFallback && !isPrimaryReady) {
    source = fallbackSource;
  } else if (loadingFallback === "skeleton" && !isPrimaryReady) {
    source = undefined;
  } else {
    source = primarySource;
  }

  const canRenderImage = !!source && failedSources[source] !== true;
  const showLoadingFallback =
    !!primarySource &&
    !hasPrimaryFailed &&
    !isPrimaryReady &&
    (loadingFallback === "skeleton" || canUseFallback);

  const placeholderClassName = props.className
    ? `block shrink-0 bg-theme-200/15 dark:bg-theme-800 object-cover object-center ${props.className}`
    : "block h-12 w-12 shrink-0 rounded-md bg-theme-200 object-cover object-center dark:bg-theme-800";

  const imageClassName = props.className
    ? `block shrink-0 object-cover object-center ${props.className}`
    : "block h-12 w-12 shrink-0 rounded-md object-cover object-center";

  if (!canRenderImage) {
    if (showLoadingFallback) {
      return (
        <div
          className={`${placeholderClassName} animate-pulse`}
          aria-hidden="true"
        />
      );
    }

    return (
      <div
        className={`${placeholderClassName} text-theme-500 dark:text-theme-500 flex items-center justify-center text-[10px] tracking-wide uppercase`}
      >
        No Cover
      </div>
    );
  }

  return (
    <img
      className={imageClassName}
      src={source}
      alt={props.alt}
      loading={props.loading ?? "lazy"}
      onLoad={() => {
        if (!source) {
          return;
        }

        if (rememberLoadedCoverSource(source)) {
          setLoadedVersion((current) => current + 1);
        }
      }}
      onError={() => {
        if (!source) {
          return;
        }

        setFailedSources((current) => {
          if (current[source]) {
            return current;
          }

          return {
            ...current,
            [source]: true,
          };
        });
      }}
    />
  );
}
