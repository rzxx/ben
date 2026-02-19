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
  decoding?: "async" | "sync" | "auto";
  variant?: CoverVariant;
  fallbackVariant?: CoverVariant;
  loadingFallback?: "none" | "skeleton";
};

export function CoverArt(props: CoverArtProps) {
  const [failedSources, setFailedSources] = useState<Record<string, true>>({});
  const [, setLoadedVersion] = useState(0);
  const [isPrimaryElementLoaded, setIsPrimaryElementLoaded] = useState(false);

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
  const imageLoading = props.loading ?? "lazy";
  const imageDecoding = props.decoding ?? "async";

  useEffect(() => {
    setIsPrimaryElementLoaded(
      !!primarySource && loadedCoverSources.has(primarySource),
    );
  }, [primarySource]);

  const shouldPreloadPrimary = !!primarySource && canUseFallback;
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
      if (cancelled) {
        return;
      }

      const markPrimaryReady = () => {
        if (!cancelled && rememberLoadedCoverSource(primarySource)) {
          setLoadedVersion((current) => current + 1);
        }
      };

      if (typeof preloader.decode === "function") {
        void preloader.decode().catch(() => undefined).finally(markPrimaryReady);
        return;
      }

      markPrimaryReady();
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

  const layeredWrapperClassName = props.className
    ? `relative block shrink-0 overflow-hidden ${props.className}`
    : "relative block h-12 w-12 shrink-0 overflow-hidden rounded-md";

  const canRenderFallback =
    !!fallbackSource && failedSources[fallbackSource] !== true;
  const shouldRenderLayeredSwap =
    !!primarySource && canUseFallback && canRenderFallback && !hasPrimaryFailed;
  const layeredPrimarySource =
    shouldRenderLayeredSwap && primarySource ? primarySource : undefined;
  const layeredFallbackSource =
    shouldRenderLayeredSwap && fallbackSource ? fallbackSource : undefined;

  if (layeredPrimarySource && layeredFallbackSource) {
    return (
      <div className={layeredWrapperClassName}>
        <img
          className="absolute inset-0 h-full w-full object-cover object-center"
          src={layeredFallbackSource}
          alt=""
          aria-hidden="true"
          loading={imageLoading}
          decoding={imageDecoding}
          onLoad={() => {
            if (rememberLoadedCoverSource(layeredFallbackSource)) {
              setLoadedVersion((current) => current + 1);
            }
          }}
          onError={() => {
            setFailedSources((current) => {
              if (current[layeredFallbackSource]) {
                return current;
              }

              return {
                ...current,
                [layeredFallbackSource]: true,
              };
            });
          }}
        />
        <img
          className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-150 ${isPrimaryElementLoaded ? "opacity-100" : "opacity-0"}`}
          src={layeredPrimarySource}
          alt={props.alt}
          loading={imageLoading}
          decoding={imageDecoding}
          onLoad={() => {
            setIsPrimaryElementLoaded(true);
            if (rememberLoadedCoverSource(layeredPrimarySource)) {
              setLoadedVersion((current) => current + 1);
            }
          }}
          onError={() => {
            setIsPrimaryElementLoaded(false);
            setFailedSources((current) => {
              if (current[layeredPrimarySource]) {
                return current;
              }

              return {
                ...current,
                [layeredPrimarySource]: true,
              };
            });
          }}
        />
      </div>
    );
  }

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
      loading={imageLoading}
      decoding={imageDecoding}
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
