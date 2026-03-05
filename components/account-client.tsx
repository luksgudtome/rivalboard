"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PublicUser } from "@/lib/contracts";

interface AccountClientProps {
  user: PublicUser;
}

async function apiPatch(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }
  return payload;
}

export default function AccountClient({ user }: AccountClientProps) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.replace("/signin");
    router.refresh();
  }

  async function updateProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);
    setIsSavingProfile(true);

    try {
      const payload = await apiPatch("/api/auth/account", { name });
      setName(payload.user.name);
      setProfileSuccess("Account name updated.");
      router.refresh();
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Unexpected error.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function updatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);
    setIsSavingPassword(true);

    try {
      await apiPatch("/api/auth/account/password", {
        currentPassword,
        newPassword,
        confirmNewPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordSuccess("Password updated.");
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Unexpected error.");
    } finally {
      setIsSavingPassword(false);
    }
  }

  return (
    <main className="dashboard">
      <nav className="top-nav">
        <div className="top-nav-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              R
            </span>
            <span>Rivalboard</span>
          </div>
          <div className="nav-meta">
            <Link href="/dashboard" className="primary-btn as-link">
              Dashboard
            </Link>
            <button type="button" className="primary-btn ghost-btn" onClick={signOut}>
              Logout
            </button>
          </div>
        </div>
      </nav>

      <section className="dashboard-main">
        <section className="card account-shell">
          <div className="account-heading">
            <h1>Account</h1>
            <p className="muted">Manage your profile and password.</p>
          </div>

          <div className="account-grid">
            <form className="stack account-card" onSubmit={updateProfile}>
              <h2>Profile</h2>
              <label>
                Email
                <input value={user.email} disabled />
              </label>
              <label>
                Name
                <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={80} />
              </label>
              {profileError && <p className="error-banner">{profileError}</p>}
              {profileSuccess && <p className="info-banner">{profileSuccess}</p>}
              <button type="submit" className="primary-btn account-action-btn" disabled={isSavingProfile}>
                {isSavingProfile ? "Saving..." : "Save Profile"}
              </button>
            </form>

            <form className="stack account-card" onSubmit={updatePassword}>
              <h2>Password</h2>
              <label>
                Current Password (Optional)
                <input
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </label>
              <label>
                New Password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  minLength={8}
                />
              </label>
              <label>
                Confirm New Password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmNewPassword}
                  onChange={(event) => setConfirmNewPassword(event.target.value)}
                  required
                  minLength={8}
                />
              </label>
              {passwordError && <p className="error-banner">{passwordError}</p>}
              {passwordSuccess && <p className="info-banner">{passwordSuccess}</p>}
              <p className="muted">Provide current password to verify before changing, or leave it blank.</p>
              <button type="submit" className="primary-btn account-action-btn" disabled={isSavingPassword}>
                {isSavingPassword ? "Updating..." : "Change Password"}
              </button>
            </form>
          </div>
        </section>
      </section>
    </main>
  );
}
