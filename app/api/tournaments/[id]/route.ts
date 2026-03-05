import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestUser, unauthorizedJson } from "@/lib/auth-server";
import * as tournamentsService from "@/lib/tournaments-service";

const patchSchema = z.object({
  isPublic: z.boolean(),
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request);
  if (!user) return unauthorizedJson();

  try {
    const { id } = await context.params;
    const snapshot = await tournamentsService.getTournamentSnapshotForUser(user.id, id);
    return NextResponse.json(snapshot);
  } catch (error) {
    const serviceError = tournamentsService.asServiceError(error);
    return NextResponse.json({ error: serviceError.message }, { status: serviceError.status });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request);
  if (!user) return unauthorizedJson();

  try {
    const { id } = await context.params;
    const parsed = patchSchema.parse(await request.json());
    const snapshot = await tournamentsService.updateTournamentVisibilityForUser(user.id, id, parsed.isPublic);
    return NextResponse.json(snapshot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request body." }, { status: 422 });
    }

    const serviceError = tournamentsService.asServiceError(error);
    return NextResponse.json({ error: serviceError.message }, { status: serviceError.status });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(_request);
  if (!user) return unauthorizedJson();

  try {
    const { id } = await context.params;
    await tournamentsService.deleteTournamentForUser(user.id, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const serviceError = tournamentsService.asServiceError(error);
    return NextResponse.json({ error: serviceError.message }, { status: serviceError.status });
  }
}
