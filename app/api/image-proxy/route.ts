import { NextResponse } from "next/server";
import { getRequestUser, unauthorizedJson } from "@/lib/auth-server";

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return unauthorizedJson();

  const { searchParams } = new URL(request.url);
  const target = searchParams.get("url") ?? "";
  if (!isHttpUrl(target)) {
    return NextResponse.json({ error: "Invalid image URL." }, { status: 422 });
  }

  try {
    const parsed = new URL(target);
    const response = await fetch(parsed.toString(), {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: parsed.origin,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Failed to load image (${response.status}).` }, { status: 502 });
    }

    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return NextResponse.json({ error: "URL did not return an image." }, { status: 422 });
    }

    const bytes = await response.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch image." }, { status: 502 });
  }
}

