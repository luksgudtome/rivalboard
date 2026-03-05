import { NextResponse } from "next/server";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_VERIFIER_COOKIE,
  createCodeChallenge,
  createGoogleAuthUrl,
  createOAuthNonce,
  isGoogleOAuthConfigured,
} from "@/lib/google-oauth";

function getCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  };
}

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const signinUrl = new URL("/signin", origin);

  if (!isGoogleOAuthConfigured()) {
    signinUrl.searchParams.set("error", "google_not_configured");
    return NextResponse.redirect(signinUrl);
  }

  try {
    const state = createOAuthNonce();
    const codeVerifier = createOAuthNonce();
    const codeChallenge = createCodeChallenge(codeVerifier);
    const authUrl = createGoogleAuthUrl({ origin, state, codeChallenge });

    const response = NextResponse.redirect(authUrl);
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, getCookieOptions());
    response.cookies.set(GOOGLE_OAUTH_VERIFIER_COOKIE, codeVerifier, getCookieOptions());
    return response;
  } catch {
    signinUrl.searchParams.set("error", "google_start_failed");
    return NextResponse.redirect(signinUrl);
  }
}
