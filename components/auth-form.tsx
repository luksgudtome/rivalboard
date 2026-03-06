"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

interface AuthFormProps {
  mode: "signin" | "signup";
  googleEnabled: boolean;
}

async function apiFetch(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }
}

function getGoogleErrorMessage(errorCode: string | null): string | null {
  switch (errorCode) {
    case "google_not_configured":
      return "Google sign-in is not configured yet.";
    case "google_state_invalid":
      return "Google sign-in failed. Please try again.";
    case "google_start_failed":
    case "google_callback_failed":
      return "Google sign-in could not be completed. Please try again.";
    default:
      return null;
  }
}

export default function AuthForm({ mode, googleEnabled }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const oauthError = getGoogleErrorMessage(searchParams.get("error"));

  const isSignUp = mode === "signup";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (isSignUp) {
        await apiFetch("/api/auth/signup", { name, email, password });
      } else {
        await apiFetch("/api/auth/signin", { email, password });
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-wrap"> 

      <section className="auth-shell">
        <section className="auth-card">
          <h1>{isSignUp ? "Create Account" : "Sign In"}</h1>
          <p className="subtitle">
            {isSignUp ? "Create your account to manage tournaments." : "Sign in to access your dashboard."}
          </p>

          {(error || oauthError) && <p className="error-banner">{error ?? oauthError}</p>}

          <form className="stack" onSubmit={onSubmit} suppressHydrationWarning>
            {isSignUp && (
              <label>
                Name
                <input suppressHydrationWarning value={name} onChange={(event) => setName(event.target.value)} required />
              </label>
            )}

            <label>
              Email
              <input
                suppressHydrationWarning
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </label>

            <label>
              Password
              <input
                suppressHydrationWarning
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
                autoComplete={isSignUp ? "new-password" : "current-password"}
              />
            </label>

            <button type="submit" className="primary-btn" disabled={isSubmitting}>
              {isSubmitting ? "Please wait..." : isSignUp ? "Create Account" : "Sign In"}
            </button>
          </form>

          {googleEnabled && (
            <>
              <div className="oauth-divider" role="separator" aria-label="Alternative sign in">
                <span>or</span>
              </div>
              <a href="/api/auth/google/start" className="as-link google-btn">
                <span className="google-mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24" className="google-mark-icon" focusable="false">
                    <path d="M21.35 11.1H12v2.9h5.35c-.5 2.5-2.65 4.1-5.35 4.1-3.25 0-5.9-2.65-5.9-5.9s2.65-5.9 5.9-5.9c1.45 0 2.8.5 3.85 1.5l2.2-2.2C16.4 4 14.3 3.2 12 3.2 7.15 3.2 3.2 7.15 3.2 12S7.15 20.8 12 20.8c4.5 0 8.4-3.3 8.4-8.8 0-.6-.05-1.2-.15-1.9Z" />
                  </svg>
                </span>
                Continue with Google
              </a>
            </>
          )}

          <p className="auth-switch">
            {isSignUp ? "Already have an account?" : "No account yet?"}{" "}
            <Link href={isSignUp ? "/signin" : "/signup"}>{isSignUp ? "Sign In" : "Sign Up"}</Link>
          </p>

          <p className="auth-legal-links">
            By continuing, you agree to our <Link href="/terms">Terms of Service</Link> and{" "}
            <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </section>
      </section>
    </main>
  );
}
