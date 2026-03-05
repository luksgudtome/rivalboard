import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AUTH_COOKIE, signAuthToken } from "@/lib/auth-token";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_VERIFIER_COOKIE,
  exchangeGoogleCodeForAccessToken,
  fetchGoogleUserInfo,
} from "@/lib/google-oauth";

function getAuthCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}

function getOAuthCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const signinUrl = new URL("/signin", origin);
  const dashboardUrl = new URL("/dashboard", origin);
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  const codeVerifier = request.cookies.get(GOOGLE_OAUTH_VERIFIER_COOKIE)?.value;

  if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
    signinUrl.searchParams.set("error", "google_state_invalid");
    const response = NextResponse.redirect(signinUrl);
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", getOAuthCookieOptions());
    response.cookies.set(GOOGLE_OAUTH_VERIFIER_COOKIE, "", getOAuthCookieOptions());
    return response;
  }

  try {
    const accessToken = await exchangeGoogleCodeForAccessToken({
      code,
      codeVerifier,
      origin,
    });

    const googleProfile = await fetchGoogleUserInfo(accessToken);

    let user = await prisma.user.findUnique({
      where: { email: googleProfile.email },
    });

    if (!user) {
      const passwordHash = await bcrypt.hash(randomUUID(), 10);
      user = await prisma.user.create({
        data: {
          name: googleProfile.name,
          email: googleProfile.email,
          passwordHash,
        },
      });
    }

    const token = await signAuthToken({
      sub: user.id,
      email: user.email,
      name: user.name,
    });

    const response = NextResponse.redirect(dashboardUrl);
    response.cookies.set(AUTH_COOKIE, token, getAuthCookieOptions());
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", getOAuthCookieOptions());
    response.cookies.set(GOOGLE_OAUTH_VERIFIER_COOKIE, "", getOAuthCookieOptions());
    return response;
  } catch {
    signinUrl.searchParams.set("error", "google_callback_failed");
    const response = NextResponse.redirect(signinUrl);
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", getOAuthCookieOptions());
    response.cookies.set(GOOGLE_OAUTH_VERIFIER_COOKIE, "", getOAuthCookieOptions());
    return response;
  }
}
