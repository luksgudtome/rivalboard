import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRequestUser } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export async function PATCH(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const parsed = updateProfileSchema.parse(await request.json());

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { name: parsed.name },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request body." }, { status: 422 });
    }

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error." },
      { status: 500 },
    );
  }
}
