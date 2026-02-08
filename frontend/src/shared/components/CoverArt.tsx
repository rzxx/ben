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

  const className = props.className ? `cover-art ${props.className}` : "cover-art";

  if (!canRenderImage) {
    return <div className={`${className} cover-art-placeholder`}>No Cover</div>;
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
