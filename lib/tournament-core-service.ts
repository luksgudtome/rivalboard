import { StageType, TournamentFormat, TournamentGameType, type Tournament } from "@prisma/client";
import { BracketsManager } from "brackets-manager";
import { InMemoryDatabase } from "brackets-memory-db";
import type { Match, MatchGame } from "brackets-model";
import { prisma } from "@/lib/prisma";

export interface ViewerData {
  participant: any[];
  stage: any[];
  group: any[];
  round: any[];
  match: any[];
  match_game: any[];
}

export interface TournamentSummary {
  id: string;
  name: string;
  description: string;
  gameType: TournamentGameType;
  format: TournamentFormat;
  type: StageType;
  updatedAt: string;
  totalMatches: number;
  completedMatches: number;
}

export interface TournamentStageSummary {
  id: number;
  tournamentId: number;
  number: number;
  name: string;
  type: StageType;
  groupCount: number;
  roundCount: number;
  matchCount: number;
  completedMatches: number;
}

export interface TournamentSnapshot {
  tournament: {
    id: string;
    name: string;
    managerName?: string;
    description: string;
    gameType: TournamentGameType;
    format: TournamentFormat;
    type: StageType;
    isPublic: boolean;
    stageId: number;
    stageIds: number[];
    stages: TournamentStageSummary[];
    pendingSeedSelection?: PendingSeedSelection | null;
    updatedAt: string;
  };
  stats: {
    totalMatches: number;
    completedMatches: number;
    editableMatches: number;
  };
  data: ViewerData;
}

export interface PendingSeedSelection {
  stage1Id: number;
  stage2Type: Exclude<StageType, "round_robin">;
  qualifierCount: number;
  seededParticipantIds?: number[];
  stage2Id?: number;
  status: "pending_seed_confirmation" | "stage2_created";
}

export interface SeedCandidate {
  id: number;
  name: string;
  rank: number;
  points: number;
  groupId?: number;
}

export class ServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type BestOf = 1 | 3 | 5 | 7;
type StageSeedSource = "all_participants" | "participant_ids";
type TournamentFormatInput = "rr_se" | "rr_de" | "se" | "de";
type MatchGameUpdateInput = {
  number: number;
  score1?: number | null;
  score2?: number | null;
  youtubeUrl?: string | null;
};
type AddStageInput = {
  name?: string;
  type: string;
  seedSource?: StageSeedSource;
  participantIds?: number[];
  shuffle?: boolean;
  defaultBestOf?: BestOf;
  roundRobinGroupCount?: number;
};
type ConfirmSeedsInput = {
  participantIds: number[];
};
type TournamentMeta = {
  description: string;
  gameType: TournamentGameType;
  format: TournamentFormat;
  pendingSeedSelection?: PendingSeedSelection | null;
};
type TournamentStoredPayload = {
  viewerData: ViewerData;
  meta: TournamentMeta;
};

type ParticipantPlayerInput = {
  name: string;
  socialUrl?: string | null;
  jerseyNumber?: string | null;
};

type ParticipantInput =
  | string
  | {
      type: "team";
      name: string;
      logoUrl?: string | null;
      players?: ParticipantPlayerInput[];
    }
  | {
      type: "individual";
      name: string;
      socialUrl?: string | null;
      jerseyNumber?: string | null;
      profilePhotoUrl?: string | null;
    };

function normalizeOptionalString(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeParticipants(participants: ParticipantInput[]): Array<Record<string, unknown> | string> {
  const seen = new Set<string>();
  const normalized = participants
    .map((value) => {
      if (typeof value === "string") return value.trim();

      if (value.type === "individual") {
        return {
          name: value.name.trim(),
          participantType: "individual",
          socialUrl: normalizeOptionalString(value.socialUrl),
          jerseyNumber: normalizeOptionalString(value.jerseyNumber),
          profilePhotoUrl: normalizeOptionalString(value.profilePhotoUrl),
        };
      }

      const players = (value.players ?? [])
        .map((player) => ({
          name: player.name.trim(),
          socialUrl: normalizeOptionalString(player.socialUrl),
          jerseyNumber: normalizeOptionalString(player.jerseyNumber),
        }))
        .filter((player) => player.name.length > 0);

      return {
        name: value.name.trim(),
        participantType: "team",
        logoUrl: normalizeOptionalString(value.logoUrl),
        players,
      };
    })
    .filter((value) => {
      const name = typeof value === "string" ? value : value.name;
      if (!name) return false;
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (normalized.length < 2) {
    throw new ServiceError("At least 2 unique participants are required.", 422);
  }

  return normalized;
}

function shuffle<T>(list: T[]): T[] {
  const clone = [...list];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

function bestOfToChildCount(bestOf: BestOf): number {
  return bestOf === 1 ? 0 : bestOf;
}

function childCountToBestOf(childCount?: number): BestOf {
  if (childCount === 3 || childCount === 5 || childCount === 7) return childCount;
  return 1;
}

function toOptionalScore(value: number | null | undefined): number | undefined {
  return value === null || value === undefined ? undefined : value;
}

function ensurePairedScores(
  score1: number | undefined,
  score2: number | undefined,
  label: string,
): void {
  const isScore1Defined = score1 !== undefined;
  const isScore2Defined = score2 !== undefined;
  if (isScore1Defined !== isScore2Defined) {
    throw new ServiceError(`${label} requires both scores, or neither score.`, 422);
  }
}

function getResultsFromScores(
  score1: number | undefined,
  score2: number | undefined,
  allowDraw: boolean,
): { result1: "win" | "loss" | "draw" | undefined; result2: "win" | "loss" | "draw" | undefined } {
  if (score1 === undefined || score2 === undefined) {
    return { result1: undefined, result2: undefined };
  }

  if (score1 === score2) {
    if (!allowDraw) {
      throw new ServiceError("Draws are not allowed in elimination rounds.", 422);
    }
    return { result1: "draw", result2: "draw" };
  }

  return score1 > score2
    ? { result1: "win", result2: "loss" }
    : { result1: "loss", result2: "win" };
}

function nextPowerOfTwo(value: number): number {
  let result = 2;
  while (result < value) result *= 2;
  return result;
}

function autoRoundRobinGroupCount(participantCount: number): number {
  if (participantCount <= 7) return 1;

  const targetGroupSize = 5;
  let groupCount = Math.max(1, Math.round(participantCount / targetGroupSize));
  groupCount = Math.min(groupCount, participantCount);

  // Avoid creating very small groups where matches become too sparse.
  while (groupCount > 1 && Math.floor(participantCount / groupCount) < 3) {
    groupCount -= 1;
  }

  return groupCount;
}

function isEditableMatch(match: any): boolean {
  const isLocked = match.status === 0 || match.status === 1 || match.status === 5;
  const hasBothParticipants =
    match.opponent1?.id !== null &&
    match.opponent1?.id !== undefined &&
    match.opponent2?.id !== null &&
    match.opponent2?.id !== undefined;
  return !isLocked && hasBothParticipants;
}

function getStats(data: ViewerData) {
  const totalMatches = data.match.length;
  const completedMatches = data.match.filter((match) => match.status === 4 || match.status === 5).length;
  const editableMatches = data.match.filter((match) => isEditableMatch(match)).length;
  return { totalMatches, completedMatches, editableMatches };
}

function asStageSummaries(data: ViewerData): TournamentStageSummary[] {
  return data.stage
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((stage) => {
      const groupCount = data.group.filter((group) => group.stage_id === stage.id).length;
      const roundCount = data.round.filter((round) => round.stage_id === stage.id).length;
      const stageMatches = data.match.filter((match) => match.stage_id === stage.id);
      const completedMatches = stageMatches.filter((match) => match.status === 4 || match.status === 5).length;

      return {
        id: stage.id,
        tournamentId: stage.tournament_id,
        number: stage.number,
        name: stage.name,
        type: stage.type,
        groupCount,
        roundCount,
        matchCount: stageMatches.length,
        completedMatches,
      };
    });
}

function getCurrentStageId(tournament: Tournament, data: ViewerData): number {
  const stageIds = data.stage.map((stage) => stage.id);
  if (stageIds.includes(tournament.stageId)) return tournament.stageId;
  if (stageIds.length === 0) return tournament.stageId;
  return Math.max(...stageIds);
}

function stageSettingsFromInput(
  type: StageType,
  participantCount: number,
  defaultMatchChildCount: number,
  roundRobinGroupCount?: number,
) {
  if (type === StageType.round_robin) {
    const autoGroupCount = autoRoundRobinGroupCount(participantCount);
    const groupCount = roundRobinGroupCount && roundRobinGroupCount > 0 ? roundRobinGroupCount : autoGroupCount;
    return {
      groupCount: Math.min(groupCount, Math.max(1, participantCount)),
      matchesChildCount: defaultMatchChildCount,
      seedOrdering: ["groups.seed_optimized"],
    };
  }

  const settings: Record<string, unknown> = {
    size: nextPowerOfTwo(participantCount),
    matchesChildCount: defaultMatchChildCount,
  };

  if (type === StageType.double_elimination) {
    settings.grandFinal = "double";
  }

  return settings;
}

function resolveSeedingIds(
  data: ViewerData,
  seedSource: StageSeedSource | undefined,
  participantIds: number[] | undefined,
  shouldShuffle: boolean,
): number[] {
  let resolved: number[];

  if (seedSource === "participant_ids") {
    const requested = participantIds ?? [];
    const unique = Array.from(new Set(requested));
    if (unique.length < 2) {
      throw new ServiceError("At least 2 participant IDs are required.", 422);
    }

    const available = new Set(data.participant.map((participant) => participant.id));
    const missing = unique.filter((id) => !available.has(id));
    if (missing.length > 0) {
      throw new ServiceError(`Unknown participant IDs: ${missing.join(", ")}.`, 422);
    }

    resolved = unique;
  } else {
    resolved = data.participant.map((participant) => participant.id);
    if (resolved.length < 2) {
      throw new ServiceError("At least 2 participants are required to create a stage.", 422);
    }
  }

  return shouldShuffle ? shuffle(resolved) : resolved;
}

function defaultMeta(tournament: Pick<Tournament, "description" | "gameType" | "format">): TournamentMeta {
  return {
    description: tournament.description ?? "",
    gameType: tournament.gameType ?? TournamentGameType.esports,
    format: tournament.format ?? TournamentFormat.se,
    pendingSeedSelection: null,
  };
}

function asStoredPayload(raw: unknown, fallback: Pick<Tournament, "description" | "gameType" | "format">): TournamentStoredPayload {
  const maybeEnvelope = raw as { viewerData?: ViewerData; meta?: Partial<TournamentMeta> };
  if (maybeEnvelope && maybeEnvelope.viewerData) {
    const data = maybeEnvelope.viewerData;
    if (!Array.isArray(data.match) || !Array.isArray(data.stage) || !Array.isArray(data.participant)) {
      throw new ServiceError("Tournament data is corrupted.", 500);
    }

    return {
      viewerData: data,
      meta: {
        ...defaultMeta(fallback),
        ...maybeEnvelope.meta,
      },
    };
  }

  const data = raw as ViewerData;
  if (!data || !Array.isArray(data.match) || !Array.isArray(data.stage) || !Array.isArray(data.participant)) {
    throw new ServiceError("Tournament data is corrupted.", 500);
  }

  return {
    viewerData: data,
    meta: defaultMeta(fallback),
  };
}

function toStoredPayload(viewerData: ViewerData, meta: TournamentMeta): TournamentStoredPayload {
  return { viewerData, meta };
}

function formatFromInput(input: string | undefined): TournamentFormat {
  if (!input) return TournamentFormat.se;
  if (input === TournamentFormat.rr_se) return TournamentFormat.rr_se;
  if (input === TournamentFormat.rr_de) return TournamentFormat.rr_de;
  if (input === TournamentFormat.se) return TournamentFormat.se;
  if (input === TournamentFormat.de) return TournamentFormat.de;
  throw new ServiceError("Invalid tournament format.", 422);
}

function gameTypeFromInput(input: string | undefined): TournamentGameType {
  if (!input) return TournamentGameType.esports;
  const values = Object.values(TournamentGameType) as string[];
  if (!values.includes(input)) {
    throw new ServiceError("Invalid game type.", 422);
  }
  return input as TournamentGameType;
}

function stagePlanFromFormat(format: TournamentFormat): {
  stage1Type: StageType;
  stage2Type: Exclude<StageType, "round_robin"> | null;
} {
  if (format === TournamentFormat.se) {
    return { stage1Type: StageType.single_elimination, stage2Type: null };
  }
  if (format === TournamentFormat.de) {
    return { stage1Type: StageType.double_elimination, stage2Type: null };
  }
  if (format === TournamentFormat.rr_se) {
    return { stage1Type: StageType.round_robin, stage2Type: StageType.single_elimination };
  }
  return { stage1Type: StageType.round_robin, stage2Type: StageType.double_elimination };
}

function legacyTypeToFormat(type: string | undefined): TournamentFormat {
  if (!type) return TournamentFormat.se;
  if (type === StageType.single_elimination) return TournamentFormat.se;
  if (type === StageType.double_elimination) return TournamentFormat.de;
  if (type === StageType.round_robin) return TournamentFormat.rr_se;
  throw new ServiceError("Invalid tournament format.", 422);
}

function highestPowerOfTwoAtMost(value: number): number {
  let result = 1;
  while (result * 2 <= value) result *= 2;
  return result;
}

function defaultQualifierCount(participantCount: number): number {
  if (participantCount <= 4) return 2;
  const target = Math.max(2, Math.floor(participantCount / 2));
  return highestPowerOfTwoAtMost(target);
}

function asViewerData(tournament: Pick<Tournament, "data" | "description" | "gameType" | "format">): ViewerData {
  return asStoredPayload(tournament.data, tournament).viewerData;
}

function getMeta(tournament: Pick<Tournament, "data" | "description" | "gameType" | "format">): TournamentMeta {
  return asStoredPayload(tournament.data, tournament).meta;
}

function isUnknownIsPublicArgument(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Unknown argument `isPublic`");
}

function asSnapshot(tournamentRecord: Tournament & { user?: { name: string } | null }): TournamentSnapshot {
  const data = asViewerData(tournamentRecord);
  const meta = getMeta(tournamentRecord);
  const stats = getStats(data);
  const stages = asStageSummaries(data);
  const stageId = getCurrentStageId(tournamentRecord, data);
  const tournament = {
    id: tournamentRecord.id,
    name: tournamentRecord.name,
    managerName: tournamentRecord.user?.name ?? undefined,
    description: meta.description,
    gameType: meta.gameType,
    format: meta.format,
    type: tournamentRecord.type,
    isPublic: Boolean((tournamentRecord as any).isPublic),
    stageId,
    stageIds: stages.map((stage) => stage.id),
    stages,
    pendingSeedSelection: meta.pendingSeedSelection ?? null,
    updatedAt: tournamentRecord.updatedAt.toISOString(),
  };

  return {
    tournament,
    stats,
    data,
  };
}

function asSummary(tournament: Tournament): TournamentSummary {
  const data = asViewerData(tournament);
  const meta = getMeta(tournament);
  const stats = getStats(data);
  return {
    id: tournament.id,
    name: tournament.name,
    description: meta.description,
    gameType: meta.gameType,
    format: meta.format,
    type: tournament.type,
    updatedAt: tournament.updatedAt.toISOString(),
    totalMatches: stats.totalMatches,
    completedMatches: stats.completedMatches,
  };
}

function stageTypeFromInput(input: string): StageType {
  if (input === "single_elimination") return StageType.single_elimination;
  if (input === "double_elimination") return StageType.double_elimination;
  if (input === "round_robin") return StageType.round_robin;
  throw new ServiceError("Invalid tournament stage type.", 422);
}

async function getOwnedTournament(userId: string, tournamentId: string): Promise<Tournament> {
  const tournament = await prisma.tournament.findFirst({
    where: { id: tournamentId, userId },
  });

  if (!tournament) throw new ServiceError("Tournament not found.", 404);
  return tournament;
}

export async function listTournamentsForUser(userId: string): Promise<TournamentSummary[]> {
  const tournaments = await prisma.tournament.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });

  return tournaments.map(asSummary);
}

export async function countTournamentsForUser(userId: string): Promise<number> {
  return prisma.tournament.count({ where: { userId } });
}

export async function createTournamentForUser(
  userId: string,
  input: {
    name: string;
    description?: string;
    gameType?: string;
    format?: TournamentFormatInput;
    type?: string;
    participants: ParticipantInput[];
    shuffle: boolean;
    defaultBestOf?: BestOf;
  },
): Promise<TournamentSnapshot> {
  const format = input.format ? formatFromInput(input.format) : legacyTypeToFormat(input.type);
  const gameType = gameTypeFromInput(input.gameType);
  const description = input.description?.trim() ?? "";
  const { stage1Type, stage2Type } = stagePlanFromFormat(format);
  const normalizedParticipants = normalizeParticipants(input.participants);
  const seeding = input.shuffle ? shuffle(normalizedParticipants) : normalizedParticipants;
  const defaultMatchChildCount = bestOfToChildCount(input.defaultBestOf ?? 1);

  const storage = new InMemoryDatabase();
  const manager = new BracketsManager(storage);

  const stageInput: any = {
    tournamentId: 1,
    name: input.name.trim() || "Untitled Tournament",
    type: stage1Type,
    seeding,
    settings: stageSettingsFromInput(stage1Type, seeding.length, defaultMatchChildCount),
  };

  await manager.create.stage(stageInput);
  const viewerData = (await manager.export()) as ViewerData;
  const createdStage = viewerData.stage[viewerData.stage.length - 1];
  const meta: TournamentMeta = {
    description,
    gameType,
    format,
    pendingSeedSelection: stage2Type
      ? {
          stage1Id: createdStage.id,
          stage2Type,
          qualifierCount: defaultQualifierCount(seeding.length),
          status: "pending_seed_confirmation",
        }
      : null,
  };
  const storedPayload = toStoredPayload(viewerData, meta);

  const tournament = await prisma.tournament.create({
    data: {
      userId,
      name: stageInput.name,
      description,
      gameType,
      format,
      type: stage1Type,
      stageId: createdStage.id,
      data: storedPayload as any,
    },
  });

  return asSnapshot(tournament);
}

async function getPendingSeedCandidates(
  viewerData: ViewerData,
  pending: PendingSeedSelection | null | undefined,
): Promise<SeedCandidate[]> {
  if (!pending || pending.status !== "pending_seed_confirmation") return [];
  const stage = viewerData.stage.find((entry) => entry.id === pending.stage1Id);
  if (!stage || stage.type !== StageType.round_robin) return [];

  const groupCount = Math.max(1, viewerData.group.filter((group) => group.stage_id === pending.stage1Id).length);
  const maxQualifiedParticipantsPerGroup = Math.max(1, Math.ceil(pending.qualifierCount / groupCount));

  const storage = new InMemoryDatabase();
  const manager = new BracketsManager(storage);
  await manager.import(viewerData as any);

  try {
    const participantNameById = new Map(
      viewerData.participant.map((participant) => [participant.id as number, participant.name as string]),
    );
    const standings = (await manager.get.finalStandings(pending.stage1Id, {
      rankingFormula: (item: any) => 3 * item.wins + item.draws,
      maxQualifiedParticipantsPerGroup,
    })) as Array<{ id: number; rank: number; points: number; groupId?: number }>;

    return standings.slice(0, pending.qualifierCount).map((item) => ({
      id: item.id,
      name: participantNameById.get(item.id) ?? `ID ${item.id}`,
      rank: item.rank,
      points: item.points,
      groupId: item.groupId,
    }));
  } catch {
    return [];
  }
}

export async function getTournamentStagesForUser(
  userId: string,
  tournamentId: string,
): Promise<{
  currentStageId: number;
  stages: TournamentStageSummary[];
  pendingSeedSelection?: PendingSeedSelection | null;
  seedCandidates: SeedCandidate[];
}> {
  const tournament = await getOwnedTournament(userId, tournamentId);
  const data = asViewerData(tournament);
  const meta = getMeta(tournament);
  const stages = asStageSummaries(data);
  const seedCandidates = await getPendingSeedCandidates(data, meta.pendingSeedSelection);
  return {
    currentStageId: getCurrentStageId(tournament, data),
    stages,
    pendingSeedSelection: meta.pendingSeedSelection ?? null,
    seedCandidates,
  };
}

export async function confirmNextStageSeedsForUser(
  userId: string,
  tournamentId: string,
  input: ConfirmSeedsInput,
): Promise<TournamentSnapshot> {
  const tournament = await getOwnedTournament(userId, tournamentId);
  const payload = asStoredPayload(tournament.data, tournament);
  const pending = payload.meta.pendingSeedSelection;

  if (!pending || pending.status !== "pending_seed_confirmation") {
    throw new ServiceError("No pending stage seed confirmation.", 409);
  }

  const uniqueParticipantIds = Array.from(new Set(input.participantIds));
  if (uniqueParticipantIds.length < 2) {
    throw new ServiceError("At least 2 participants are required for the next stage.", 422);
  }

  const available = new Set(payload.viewerData.participant.map((participant) => participant.id));
  const missing = uniqueParticipantIds.filter((id) => !available.has(id));
  if (missing.length > 0) {
    throw new ServiceError(`Unknown participant IDs: ${missing.join(", ")}.`, 422);
  }

  const storage = new InMemoryDatabase();
  const manager = new BracketsManager(storage);
  await manager.import(payload.viewerData as any);

  const existingStageIds = new Set(payload.viewerData.stage.map((stage) => stage.id));
  const managerTournamentId = payload.viewerData.stage[0]?.tournament_id ?? 1;
  const stage1 = payload.viewerData.stage.find((stage) => stage.id === pending.stage1Id);
  const stageName = stage1 ? `${stage1.name} Finals` : "Final Stage";
  const stage2Type = pending.stage2Type;
  const stageInput: any = {
    tournamentId: managerTournamentId,
    name: stageName,
    type: stage2Type,
    seedingIds: uniqueParticipantIds,
    settings: stageSettingsFromInput(stage2Type, uniqueParticipantIds.length, 0),
  };

  await manager.create.stage(stageInput);
  const updatedViewerData = (await manager.export()) as ViewerData;
  const createdStage =
    updatedViewerData.stage.find((stage) => !existingStageIds.has(stage.id)) ??
    updatedViewerData.stage[updatedViewerData.stage.length - 1];

  const updatedMeta: TournamentMeta = {
    ...payload.meta,
    pendingSeedSelection: {
      ...pending,
      qualifierCount: uniqueParticipantIds.length,
      seededParticipantIds: uniqueParticipantIds,
      stage2Id: createdStage.id,
      status: "stage2_created",
    },
  };

  const updated = await prisma.tournament.update({
    where: { id: tournament.id },
    data: {
      type: stage2Type,
      stageId: createdStage.id,
      data: toStoredPayload(updatedViewerData, updatedMeta) as any,
    },
  });

  return asSnapshot(updated);
}

export async function addStageToTournamentForUser(
  userId: string,
  tournamentId: string,
  input: AddStageInput,
): Promise<TournamentSnapshot> {
  const tournament = await getOwnedTournament(userId, tournamentId);
  const data = asViewerData(tournament);
  const meta = getMeta(tournament);
  const type = stageTypeFromInput(input.type);
  const seedingIds = resolveSeedingIds(
    data,
    input.seedSource ?? "all_participants",
    input.participantIds,
    Boolean(input.shuffle),
  );
  const defaultMatchChildCount = bestOfToChildCount(input.defaultBestOf ?? 1);
  const existingStageIds = new Set(data.stage.map((stage) => stage.id));

  const storage = new InMemoryDatabase();
  const manager = new BracketsManager(storage);
  await manager.import(data as any);

  const managerTournamentId = data.stage[0]?.tournament_id ?? 1;
  const nextStageNumber = data.stage.length + 1;
  const stageInput: any = {
    tournamentId: managerTournamentId,
    name: input.name?.trim() || `Stage ${nextStageNumber}`,
    type,
    seedingIds,
    settings: stageSettingsFromInput(type, seedingIds.length, defaultMatchChildCount, input.roundRobinGroupCount),
  };

  await manager.create.stage(stageInput);
  const updatedData = (await manager.export()) as ViewerData;
  const createdStage =
    updatedData.stage.find((stage) => !existingStageIds.has(stage.id)) ??
    updatedData.stage[updatedData.stage.length - 1];

  const updated = await prisma.tournament.update({
    where: { id: tournament.id },
    data: {
      type,
      stageId: createdStage.id,
      data: toStoredPayload(updatedData, meta) as any,
    },
  });

  return asSnapshot(updated);
}

export async function getTournamentSnapshotForUser(userId: string, tournamentId: string): Promise<TournamentSnapshot> {
  const tournament = await getOwnedTournament(userId, tournamentId);
  return asSnapshot(tournament);
}

export async function getTournamentSnapshotPublic(tournamentId: string): Promise<TournamentSnapshot> {
  let tournament: (Tournament & { user?: { name: string } | null }) | null = null;

  try {
    tournament = await prisma.tournament.findFirst({
      where: { id: tournamentId, isPublic: true } as any,
      include: { user: { select: { name: true } } },
    });
  } catch (error) {
    if (!isUnknownIsPublicArgument(error)) throw error;
    tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { user: { select: { name: true } } },
    });
  }

  if (!tournament) throw new ServiceError("Tournament not found.", 404);
  return asSnapshot(tournament);
}

export async function updateTournamentVisibilityForUser(
  userId: string,
  tournamentId: string,
  isPublic: boolean,
): Promise<TournamentSnapshot> {
  const tournament = await getOwnedTournament(userId, tournamentId);
  let updated: Tournament = tournament;

  try {
    updated = await prisma.tournament.update({
      where: { id: tournament.id },
      data: {
        isPublic,
      } as any,
    });
  } catch (error) {
    if (!isUnknownIsPublicArgument(error)) throw error;
  }

  return asSnapshot(updated);
}

export async function deleteTournamentForUser(userId: string, tournamentId: string): Promise<void> {
  const tournament = await getOwnedTournament(userId, tournamentId);
  await prisma.tournament.delete({
    where: { id: tournament.id },
  });
}

export async function updateMatchForUser(
  userId: string,
  tournamentId: string,
  matchId: number,
  bestOf: BestOf | undefined,
  games: MatchGameUpdateInput[] | undefined,
  score1?: number,
  score2?: number,
  youtubeUrl?: string | null,
): Promise<TournamentSnapshot> {
  const tournament = await getOwnedTournament(userId, tournamentId);
  const data = asViewerData(tournament);
  const meta = getMeta(tournament);

  const storage = new InMemoryDatabase();
  const manager = new BracketsManager(storage);
  await manager.import(data as any);

  const match = data.match.find((entry) => entry.id === matchId);
  if (!match) throw new ServiceError("Match not found.", 404);
  if (!isEditableMatch(match)) throw new ServiceError("This match is read-only.", 409);
  const effectiveBestOf = bestOf ?? childCountToBestOf(match.child_count);
  const targetChildCount = bestOfToChildCount(effectiveBestOf);
  const hasLegacyScores = score1 !== undefined || score2 !== undefined;
  const isRoundRobin = tournament.type === StageType.round_robin;

  if (match.child_count !== targetChildCount) {
    await manager.update.matchChildCount("match", matchId, targetChildCount);
  }

  if (targetChildCount > 0 && games) {
    const currentData = (await manager.export()) as ViewerData;
    const gamesByNumber = new Map(
      currentData.match_game
        .filter((entry) => entry.parent_id === matchId)
        .map((entry) => [entry.number, entry]),
    );

    for (const gameInput of games) {
      if (gameInput.number < 1 || gameInput.number > targetChildCount) {
        throw new ServiceError(`Game ${gameInput.number} is out of range for this best-of format.`, 422);
      }

      const storedGame = gamesByNumber.get(gameInput.number);
      if (!storedGame) {
        throw new ServiceError(`Game ${gameInput.number} does not exist for this match.`, 422);
      }

      const gameScore1 = toOptionalScore(gameInput.score1);
      const gameScore2 = toOptionalScore(gameInput.score2);
      ensurePairedScores(gameScore1, gameScore2, `Game ${gameInput.number}`);

      const nextYoutubeUrl = gameInput.youtubeUrl ?? null;
      const scoreUnchanged =
        gameScore1 === (storedGame.opponent1?.score ?? undefined) &&
        gameScore2 === (storedGame.opponent2?.score ?? undefined);
      const metadataUnchanged = nextYoutubeUrl === (storedGame.youtubeUrl ?? null);
      if (scoreUnchanged && metadataUnchanged) {
        continue;
      }

      const { result1, result2 } = getResultsFromScores(gameScore1, gameScore2, isRoundRobin);

      await manager.update.matchGame<MatchGame & { youtubeUrl?: string | null }>({
        id: storedGame.id,
        opponent1: { score: gameScore1, result: result1 },
        opponent2: { score: gameScore2, result: result2 },
        youtubeUrl: nextYoutubeUrl,
      });
    }
  } else {
    if (games?.length) {
      const game1 = games.find((entry) => entry.number === 1);
      if (game1) {
        score1 = game1.score1 ?? undefined;
        score2 = game1.score2 ?? undefined;
        youtubeUrl = game1.youtubeUrl;
      }
    }

    if (hasLegacyScores || (score1 !== undefined || score2 !== undefined)) {
      if (
        score1 === undefined ||
        score2 === undefined ||
        !Number.isFinite(score1) ||
        !Number.isFinite(score2) ||
        score1 < 0 ||
        score2 < 0
      ) {
        throw new ServiceError("Scores must be non-negative numbers.", 422);
      }

      const { result1, result2 } = getResultsFromScores(score1, score2, isRoundRobin);

      await manager.update.match<Match & { youtubeUrl?: string | null }>({
        id: matchId,
        opponent1: { score: score1, result: result1 },
        opponent2: { score: score2, result: result2 },
        youtubeUrl,
      });
    } else if (games && games.length > 0) {
      const game1 = games.find((entry) => entry.number === 1);
      if (game1) {
        const gameScore1 = toOptionalScore(game1.score1);
        const gameScore2 = toOptionalScore(game1.score2);
        ensurePairedScores(gameScore1, gameScore2, "Game 1");

        const { result1, result2 } = getResultsFromScores(gameScore1, gameScore2, isRoundRobin);

        await manager.update.match<Match & { youtubeUrl?: string | null }>({
          id: matchId,
          opponent1: { score: gameScore1, result: result1 },
          opponent2: { score: gameScore2, result: result2 },
          youtubeUrl: game1.youtubeUrl,
        });
      }
    }
  }


  const updatedData = (await manager.export()) as ViewerData;
  const updated = await prisma.tournament.update({
    where: { id: tournament.id },
    data: {
      data: toStoredPayload(updatedData, meta) as any,
    },
  });

  return asSnapshot(updated);
}

export function asServiceError(error: unknown): ServiceError {
  if (error instanceof ServiceError) return error;
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  return new ServiceError(message, 500);
}
