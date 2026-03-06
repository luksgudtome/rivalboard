export type StageType =
  | "single_elimination"
  | "double_elimination"
  | "round_robin";

export type TournamentFormat = "rr_se" | "rr_de" | "se" | "de";

export type TournamentGameType =
  | "esports"
  | "basketball"
  | "football"
  | "volleyball"
  | "badminton"
  | "tennis"
  | "chess"
  | "other";

export interface ViewerParticipant {
  id: number;
  name: string;
  participantType?: "team" | "individual";
  socialUrl?: string | null;
  jerseyNumber?: string | null;
  profilePhotoUrl?: string | null;
  logoUrl?: string | null;
  players?: ViewerParticipantPlayer[] | null;
}

export interface ViewerParticipantPlayer {
  name: string;
  socialUrl?: string | null;
  jerseyNumber?: string | null;
}

export interface ViewerOpponent {
  id: number | null;
  score?: number;
  result?: "win" | "loss" | "draw";
}

export interface ViewerMatch {
  id: number;
  status: number;
  stage_id: number;
  child_count?: number;
  opponent1: ViewerOpponent | null;
  opponent2: ViewerOpponent | null;
  youtubeUrl?: string | null;
}

export interface ViewerMatchGame {
  id: number;
  stage_id: number;
  parent_id: number;
  number: number;
  status: number;
  opponent1: ViewerOpponent | null;
  opponent2: ViewerOpponent | null;
  youtubeUrl?: string | null;
}

export interface ViewerData {
  participant: ViewerParticipant[];
  stage: any[];
  group: any[];
  round: any[];
  match: ViewerMatch[];
  match_game: ViewerMatchGame[];
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

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  plan: "free" | "pro";
  paypalSubscriptionStatus?: string | null;
}
