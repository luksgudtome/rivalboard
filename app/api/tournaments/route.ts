import { NextResponse } from "next/server";
import { z } from "zod";
import { FREE_TOURNAMENT_LIMIT, isBillingEnabled } from "@/lib/billing";
import { getRequestUser, unauthorizedJson } from "@/lib/auth-server";
import { asServiceError, countTournamentsForUser, createTournamentForUser, listTournamentsForUser } from "@/lib/tournaments-service";

const playerSchema = z.object({
  name: z.string().optional().default(""),
  socialUrl: z.string().trim().url("Player social link must be a valid URL.").nullable().optional(),
  jerseyNumber: z.string().trim().max(20, "Player jersey number is too long.").nullable().optional(),
});

const participantSchema = z.union([
  z.string(),
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("individual"),
      name: z.string().optional().default(""),
      socialUrl: z.string().trim().url("Individual social link must be a valid URL.").nullable().optional(),
      jerseyNumber: z.string().trim().max(20, "Individual jersey number is too long.").nullable().optional(),
      profilePhotoUrl: z.string().trim().url("Profile photo URL must be a valid URL.").nullable().optional(),
    }),
    z.object({
      type: z.literal("team"),
      name: z.string().optional().default(""),
      logoUrl: z.string().trim().url("Team logo URL must be a valid URL.").nullable().optional(),
      players: z.array(playerSchema).optional().default([]),
    }),
  ]),
]);

const createSchema = z.object({
  name: z.string().optional().default(""),
  gameType: z
    .enum(["esports", "basketball", "football", "volleyball", "badminton", "tennis", "chess", "other"])
    .optional(),
  format: z.enum(["rr_se", "rr_de", "se", "de"]).optional(),
  type: z.string().optional(),
  participants: z.array(participantSchema),
  shuffle: z.boolean().optional().default(false),
  defaultBestOf: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(7)]).optional().default(1),
});

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return unauthorizedJson();

  try {
    const tournaments = await listTournamentsForUser(user.id);
    return NextResponse.json({ tournaments });
  } catch (error) {
    const serviceError = asServiceError(error);
    return NextResponse.json({ error: serviceError.message }, { status: serviceError.status });
  }
}

export async function POST(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return unauthorizedJson();

  try {
    const plan = user.plan ?? "free";
    if (isBillingEnabled() && plan === "free") {
      const existingTournamentCount = await countTournamentsForUser(user.id);
      if (existingTournamentCount >= FREE_TOURNAMENT_LIMIT) {
        return NextResponse.json(
          { error: "Free plan supports 1 tournament. Upgrade to Pro for unlimited tournaments." },
          { status: 403 },
        );
      }
    }

    const parsed = createSchema.parse(await request.json());
    const snapshot = await createTournamentForUser(user.id, parsed);
    return NextResponse.json(snapshot, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request body." }, { status: 422 });
    }

    const serviceError = asServiceError(error);
    return NextResponse.json({ error: serviceError.message }, { status: serviceError.status });
  }
}
