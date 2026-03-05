import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestUser, unauthorizedJson } from "@/lib/auth-server";
import { asServiceError, updateTournamentMatchForUser } from "@/lib/tournaments-service";

const bodySchema = z.object({
  score1: z.number().optional(),
  score2: z.number().optional(),
  bestOf: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(7)]).optional(),
  games: z
    .array(
      z.object({
        number: z.number().int().min(1),
        score1: z.number().nonnegative().nullable().optional(),
        score2: z.number().nonnegative().nullable().optional(),
        youtubeUrl: z
          .string()
          .trim()
          .url("YouTube URL must be a valid URL.")
          .nullable()
          .optional(),
      }),
    )
    .optional(),
  youtubeUrl: z
    .string()
    .trim()
    .url("YouTube URL must be a valid URL.")
    .nullable()
    .optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; matchId: string }> },
) {
  const user = await getRequestUser(request);
  if (!user) return unauthorizedJson();

  try {
    const { id, matchId } = await context.params;
    const parsed = bodySchema.parse(await request.json());

    const snapshot = await updateTournamentMatchForUser(
      user.id,
      id,
      Number(matchId),
      parsed.bestOf,
      parsed.games,
      parsed.score1,
      parsed.score2,
      parsed.youtubeUrl,
    );

    return NextResponse.json(snapshot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request body." }, { status: 422 });
    }

    const serviceError = asServiceError(error);
    return NextResponse.json({ error: serviceError.message }, { status: serviceError.status });
  }
}
