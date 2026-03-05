import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRequestUser } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).optional(),
    newPassword: z.string().min(8, "New password must be at least 8 characters.").max(100),
    confirmNewPassword: z.string().min(1, "Please confirm the new password."),
  })
  .refine((values) => values.newPassword === values.confirmNewPassword, {
    message: "New password and confirmation do not match.",
    path: ["confirmNewPassword"],
  });

export async function PATCH(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const parsed = changePasswordSchema.parse(await request.json());

    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, passwordHash: true },
    });

    if (!userRecord) {
      return NextResponse.json({ error: "User account was not found." }, { status: 404 });
    }

    if (parsed.currentPassword) {
      const hasValidCurrentPassword = await bcrypt.compare(parsed.currentPassword, userRecord.passwordHash);
      if (!hasValidCurrentPassword) {
        return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
      }
    }

    const passwordHash = await bcrypt.hash(parsed.newPassword, 10);

    await prisma.user.update({
      where: { id: userRecord.id },
      data: { passwordHash },
    });

    return NextResponse.json({ ok: true });
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
