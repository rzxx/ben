import { useState } from "react";
import { coverPathToURL } from "../cover";

type CoverArtProps = {
  coverPath?: string;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
};

export function CoverArt(props: CoverArtProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);

  const source = coverPathToURL(props.coverPath);
  const canRenderImage = !!source && source !== failedSource;

  const className = props.className
    ? `shrink-0 bg-neutral-800 object-cover object-center ${props.className}`
    : "h-12 w-12 shrink-0 rounded-md bg-neutral-800 object-cover object-center";

  if (!canRenderImage) {
    return (
      <div
        className={`${className} flex items-center justify-center text-[10px] tracking-wide text-neutral-500 uppercase`}
      >
        No Cover
      </div>
    );
  }

  return (
    <img
      className={className}
      src={source}
      alt={props.alt}
      loading={props.loading ?? "lazy"}
      onError={() => setFailedSource(source)}
    />
  );
}
