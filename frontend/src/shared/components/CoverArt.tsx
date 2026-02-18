import { useState } from "react";
import { CoverVariant, coverPathToURL } from "../cover";

type CoverArtProps = {
  coverPath?: string;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
  variant?: CoverVariant;
};

export function CoverArt(props: CoverArtProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);

  const source = coverPathToURL(props.coverPath, props.variant ?? "original");
  const canRenderImage = !!source && source !== failedSource;

  const placeholderClassName = props.className
    ? `shrink-0 bg-neutral-200 dark:bg-neutral-800 object-cover object-center ${props.className}`
    : "bg-neutral-200 dark:bg-neutral-800 h-12 w-12 shrink-0 rounded-md object-cover object-center";

  const imageClassName = props.className
    ? `shrink-0 object-cover object-center ${props.className}`
    : "h-12 w-12 shrink-0 rounded-md object-cover object-center";

  if (!canRenderImage) {
    return (
      <div
        className={`${placeholderClassName} text-theme-500 flex items-center justify-center text-[10px] tracking-wide uppercase dark:text-neutral-500`}
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
      onError={() => setFailedSource(source)}
    />
  );
}
