import { jwtVerify, SignJWT } from "jose";

export const AUTH_COOKIE = "Rivalboard_auth";

interface AuthPayload {
  sub: string;
  email: string;
  name: string;
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET ?? "local-dev-auth-secret-change-me";
  return new TextEncoder().encode(secret);
}

export async function signAuthToken(payload: AuthPayload): Promise<string> {
  return new SignJWT({
    email: payload.email,
    name: payload.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getJwtSecret());
}

export async function verifyAuthToken(token: string): Promise<AuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (!payload.sub || typeof payload.email !== "string" || typeof payload.name !== "string") {
      return null;
    }

    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
    };
  } catch {
    return null;
  }
}
