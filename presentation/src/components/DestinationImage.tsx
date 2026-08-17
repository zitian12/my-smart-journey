import { useState } from "react";

type DestinationImageProps = {
  images: string[];
  alt: string;
  className?: string;
};

export function DestinationImage({
  images,
  alt,
  className = "h-full w-full object-cover",
}: DestinationImageProps) {
  const [index, setIndex] = useState(0);
  const src = images[index];

  if (!src) {
    return <div className={`bg-mist ${className}`} aria-hidden />;
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => {
        setIndex((current) => {
          if (current + 1 < images.length) {
            return current + 1;
          }
          return current;
        });
      }}
    />
  );
}
