import { createHash, randomBytes } from "node:crypto";

export const GOOGLE_OAUTH_STATE_COOKIE = "Rivalboard_google_oauth_state";
export const GOOGLE_OAUTH_VERIFIER_COOKIE = "Rivalboard_google_oauth_verifier";

const GOOGLE_SCOPE = "openid email profile";

interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
}

interface GoogleTokenResponse {
  access_token?: string;
}

interface GoogleUserInfo {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

function getGoogleOAuthConfig(): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  }

  return { clientId, clientSecret };
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function createOAuthNonce(): string {
  return randomBytes(32).toString("base64url");
}

export function createCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

export function createGoogleAuthUrl(params: {
  origin: string;
  state: string;
  codeChallenge: string;
}): string {
  const { clientId } = getGoogleOAuthConfig();
  const redirectUri = `${params.origin}/api/auth/google/callback`;
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GOOGLE_SCOPE);
  authUrl.searchParams.set("state", params.state);
  authUrl.searchParams.set("code_challenge", params.codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("prompt", "select_account");
  return authUrl.toString();
}

export async function exchangeGoogleCodeForAccessToken(params: {
  code: string;
  codeVerifier: string;
  origin: string;
}): Promise<string> {
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  const redirectUri = `${params.origin}/api/auth/google/callback`;

  const body = new URLSearchParams({
    code: params.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: params.codeVerifier,
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error("Google token exchange failed.");
  }

  const payload = (await response.json()) as GoogleTokenResponse;
  if (!payload.access_token) {
    throw new Error("Google did not return an access token.");
  }

  return payload.access_token;
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<{
  subject: string;
  email: string;
  name: string;
}> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Google user profile.");
  }

  const payload = (await response.json()) as GoogleUserInfo;
  if (
    !payload.sub ||
    !payload.email ||
    typeof payload.email !== "string" ||
    !payload.email_verified
  ) {
    throw new Error("Google account must have a verified email.");
  }

  const name =
    payload.name && payload.name.trim().length > 0
      ? payload.name.trim()
      : payload.email.split("@")[0];

  return {
    subject: payload.sub,
    email: payload.email.toLowerCase(),
    name,
  };
}
