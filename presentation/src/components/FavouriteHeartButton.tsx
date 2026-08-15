import type { MouseEvent } from "react";

type FavouriteHeartButtonProps = {
  filled: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
  size?: "sm" | "md";
};

function IconHeart({ filled, size }: { filled: boolean; size: "sm" | "md" }) {
  const dim = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <svg
      viewBox="0 0 24 24"
      className={dim}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21s-6.7-4.4-9-8.2C1.2 8.8 3.6 5 7.5 5c2.1 0 3.4 1.1 4.5 2.2C13.1 6.1 14.4 5 16.5 5c3.9 0 6.3 3.8 4.5 7.8C18.7 16.6 12 21 12 21Z"
      />
    </svg>
  );
}

export function FavouriteHeartButton({
  filled,
  onClick,
  disabled = false,
  label,
  className = "",
  size = "sm",
}: FavouriteHeartButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label ?? (filled ? "Remove from favourites" : "Add to favourites")}
      aria-pressed={filled}
      className={[
        "inline-flex items-center justify-center rounded-full transition",
        filled ? "text-rose-600" : "text-forest/55 hover:text-rose-600",
        "hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-9 w-9" : "h-10 w-10",
        className,
      ].join(" ")}
    >
      <IconHeart filled={filled} size={size} />
    </button>
  );
}
