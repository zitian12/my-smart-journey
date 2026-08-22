import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { useAuth } from "../context/AuthContext";

type LoginModalProps = {
  open: boolean;
  title?: string;
  message?: string;
  onClose: () => void;
  onLoggedIn?: () => void;
};

export function LoginModal({
  open,
  title = "Sign in to continue",
  message = "Use your Google account to save trips and sync across devices.",
  onClose,
  onLoggedIn,
}: LoginModalProps) {
  const { loginWithGoogle, isLoading } = useAuth();
  const googleLoginRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleGoogleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) return;
    try {
      await loginWithGoogle(response.credential);
      onLoggedIn?.();
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  const openGoogleSignIn = () => {
    const button = googleLoginRef.current?.querySelector(
      'div[role="button"]',
    ) as HTMLElement | null;
    button?.click();
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 print:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-ink/50"
        aria-label="Close sign in"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
        className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl ring-1 ring-forest/10"
      >
        <h2
          id="login-modal-title"
          className="font-display text-xl font-semibold text-forest"
        >
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-stone">{message}</p>
        <button
          type="button"
          disabled={isLoading}
          onClick={openGoogleSignIn}
          className="mt-5 w-full rounded-xl bg-forest px-4 py-3 text-sm font-semibold text-white transition hover:bg-leaf disabled:opacity-60"
        >
          {isLoading ? "Signing in…" : "Continue with Google"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-xl px-4 py-2.5 text-sm font-medium text-stone transition hover:bg-mist"
        >
          Cancel
        </button>
        <div ref={googleLoginRef} className="sr-only" aria-hidden="true">
          <GoogleLogin
            onSuccess={(response) => void handleGoogleSuccess(response)}
            onError={() =>
              console.error("Google sign-in was cancelled or failed")
            }
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
