import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  deleteMyAccount,
  fetchMyProfile,
  ProfileApiError,
  updateMyProfile,
  uploadMyAvatar,
} from "../services/profileApi";

type SettingsTab = "general" | "account";

function formatMemberSince(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatToday(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function FieldLabel({ children }: { children: string }) {
  return <span className="mb-2 block text-sm font-medium text-stone">{children}</span>;
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full rounded-xl border border-leaf/15 bg-white px-4 py-3 text-sm text-ink outline-none transition",
        "placeholder:text-stone/50 focus:border-leaf/40 focus:ring-2 focus:ring-leaf/15",
        props.readOnly ? "cursor-not-allowed bg-mist/70 text-stone" : "",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={[
        "w-full resize-y rounded-xl border border-leaf/15 bg-white px-4 py-3 text-sm text-ink outline-none transition",
        "placeholder:text-stone/50 focus:border-leaf/40 focus:ring-2 focus:ring-leaf/15",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
      />
    </svg>
  );
}

export function ProfilePage() {
  const { user, isAuthenticated, getAccessToken, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<SettingsTab>("general");
  const [fullName, setFullName] = useState("");
  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [phone, setPhone] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [memberSince, setMemberSince] = useState<string | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAuthFailure = async () => {
    setError("Session expired. Please sign in again.");
    await logout();
  };

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setIsLoadingProfile(false);
      return;
    }

    setFullName(user.name);
    setNickname(user.nickname);
    setBio(user.bio);
    setPhone(user.phone);
    setPreviewUrl(user.profile_picture);
    setMemberSince(user.created_at ?? null);

    const token = getAccessToken();
    if (!token) {
      setIsLoadingProfile(false);
      void handleAuthFailure();
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const profile = await fetchMyProfile(token);
        if (cancelled) return;
        updateUser(profile);
        setFullName(profile.name);
        setNickname(profile.nickname);
        setBio(profile.bio);
        setPhone(profile.phone);
        setPreviewUrl(profile.profile_picture);
        setMemberSince(profile.created_at ?? null);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ProfileApiError && err.status === 401) {
          await handleAuthFailure();
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load profile");
      } finally {
        if (!cancelled) setIsLoadingProfile(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, getAccessToken, updateUser, logout]);

  if (!isAuthenticated || !user) {
    return <Navigate to="/dashboard" replace />;
  }

  const displayInitial = (fullName || user.name || "?").charAt(0).toUpperCase();
  const greetingName = nickname.trim() || fullName.split(" ")[0] || user.name;

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const token = getAccessToken();
    if (!token) {
      setError("Session expired. Please sign in again.");
      return;
    }

    setError(null);
    setMessage(null);
    setIsUploading(true);

    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);

    try {
      const updated = await uploadMyAvatar(token, file);
      updateUser(updated);
      setPreviewUrl(updated.profile_picture);
      setMessage("Profile photo updated.");
    } catch (err) {
      setPreviewUrl(user.profile_picture);
      if (err instanceof ProfileApiError && err.status === 401) {
        await handleAuthFailure();
      } else {
        setError(err instanceof Error ? err.message : "Failed to upload avatar");
      }
    } finally {
      URL.revokeObjectURL(localPreview);
      setIsUploading(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const token = getAccessToken();
    if (!token) {
      setError("Session expired. Please sign in again.");
      return;
    }

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setError("Full name is required.");
      return;
    }

    setError(null);
    setMessage(null);
    setIsSaving(true);

    try {
      const updated = await updateMyProfile(token, {
        full_name: trimmedName,
        nickname: nickname.trim(),
        bio: bio.trim(),
        phone: phone.trim(),
      });
      updateUser(updated);
      setFullName(updated.name);
      setNickname(updated.nickname);
      setBio(updated.bio);
      setPhone(updated.phone);
      setMemberSince(updated.created_at ?? null);
      setMessage("Settings saved.");
    } catch (err) {
      if (err instanceof ProfileApiError && err.status === 401) {
        await handleAuthFailure();
      } else {
        setError(err instanceof Error ? err.message : "Failed to save settings");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    const token = getAccessToken();
    if (!token) {
      setError("Session expired. Please sign in again.");
      return;
    }

    setError(null);
    setIsDeleting(true);

    try {
      await deleteMyAccount(token);
      setShowDeleteConfirm(false);
      await logout();
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ProfileApiError && err.status === 401) {
        await handleAuthFailure();
      } else {
        setError(err instanceof Error ? err.message : "Failed to delete account");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl animate-fade-up space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-forest sm:text-4xl">
          Settings
        </h1>
        <p className="mt-1 text-sm text-stone">{formatToday()}</p>
      </header>

      {isLoadingProfile ? (
        <div className="rounded-2xl bg-white p-8 text-sm text-stone ring-1 ring-forest/5">
          Loading your settings…
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
          <aside className="space-y-1">
            {(
              [
                { id: "general", label: "General" },
                { id: "account", label: "Account" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setMessage(null);
                  setError(null);
                }}
                className={[
                  "block w-full rounded-xl px-4 py-2.5 text-left text-sm font-medium transition-colors",
                  tab === item.id
                    ? "bg-leaf/10 text-forest"
                    : "text-stone hover:bg-white hover:text-forest",
                ].join(" ")}
              >
                {item.label}
              </button>
            ))}
          </aside>

          <form onSubmit={handleSubmit} className="min-w-0 space-y-8">
            {tab === "general" ? (
              <>
                <section className="space-y-5">
                  <div>
                    <h2 className="text-lg font-semibold text-ink">General</h2>
                    <p className="mt-1 text-sm font-medium text-forest">Profile</p>
                    <p className="text-sm text-stone">
                      How you appear across My Smart Journey.
                    </p>
                  </div>

                  <div className="flex flex-col gap-4 rounded-2xl bg-leaf/10 p-4 sm:flex-row sm:items-center">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={fullName || user.name}
                        className="h-16 w-16 rounded-2xl object-cover ring-2 ring-white"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-forest text-xl font-semibold text-white">
                        {displayInitial}
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-medium text-ink">
                        Profile Photo
                        <span className="font-normal text-stone">
                          {" "}
                          · Upload your own or keep Google photo
                        </span>
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(event) => {
                            void handleAvatarChange(event);
                          }}
                        />
                        <button
                          type="button"
                          disabled={isUploading}
                          onClick={() => fileInputRef.current?.click()}
                          className="rounded-lg border border-leaf/25 bg-white px-3 py-1.5 text-sm font-medium text-forest transition hover:bg-mist disabled:opacity-50"
                        >
                          {isUploading ? "Uploading…" : "Upload photo"}
                        </button>
                        <span className="inline-flex items-center gap-1.5 text-xs text-stone">
                          <GoogleMark />
                          Google Sign-In
                        </span>
                      </div>
                    </div>
                  </div>

                  <label className="block">
                    <FieldLabel>Full name</FieldLabel>
                    <TextInput
                      type="text"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      maxLength={100}
                      required
                    />
                  </label>

                  <label className="block">
                    <FieldLabel>What should My Smart Journey call you?</FieldLabel>
                    <TextInput
                      type="text"
                      value={nickname}
                      onChange={(event) => setNickname(event.target.value)}
                      maxLength={50}
                      placeholder={greetingName || "Nickname"}
                    />
                  </label>

                  <label className="block">
                    <FieldLabel>What best describes your travel style?</FieldLabel>
                    <TextArea
                      value={bio}
                      onChange={(event) => setBio(event.target.value)}
                      maxLength={500}
                      rows={3}
                      placeholder="Eco-conscious Explorer"
                    />
                  </label>
                </section>
              </>
            ) : (
              <>
                <section className="space-y-5">
                  <div>
                    <h2 className="text-lg font-semibold text-ink">Account</h2>
                    <p className="mt-1 text-sm text-stone">
                      Manage your signed-in account.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-ink">Your Journey Stats</h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      {[
                        { label: "Trips planned", value: "0" },
                        { label: "Destinations", value: "0" },
                        { label: "Eco score", value: "—" },
                      ].map((stat) => (
                        <div
                          key={stat.label}
                          className="rounded-2xl border border-leaf/10 bg-white px-4 py-4"
                        >
                          <p className="text-2xl font-semibold text-forest">{stat.value}</p>
                          <p className="mt-1 text-sm text-stone">{stat.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-base font-semibold text-ink">Account Details</h3>
                    <label className="block">
                      <FieldLabel>Email</FieldLabel>
                      <TextInput type="email" value={user.email} readOnly />
                      <span className="mt-1.5 block text-xs text-stone">
                        Managed by your Google account.
                      </span>
                    </label>
                    <label className="block">
                      <FieldLabel>Member since</FieldLabel>
                      <TextInput
                        type="text"
                        value={formatMemberSince(memberSince)}
                        readOnly
                      />
                    </label>
                    <label className="block">
                      <FieldLabel>Phone</FieldLabel>
                      <TextInput
                        type="tel"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        maxLength={30}
                        placeholder="+60 12-345 6789"
                      />
                    </label>
                  </div>
                </section>

                <section className="rounded-2xl border border-red-200 bg-red-50/60 p-5">
                  <h3 className="text-base font-semibold text-red-800">Danger Zone</h3>
                  <p className="mt-1 text-sm text-red-700/80">
                    Permanently remove your account and saved data.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setShowDeleteConfirm(true);
                    }}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
                  >
                    Delete Account
                  </button>
                </section>
              </>
            )}

            {error ? (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="rounded-xl bg-leaf/10 px-3 py-2 text-sm text-forest" role="status">
                {message}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 border-t border-leaf/10 pt-6">
              <button
                type="submit"
                disabled={isSaving || isUploading || isDeleting}
                className="rounded-xl bg-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest/90 disabled:opacity-50"
              >
                {isSaving ? "Saving…" : "Save changes"}
              </button>
              <Link
                to="/dashboard"
                className="rounded-xl border border-leaf/25 px-5 py-2.5 text-sm font-medium text-forest no-underline transition hover:bg-leaf/5"
              >
                Back to dashboard
              </Link>
            </div>
          </form>
        </div>
      )}

      {showDeleteConfirm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/55 px-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          onClick={() => {
            if (!isDeleting) setShowDeleteConfirm(false);
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl ring-1 ring-red-100"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-sm font-semibold text-red-700">
                !
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  id="delete-account-title"
                  className="text-base font-semibold text-ink"
                >
                  Delete account?
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-stone">
                  This permanently removes{" "}
                  <span className="break-all font-medium text-ink">{user.email}</span>
                  {" "}and cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-xl border border-leaf/25 px-3 py-2.5 text-sm font-medium text-forest transition hover:bg-mist disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  void handleDeleteAccount();
                }}
                className="rounded-xl bg-red-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
