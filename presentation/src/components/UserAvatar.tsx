import { useEffect, useState } from "react";
import { mediaUrl } from "../utils/mediaUrl";

export function UserAvatar({
  picture,
  name,
  className = "h-10 w-10 text-sm",
  imgClassName = "ring-2 ring-leaf/20",
  fallbackClassName = "bg-leaf/15 font-semibold text-forest",
}: {
  picture?: string | null;
  name: string;
  className?: string;
  imgClassName?: string;
  fallbackClassName?: string;
}) {
  const src = mediaUrl(picture);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center rounded-full ${className} ${fallbackClassName}`}
      >
        {name.charAt(0).toUpperCase() || "?"}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      className={`rounded-full object-cover ${className} ${imgClassName}`}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
