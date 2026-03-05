import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { AUTH_COOKIE, verifyAuthToken } from "@/lib/auth-token";
import { prisma } from "@/lib/prisma";

export async function getRequestUser(request: Request): Promise<User | null> {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_COOKIE}=`))
    ?.slice(`${AUTH_COOKIE}=`.length);

  if (!token) return null;

  const payload = await verifyAuthToken(token);
  if (!payload) return null;

  return prisma.user.findUnique({ where: { id: payload.sub } });
}

export async function requireRequestUser(request: Request): Promise<User> {
  const user = await getRequestUser(request);
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

export async function getPageUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifyAuthToken(token);
  if (!payload) return null;

  return prisma.user.findUnique({ where: { id: payload.sub } });
}

export async function requirePageUser(): Promise<User> {
  const user = await getPageUser();
  if (!user) redirect("/signin");
  return user;
}

export function unauthorizedJson() {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}
