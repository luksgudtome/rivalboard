"use client";

import Link from "next/link";
import html2canvas from "html2canvas";
import { ChevronDown, CircleUserRound, Ellipsis, Save, Share2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PendingSeedSelection,
  PublicUser,
  SeedCandidate,
  StageType,
  TournamentSnapshot,
  ViewerMatch,
  ViewerMatchGame,
  ViewerParticipantPlayer,
} from "@/lib/contracts";

interface TournamentViewerApi {
  render: (data: unknown, config?: unknown) => Promise<void>;
  setParticipantImages?: (images: Array<{ participantId: number; imageUrl: string }>) => void;
}

interface TournamentViewerMatchClickPayload {
  id: number | string;
}

declare global {
  interface Window {
    bracketsViewer?: TournamentViewerApi;
  }
}

const STATUS_LABEL: Record<number, string> = {
  0: "Locked",
  1: "Waiting",
  2: "Ready",
  3: "Running",
  4: "Completed",
  5: "Archived",
};

type BestOfOption = 1 | 3 | 5 | 7;

function bestOfFromChildCount(childCount?: number): BestOfOption {
  if (childCount === 3 || childCount === 5 || childCount === 7) return childCount;
  return 1;
}

interface MatchNames {
  p1: string;
  p2: string;
}

interface EditableGameDraft {
  number: number;
  score1: string;
  score2: string;
  youtubeUrl: string;
}

interface MatchModalProps {
  match: ViewerMatch;
  names: MatchNames;
  canEdit: boolean;
  bestOf: BestOfOption;
  games: EditableGameDraft[];
  activeGameNumber: number;
  matchScore1: number;
  matchScore2: number;
  isSaving: boolean;
  onBestOfChange: (value: BestOfOption) => void;
  onActiveGameNumberChange: (value: number) => void;
  onActiveGameScore1Change: (value: string) => void;
  onActiveGameScore2Change: (value: string) => void;
  onActiveGameYoutubeUrlChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

function isEditableMatch(match: ViewerMatch): boolean {
  const isLocked = match.status === 0 || match.status === 1 || match.status === 5;
  const hasBothParticipants =
    match.opponent1?.id !== null &&
    match.opponent1?.id !== undefined &&
    match.opponent2?.id !== null &&
    match.opponent2?.id !== undefined;
  return !isLocked && hasBothParticipants;
}

function participantName(opponent: { id: number | null } | null, participantsById: Map<number, string>): string {
  if (opponent === null) return "BYE";
  if (opponent.id === null || opponent.id === undefined) return "TBD";
  return participantsById.get(opponent.id) ?? `ID ${opponent.id}`;
}

function youtubeEmbedUrl(input?: string | null): string | null {
  const raw = input?.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") {
        const id = url.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }

      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "embed" && parts[1]) return `https://www.youtube.com/embed/${parts[1]}`;
      if (parts[0] === "shorts" && parts[1]) return `https://www.youtube.com/embed/${parts[1]}`;
    }
  } catch {
    return null;
  }

  return null;
}

function createEmptyGameDraft(number: number): EditableGameDraft {
  return { number, score1: "", score2: "", youtubeUrl: "" };
}

function buildGameDrafts(bestOf: BestOfOption, current: EditableGameDraft[] = []): EditableGameDraft[] {
  const byNumber = new Map(current.map((game) => [game.number, game]));
  return Array.from({ length: bestOf }, (_, index) => byNumber.get(index + 1) ?? createEmptyGameDraft(index + 1));
}

function parseOptionalScore(value: string): { value: number | null; valid: boolean } {
  const trimmed = value.trim();
  if (!trimmed) return { value: null, valid: true };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return { value: null, valid: false };
  return { value: parsed, valid: true };
}

function initials(value: string): string {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

function sanitizeFilenamePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function formatStageType(type: StageType): string {
  return type.replaceAll("_", " ");
}

function stageDisplayName(
  stage: { name: string; type: StageType },
  hasRoundRobinStage: boolean,
): string {
  if (!hasRoundRobinStage) return stage.name;
  return stage.type === "round_robin" ? "Group Stage" : "Playoffs";
}

function viewerStageName(
  stage: { name: string; type: StageType },
  tournamentName: string,
  hasRoundRobinStage: boolean,
): string {
  const label = stageDisplayName(stage, hasRoundRobinStage).trim();

  // Single-stage formats should not prefix the stage with the tournament name.
  if (!hasRoundRobinStage) {
    return label;
  }

  const normalizedTournamentName = tournamentName.trim();
  if (!normalizedTournamentName) return label;
  if (label.toLowerCase() === normalizedTournamentName.toLowerCase()) return label;
  return `${normalizedTournamentName} - ${label}`;
}

function toExportImageUrl(value: string, origin: string): string {
  try {
    const parsed = new URL(value, origin);
    if (parsed.origin === origin || parsed.protocol === "data:") return parsed.toString();
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return parsed.toString();
    return `${origin}/api/image-proxy?url=${encodeURIComponent(parsed.toString())}`;
  } catch {
    return value;
  }
}

function rewriteBackgroundImageUrls(value: string, origin: string): string {
  return value.replace(/url\((['"]?)(.*?)\1\)/g, (_match, _quote, rawUrl: string) => {
    const cleaned = rawUrl.trim();
    if (!cleaned) return _match;
    const nextUrl = toExportImageUrl(cleaned, origin);
    return `url("${nextUrl}")`;
  });
}

function MatchUpdateModal({
  match,
  names,
  canEdit,
  bestOf,
  games,
  activeGameNumber,
  matchScore1,
  matchScore2,
  isSaving,
  onBestOfChange,
  onActiveGameNumberChange,
  onActiveGameScore1Change,
  onActiveGameScore2Change,
  onActiveGameYoutubeUrlChange,
  onClose,
  onSubmit,
}: MatchModalProps) {
  const activeGame = games.find((game) => game.number === activeGameNumber) ?? games[0] ?? null;

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-labelledby="match-modal-title">
      <button type="button" className="modal-backdrop" onClick={onClose} aria-label="Close modal" />
      <div className="modal-card">
        <div className="modal-head">
          <h3 id="match-modal-title">Update Match #{match.id}</h3>
          <button type="button" className="icon-btn" onClick={onClose}>
            x
          </button>
        </div>

        <p className="modal-subtitle">
          {names.p1} vs {names.p2} | {STATUS_LABEL[match.status] ?? match.status}
        </p>
        <p className="modal-note">
          Match Score: {matchScore1} - {matchScore2}
        </p>

        <form className="stack" onSubmit={onSubmit}>
          <label>
            Games Per Match
            <select
              value={String(bestOf)}
              onChange={(event) => onBestOfChange(Number(event.target.value) as BestOfOption)}
              disabled={!canEdit}
            >
              <option value="1">Best of 1</option>
              <option value="3">Best of 3</option>
              <option value="5">Best of 5</option>
              <option value="7">Best of 7</option>
            </select>
          </label>

          <div className="filter-pills" role="tablist" aria-label="Match games">
            {games.map((game) => (
              <button
                key={game.number}
                type="button"
                className={`filter-pill ${activeGameNumber === game.number ? "active" : ""}`}
                onClick={() => onActiveGameNumberChange(game.number)}
              >
                Game {game.number}
              </button>
            ))}
          </div>

          <div className="score-grid">
            <label>
              {names.p1} score
              <input
                type="number"
                min={0}
                value={activeGame?.score1 ?? ""}
                onChange={(event) => onActiveGameScore1Change(event.target.value)}
                disabled={!canEdit}
              />
            </label>
            <label>
              {names.p2} score
              <input
                type="number"
                min={0}
                value={activeGame?.score2 ?? ""}
                onChange={(event) => onActiveGameScore2Change(event.target.value)}
                disabled={!canEdit}
              />
            </label>
          </div>

          <label>
            YouTube URL
            <input
              type="url"
              inputMode="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={activeGame?.youtubeUrl ?? ""}
              onChange={(event) => onActiveGameYoutubeUrlChange(event.target.value)}
              disabled={!canEdit}
            />
          </label>

          <button type="submit" className="primary-btn" disabled={!canEdit || isSaving || activeGame === null}>
            {isSaving ? "Saving..." : "Save Match"}
          </button>
        </form>

        <p className="modal-note">
          {canEdit
            ? "Submit scores and optional match metadata."
            : "This match is read-only (locked, waiting, archived, or contains TBD/BYE)."}
        </p>
      </div>
    </div>
  );
}

interface PublicMatchModalProps {
  match: ViewerMatch;
  names: MatchNames;
  games: EditableGameDraft[];
  activeGameNumber: number;
  totalScore1: number;
  totalScore2: number;
  p1ImageUrl?: string;
  p2ImageUrl?: string;
  p1Detail?: string;
  p2Detail?: string;
  p1IsTeam: boolean;
  p2IsTeam: boolean;
  p1Players: ViewerParticipantPlayer[];
  p2Players: ViewerParticipantPlayer[];
  p1SocialUrl?: string;
  p2SocialUrl?: string;
  onActiveGameNumberChange: (value: number) => void;
  onClose: () => void;
}

interface TeamPlayersModalProps {
  teamName: string;
  players: ViewerParticipantPlayer[];
  onClose: () => void;
}

function TeamPlayersModal({ teamName, players, onClose }: TeamPlayersModalProps) {
  return (
    <div className="modal-root modal-root-front" role="dialog" aria-modal="true" aria-labelledby="team-players-modal-title">
      <button type="button" className="modal-backdrop" onClick={onClose} aria-label="Close player list" />
      <div className="modal-card">
        <div className="modal-head">
          <h3 id="team-players-modal-title">{teamName} Players</h3>
          <button type="button" className="icon-btn" onClick={onClose}>
            x
          </button>
        </div>

        {players.length === 0 ? (
          <p className="modal-note modal-note-center">No players listed.</p>
        ) : (
          <div className="player-grid">
            {players.map((player, index) => {
              const avatar = (
                <span className="player-grid-avatar" aria-hidden="true">
                  {initials(player.name)}
                </span>
              );

              return (
                <article key={`${player.name}-${index}`} className="player-grid-card">
                  {player.socialUrl ? (
                    <a
                      href={player.socialUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="player-grid-avatar-link"
                      aria-label={`Open ${player.name} profile`}
                    >
                      {avatar}
                    </a>
                  ) : (
                    avatar
                  )}
                  <strong>{player.name}</strong>
                  <small>{player.jerseyNumber ? `#${player.jerseyNumber}` : "No jersey"}</small>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function PublicMatchModal({
  match,
  names,
  games,
  activeGameNumber,
  totalScore1,
  totalScore2,
  p1ImageUrl,
  p2ImageUrl,
  p1Detail,
  p2Detail,
  p1IsTeam,
  p2IsTeam,
  p1Players,
  p2Players,
  p1SocialUrl,
  p2SocialUrl,
  onActiveGameNumberChange,
  onClose,
}: PublicMatchModalProps) {
  const [teamPlayersModal, setTeamPlayersModal] = useState<{ teamName: string; players: ViewerParticipantPlayer[] } | null>(
    null,
  );
  const activeGame = games.find((game) => game.number === activeGameNumber) ?? games[0] ?? null;
  const embedUrl = youtubeEmbedUrl(activeGame?.youtubeUrl);
  const gameScore1 = activeGame?.score1.trim() ? activeGame.score1.trim() : "-";
  const gameScore2 = activeGame?.score2.trim() ? activeGame.score2.trim() : "-";
  const winnerName =
    match.opponent1?.result === "win"
      ? names.p1
      : match.opponent2?.result === "win"
        ? names.p2
        : totalScore1 > totalScore2
          ? names.p1
          : totalScore2 > totalScore1
            ? names.p2
            : totalScore1 === totalScore2 && (totalScore1 > 0 || totalScore2 > 0)
              ? "Draw"
              : "TBD";

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-labelledby="public-match-modal-title">
      <button type="button" className="modal-backdrop" onClick={onClose} aria-label="Close modal" />
      <div className="modal-card">
        <div className="modal-head">
          <h3 id="public-match-modal-title">Match #{match.id}</h3>
          <button type="button" className="icon-btn" onClick={onClose}>
            x
          </button>
        </div>

        <div className="public-matchup">
          <div className="public-team">
            {!p1IsTeam && p1SocialUrl ? (
              <a href={p1SocialUrl} target="_blank" rel="noopener noreferrer" className="public-team-avatar-link" aria-label={`Open ${names.p1} profile`}>
                {p1ImageUrl ? (
                  <img src={p1ImageUrl} alt={`${names.p1} profile`} className="public-team-avatar" />
                ) : (
                  <span className="public-team-avatar public-team-avatar-fallback" aria-hidden="true">
                    {names.p1.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </a>
            ) : p1ImageUrl ? (
              <img src={p1ImageUrl} alt={`${names.p1} logo`} className="public-team-avatar" />
            ) : (
              <span className="public-team-avatar public-team-avatar-fallback" aria-hidden="true">
                {names.p1.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="public-team-meta">
              <strong>{names.p1}</strong>
              {p1IsTeam && p1Players.length > 0 ? (
                <button
                  type="button"
                  className="team-players-link"
                  onClick={() => setTeamPlayersModal({ teamName: names.p1, players: p1Players })}
                >
                  {p1Players.length} players
                </button>
              ) : (
                p1Detail && <small>{p1Detail}</small>
              )}
            </div>
          </div>
          <span className="public-vs" aria-hidden="true">
            VS
          </span>
          <div className="public-team public-team-end">
            <div className="public-team-meta">
              <strong>{names.p2}</strong>
              {p2IsTeam && p2Players.length > 0 ? (
                <button
                  type="button"
                  className="team-players-link"
                  onClick={() => setTeamPlayersModal({ teamName: names.p2, players: p2Players })}
                >
                  {p2Players.length} players
                </button>
              ) : (
                p2Detail && <small>{p2Detail}</small>
              )}
            </div>
            {!p2IsTeam && p2SocialUrl ? (
              <a href={p2SocialUrl} target="_blank" rel="noopener noreferrer" className="public-team-avatar-link" aria-label={`Open ${names.p2} profile`}>
                {p2ImageUrl ? (
                  <img src={p2ImageUrl} alt={`${names.p2} profile`} className="public-team-avatar" />
                ) : (
                  <span className="public-team-avatar public-team-avatar-fallback" aria-hidden="true">
                    {names.p2.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </a>
            ) : p2ImageUrl ? (
              <img src={p2ImageUrl} alt={`${names.p2} logo`} className="public-team-avatar" />
            ) : (
              <span className="public-team-avatar public-team-avatar-fallback" aria-hidden="true">
                {names.p2.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
        </div>

        <div className="modal-note modal-note-center public-match-summary">
          <span>Match Score: {totalScore1} - {totalScore2}</span>
          <span>Winner: {winnerName}</span>
          <span>Status: {STATUS_LABEL[match.status] ?? match.status}</span>
        </div>

        <div className="filter-pills filter-pills-center" role="tablist" aria-label="Match games">
          {games.map((game) => (
            <button
              key={game.number}
              type="button"
              className={`filter-pill ${activeGameNumber === game.number ? "active" : ""}`}
              onClick={() => onActiveGameNumberChange(game.number)}
            >
              Game {game.number}
            </button>
          ))}
        </div>

        {embedUrl ? (
          <div className="video-embed-wrap">
            <iframe
              src={embedUrl}
              title={`Match ${match.id} stream`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        ) : null}

        <div className="public-scoreboard" aria-label="Game score">
          <article className="public-score-card">
            <small className="public-score-name">{names.p1}</small>
            <strong className="public-score-value">{gameScore1}</strong>
          </article>
          <article className="public-score-card">
            <small className="public-score-name">{names.p2}</small>
            <strong className="public-score-value">{gameScore2}</strong>
          </article>
        </div>
      </div>
      {teamPlayersModal && (
        <TeamPlayersModal
          teamName={teamPlayersModal.teamName}
          players={teamPlayersModal.players}
          onClose={() => setTeamPlayersModal(null)}
        />
      )}
    </div>
  );
}

interface DeleteTournamentModalProps {
  isDeleting: boolean;
  onClose: () => void;
  onDelete: () => void;
}

function DeleteTournamentModal({ isDeleting, onClose, onDelete }: DeleteTournamentModalProps) {
  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-labelledby="delete-tournament-modal-title">
      <button type="button" className="modal-backdrop" onClick={onClose} aria-label="Close modal" />
      <div className="modal-card modal-card-danger">
        <div className="modal-head">
          <h3 id="delete-tournament-modal-title">Delete Tournament</h3>
          <button type="button" className="icon-btn icon-btn-danger" onClick={onClose}>
            x
          </button>
        </div>
        <p className="modal-note modal-note-danger">This action permanently deletes the tournament and all match data.</p>
        <div className="wizard-actions">
          <button type="button" className="ghost-btn participants-add-btn wizard-nav-btn" onClick={onClose} disabled={isDeleting}>
            Cancel
          </button>
          <button type="button" className="primary-btn danger-btn" onClick={onDelete} disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface TournamentViewClientProps {
  initialSnapshot: TournamentSnapshot;
  user?: PublicUser;
  readOnly?: boolean;
}

interface ConfirmSeedsModalProps {
  pending: PendingSeedSelection;
  participants: Array<{ id: number; name: string }>;
  seedCandidates: SeedCandidate[];
  selectedParticipantIds: number[];
  onSeedReorder: (sourceParticipantId: number, targetParticipantId: number) => void;
  isLoading: boolean;
  isSubmitting: boolean;
  onParticipantToggle: (participantId: number) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

function ConfirmSeedsModal({
  pending,
  participants,
  seedCandidates,
  selectedParticipantIds,
  onSeedReorder,
  isLoading,
  isSubmitting,
  onParticipantToggle,
  onClose,
  onSubmit,
}: ConfirmSeedsModalProps) {
  const [dragParticipantId, setDragParticipantId] = useState<number | null>(null);
  const candidateRankById = useMemo(
    () => new Map(seedCandidates.map((candidate) => [candidate.id, candidate.rank])),
    [seedCandidates],
  );
  const participantsById = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant.name])),
    [participants],
  );
  const sortedParticipants = useMemo(() => {
    return participants
      .slice()
      .sort((a, b) => {
        const rankA = candidateRankById.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const rankB = candidateRankById.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        if (rankA !== rankB) return rankA - rankB;
        return a.name.localeCompare(b.name);
      });
  }, [candidateRankById, participants]);

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-labelledby="confirm-seeds-modal-title">
      <button type="button" className="modal-backdrop" onClick={onClose} aria-label="Close seed selection modal" />
      <div className="modal-card">
        <div className="modal-head">
          <h3 id="confirm-seeds-modal-title">Confirm Qualifiers</h3>
          <button type="button" className="icon-btn" onClick={onClose}>
            x
          </button>
        </div>

        <p className="modal-note">
          Select any number of participants (minimum 2) for the next stage (
          {pending.stage2Type.replaceAll("_", " ")}).
        </p>

        <form className="stack" onSubmit={onSubmit}>
          <section className="stage-participants">
            <div className="participant-block-head">
              <strong>Seed Selection</strong>
              <small className="muted">
                {selectedParticipantIds.length} selected
              </small>
            </div>
            <div className="stage-participants-grid">
              {sortedParticipants.map((participant) => {
                const isChecked = selectedParticipantIds.includes(participant.id);
                return (
                  <label key={participant.id} className="stage-participant-item">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isLoading || isSubmitting}
                      onChange={() => onParticipantToggle(participant.id)}
                    />
                    <span>{participant.name}</span>
                  </label>
                );
              })}
            </div>
          </section>

          {selectedParticipantIds.length > 0 && (
            <section className="stage-participants">
              <div className="participant-block-head">
                <strong>Seed Order</strong>
                <small className="muted">Drag to reorder seeds</small>
              </div>
              <div className="simple-list seed-order-list">
                {selectedParticipantIds.map((participantId, index) => (
                  <article
                    key={participantId}
                    className="simple-list-item seed-order-item"
                    draggable={!isLoading && !isSubmitting}
                    onDragStart={() => setDragParticipantId(participantId)}
                    onDragEnd={() => setDragParticipantId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (dragParticipantId === null || dragParticipantId === participantId) return;
                      onSeedReorder(dragParticipantId, participantId);
                      setDragParticipantId(null);
                    }}
                  >
                    <div className="simple-list-main">
                      <strong>
                        #{index + 1} {participantsById.get(participantId) ?? `ID ${participantId}`}
                      </strong>
                      <small>Selected qualifier</small>
                    </div>
                    <span className="seed-order-handle" aria-hidden="true">
                      drag
                    </span>
                  </article>
                ))}
              </div>
            </section>
          )}

          <div className="wizard-actions">
            <button
              type="button"
              className="ghost-btn participants-add-btn wizard-nav-btn"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-btn"
              disabled={isLoading || isSubmitting || selectedParticipantIds.length < 2}
            >
              {isSubmitting ? "Confirming..." : "Confirm Seeds"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TournamentViewClient({ initialSnapshot, user, readOnly = false }: TournamentViewClientProps) {
  const router = useRouter();
  const [viewerReady, setViewerReady] = useState(false);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeletingTournament, setIsDeletingTournament] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [isSeedModalOpen, setIsSeedModalOpen] = useState(false);
  const [isLoadingSeedCandidates, setIsLoadingSeedCandidates] = useState(false);
  const [isSubmittingSeeds, setIsSubmittingSeeds] = useState(false);
  const [seedCandidates, setSeedCandidates] = useState<SeedCandidate[]>([]);
  const [selectedSeedParticipantIds, setSelectedSeedParticipantIds] = useState<number[]>([]);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);

  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [bestOf, setBestOf] = useState<BestOfOption>(1);
  const [games, setGames] = useState<EditableGameDraft[]>([createEmptyGameDraft(1)]);
  const [activeGameNumber, setActiveGameNumber] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const tournament = snapshot.tournament;
  const [activeStageId, setActiveStageId] = useState<number>(tournament.stageId);

  const participantsById = useMemo(
    () => new Map(snapshot.data.participant.map((participant) => [participant.id, participant.name])),
    [snapshot.data.participant],
  );
  const participantDetailsById = useMemo(
    () => new Map(snapshot.data.participant.map((participant) => [participant.id, participant])),
    [snapshot.data.participant],
  );

  const matchesById = useMemo(() => new Map(snapshot.data.match.map((match) => [match.id, match])), [snapshot.data.match]);
  const stages = useMemo(
    () => tournament?.stages ?? [],
    [tournament?.stages],
  );
  const pendingSeedSelection = tournament?.pendingSeedSelection ?? null;
  const hasRoundRobinStage = useMemo(
    () => stages.some((stage) => stage.type === "round_robin"),
    [stages],
  );
  const hasPendingSeedSelection = pendingSeedSelection?.status === "pending_seed_confirmation";
  const canOpenNextStage = useMemo(() => {
    if (!hasPendingSeedSelection || !pendingSeedSelection) return false;
    const stage1 = stages.find((stage) => stage.id === pendingSeedSelection.stage1Id);
    if (!stage1) return false;
    return stage1.matchCount > 0 && stage1.completedMatches >= stage1.matchCount;
  }, [hasPendingSeedSelection, pendingSeedSelection, stages]);
  const timelineStages = useMemo(() => {
    const sorted = [...stages].sort((a, b) => a.number - b.number);
    if (!hasPendingSeedSelection || !pendingSeedSelection) return sorted;
    return [
      ...sorted,
      {
        id: -1,
        tournamentId: sorted[0]?.tournamentId ?? 0,
        number: sorted.length + 1,
        name: "Playoffs",
        type: pendingSeedSelection.stage2Type,
        groupCount: 0,
        roundCount: 0,
        matchCount: 0,
        completedMatches: 0,
      },
    ];
  }, [hasPendingSeedSelection, pendingSeedSelection, stages]);
  const matchGamesByParentId = useMemo(() => {
    const map = new Map<number, ViewerMatchGame[]>();
    for (const game of snapshot.data.match_game) {
      const existing = map.get(game.parent_id);
      if (existing) {
        existing.push(game);
      } else {
        map.set(game.parent_id, [game]);
      }
    }

    for (const gameList of map.values()) {
      gameList.sort((a, b) => a.number - b.number);
    }

    return map;
  }, [snapshot.data.match_game]);

  const selectedMatch = useMemo(() => {
    if (selectedMatchId === null) return null;
    return matchesById.get(selectedMatchId) ?? null;
  }, [matchesById, selectedMatchId]);

  const selectedNames = useMemo(() => {
    if (!selectedMatch) return null;
    return {
      p1: participantName(selectedMatch.opponent1, participantsById),
      p2: participantName(selectedMatch.opponent2, participantsById),
    };
  }, [participantsById, selectedMatch]);

  const selectedParticipantVisuals = useMemo(() => {
    if (!selectedMatch) {
      return {
        p1ImageUrl: undefined as string | undefined,
        p2ImageUrl: undefined as string | undefined,
        p1Detail: undefined as string | undefined,
        p2Detail: undefined as string | undefined,
        p1IsTeam: false,
        p2IsTeam: false,
        p1Players: [] as ViewerParticipantPlayer[],
        p2Players: [] as ViewerParticipantPlayer[],
        p1SocialUrl: undefined as string | undefined,
        p2SocialUrl: undefined as string | undefined,
      };
    }

    const p1 =
      selectedMatch.opponent1?.id !== null && selectedMatch.opponent1?.id !== undefined
        ? participantDetailsById.get(selectedMatch.opponent1.id)
        : undefined;
    const p2 =
      selectedMatch.opponent2?.id !== null && selectedMatch.opponent2?.id !== undefined
        ? participantDetailsById.get(selectedMatch.opponent2.id)
        : undefined;

    const p1IsTeam = p1?.participantType === "team";
    const p2IsTeam = p2?.participantType === "team";
    const p1Players = p1IsTeam ? p1?.players ?? [] : [];
    const p2Players = p2IsTeam ? p2?.players ?? [] : [];
    const p1Detail = !p1IsTeam && p1?.jerseyNumber ? `#${p1.jerseyNumber}` : undefined;
    const p2Detail = !p2IsTeam && p2?.jerseyNumber ? `#${p2.jerseyNumber}` : undefined;

    return {
      p1ImageUrl: p1?.profilePhotoUrl ?? p1?.logoUrl ?? undefined,
      p2ImageUrl: p2?.profilePhotoUrl ?? p2?.logoUrl ?? undefined,
      p1Detail,
      p2Detail,
      p1IsTeam,
      p2IsTeam,
      p1Players,
      p2Players,
      p1SocialUrl: !p1IsTeam ? p1?.socialUrl ?? undefined : undefined,
      p2SocialUrl: !p2IsTeam ? p2?.socialUrl ?? undefined : undefined,
    };
  }, [participantDetailsById, selectedMatch]);

  const matchScore = useMemo(() => {
    if (bestOf === 1) {
      const game1 = games[0];
      const parsed1 = parseOptionalScore(game1?.score1 ?? "");
      const parsed2 = parseOptionalScore(game1?.score2 ?? "");
      return {
        p1: parsed1.valid && parsed1.value !== null ? parsed1.value : 0,
        p2: parsed2.valid && parsed2.value !== null ? parsed2.value : 0,
      };
    }

    let p1 = 0;
    let p2 = 0;

    for (const game of games) {
      const parsed1 = parseOptionalScore(game.score1);
      const parsed2 = parseOptionalScore(game.score2);

      if (!parsed1.valid || !parsed2.valid) continue;
      if (parsed1.value === null || parsed2.value === null) continue;
      if (parsed1.value > parsed2.value) p1 += 1;
      else if (parsed2.value > parsed1.value) p2 += 1;
    }

    return { p1, p2 };
  }, [bestOf, games]);

  const viewerPayload = useMemo(() => {
    const stagesWithViewerNames = snapshot.data.stage.map((stage) => ({
      ...stage,
      name: viewerStageName(stage, tournament.name, hasRoundRobinStage),
    }));

    const hasActiveStage = snapshot.data.stage.some((stage) => stage.id === activeStageId);
    if (!hasActiveStage) {
      return {
        stages: stagesWithViewerNames,
        matches: snapshot.data.match,
        matchGames: snapshot.data.match_game,
        participants: snapshot.data.participant,
      };
    }

    return {
      stages: stagesWithViewerNames.filter((stage) => stage.id === activeStageId),
      matches: snapshot.data.match.filter((match) => match.stage_id === activeStageId),
      matchGames: snapshot.data.match_game.filter((matchGame) => matchGame.stage_id === activeStageId),
      participants: snapshot.data.participant,
    };
  }, [
    activeStageId,
    hasRoundRobinStage,
    snapshot.data.match,
    snapshot.data.match_game,
    snapshot.data.participant,
    snapshot.data.stage,
    tournament.name,
  ]);

  const participantImages = useMemo(
    () =>
      snapshot.data.participant
        .map((participant) => ({
          participantId: participant.id,
          imageUrl: participant.profilePhotoUrl ?? participant.logoUrl ?? "",
        }))
        .filter((entry) => entry.imageUrl.length > 0),
    [snapshot.data.participant],
  );

  const openMatchModal = useCallback(
    (matchId: number) => {
      const match = matchesById.get(matchId);
      if (!match) return;

      const nextBestOf = bestOfFromChildCount(match.child_count);
      const storedGames = matchGamesByParentId.get(matchId) ?? [];
      const storedGamesByNumber = new Map(storedGames.map((game) => [game.number, game]));
      const nextGames = Array.from({ length: nextBestOf }, (_, index) => {
        const number = index + 1;
        const storedGame = storedGamesByNumber.get(number);

        if (storedGame) {
          return {
            number,
            score1: storedGame.opponent1?.score !== undefined ? String(storedGame.opponent1.score) : "",
            score2: storedGame.opponent2?.score !== undefined ? String(storedGame.opponent2.score) : "",
            youtubeUrl: storedGame.youtubeUrl ?? "",
          };
        }

        if (number === 1 && (!match.child_count || match.child_count === 0)) {
          return {
            number: 1,
            score1: match.opponent1?.score !== undefined ? String(match.opponent1.score) : "",
            score2: match.opponent2?.score !== undefined ? String(match.opponent2.score) : "",
            youtubeUrl: match.youtubeUrl ?? "",
          };
        }

        return createEmptyGameDraft(number);
      });

      setSelectedMatchId(match.id);
      setBestOf(nextBestOf);
      setGames(nextGames);
      setActiveGameNumber(1);
    },
    [matchGamesByParentId, matchesById],
  );

  const closeModal = useCallback(() => {
    setSelectedMatchId(null);
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/signout", { method: "POST" });
    router.replace("/signin");
    router.refresh();
  }, [router]);

  const sharePublicLink = useCallback(async () => {
    try {
      setIsActionsMenuOpen(false);
      let nextSnapshot = snapshot;

      if (!tournament.isPublic) {
        const response = await fetch(`/api/tournaments/${tournament.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isPublic: true }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Failed to enable public sharing.");
        nextSnapshot = payload as TournamentSnapshot;
        setSnapshot(nextSnapshot);
      }

      const publicUrl = `${window.location.origin}/public/tournaments/${tournament.id}`;

      try {
        await navigator.clipboard.writeText(publicUrl);
        setInfo("Public share link copied.");
      } catch {
        setInfo(`Public link: ${publicUrl}`);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    }
  }, [snapshot]);

  const saveTournament = useCallback(async () => {
    setError(null);
    setIsActionsMenuOpen(false);
    setIsExportingImage(true);

    try {
      const tournamentElement = document.getElementById("tournament-view");
      if (!tournamentElement) throw new Error("Tournament view is not available.");

      const width = Math.max(tournamentElement.scrollWidth, tournamentElement.clientWidth);
      const height = Math.max(tournamentElement.scrollHeight, tournamentElement.clientHeight);
      const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      const origin = window.location.origin;

      const canvas = await html2canvas(tournamentElement, {
        backgroundColor: "#122731",
        useCORS: true,
        allowTaint: false,
        width,
        height,
        windowWidth: width,
        windowHeight: height,
        scale,
        onclone: (clonedDocument) => {
          const clonedRoot = clonedDocument.getElementById("tournament-view");
          if (!clonedRoot) return;

          const clonedImages = Array.from(clonedRoot.querySelectorAll("img"));
          for (const image of clonedImages) {
            const source = image.getAttribute("src");
            if (!source) continue;
            image.setAttribute("src", toExportImageUrl(source, origin));
            image.setAttribute("crossorigin", "anonymous");
          }

          const styledNodes = Array.from(clonedRoot.querySelectorAll<HTMLElement>("*"));
          for (const node of styledNodes) {
            const inlineBackground = node.style.backgroundImage;
            if (inlineBackground && inlineBackground.includes("url(")) {
              node.style.backgroundImage = rewriteBackgroundImageUrls(inlineBackground, origin);
              continue;
            }

            const computedBackground = clonedDocument.defaultView?.getComputedStyle(node).backgroundImage;
            if (computedBackground && computedBackground !== "none" && computedBackground.includes("url(")) {
              node.style.backgroundImage = rewriteBackgroundImageUrls(computedBackground, origin);
            }
          }
        },
      });

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (nextBlob) => {
            if (!nextBlob) {
              reject(new Error("Failed to generate image file."));
              return;
            }
            resolve(nextBlob);
          },
          "image/jpeg",
          0.92,
        );
      });

      const today = new Date().toISOString().slice(0, 10);
      const baseName = sanitizeFilenamePart(tournament.name) || "tournament";
      const fileName = `${baseName}-${today}.jpg`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      setInfo("Tournament JPEG downloaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setIsExportingImage(false);
    }
  }, [tournament.name]);

  const openSeedSelectionModal = useCallback(async () => {
    if (!pendingSeedSelection || pendingSeedSelection.status !== "pending_seed_confirmation") return;

    setIsActionsMenuOpen(false);
    setError(null);
    setIsSeedModalOpen(true);
    setIsLoadingSeedCandidates(true);

    try {
      const response = await fetch(`/api/tournaments/${tournament.id}/structure`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Failed to load seed candidates.");

      const pending = payload.pendingSeedSelection as PendingSeedSelection | null;
      const candidates = Array.isArray(payload.seedCandidates) ? (payload.seedCandidates as SeedCandidate[]) : [];
      const qualifierCount = pending?.qualifierCount ?? pendingSeedSelection.qualifierCount;
      const preselected = pending?.seededParticipantIds ?? pendingSeedSelection.seededParticipantIds ?? [];
      const recommended = candidates.slice(0, qualifierCount).map((candidate) => candidate.id);
      const fallback = snapshot.data.participant.slice(0, qualifierCount).map((participant) => participant.id);
      const nextSelected =
        preselected.length > 0 ? preselected.slice(0, qualifierCount) : recommended.length > 0 ? recommended : fallback;

      setSeedCandidates(candidates);
      setSelectedSeedParticipantIds(Array.from(new Set(nextSelected)));
    } catch (err) {
      setSeedCandidates([]);
      setSelectedSeedParticipantIds(
        snapshot.data.participant
          .slice(0, pendingSeedSelection.qualifierCount)
          .map((participant) => participant.id),
      );
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setIsLoadingSeedCandidates(false);
    }
  }, [pendingSeedSelection, tournament.id, snapshot.data.participant]);

  const toggleSeedParticipant = useCallback(
    (participantId: number) => {
      if (!pendingSeedSelection || pendingSeedSelection.status !== "pending_seed_confirmation") return;

      setSelectedSeedParticipantIds((current) => {
        if (current.includes(participantId)) {
          return current.filter((id) => id !== participantId);
        }
        return [...current, participantId];
      });
    },
    [pendingSeedSelection],
  );

  const reorderSeedParticipants = useCallback((sourceParticipantId: number, targetParticipantId: number) => {
    setSelectedSeedParticipantIds((current) => {
      const sourceIndex = current.indexOf(sourceParticipantId);
      const targetIndex = current.indexOf(targetParticipantId);
      if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return current;

      const reordered = [...current];
      const [moved] = reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, moved);
      return reordered;
    });
  }, []);

  const openNextStage = useCallback(async () => {
    if (!hasPendingSeedSelection) {
      setIsActionsMenuOpen(false);
      setInfo("No pending next stage available.");
      return;
    }
    if (!canOpenNextStage) {
      setIsActionsMenuOpen(false);
      setInfo("Complete the current stage before selecting next-stage qualifiers.");
      return;
    }
    await openSeedSelectionModal();
  }, [canOpenNextStage, hasPendingSeedSelection, openSeedSelectionModal]);

  const confirmSeeds = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!pendingSeedSelection || pendingSeedSelection.status !== "pending_seed_confirmation") return;

      if (selectedSeedParticipantIds.length < 2) {
        setError("Select at least 2 participants before confirming seeds.");
        return;
      }

      setError(null);
      setIsSubmittingSeeds(true);

      try {
        const response = await fetch(`/api/tournaments/${tournament.id}/structure`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "confirm_seeds",
            participantIds: selectedSeedParticipantIds,
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Failed to confirm seeds.");

        setSnapshot(payload as TournamentSnapshot);
        setIsSeedModalOpen(false);
        setSeedCandidates([]);
        setSelectedSeedParticipantIds([]);
        setInfo("Seeds confirmed. Next stage created.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unexpected error.");
      } finally {
        setIsSubmittingSeeds(false);
      }
    },
    [pendingSeedSelection, selectedSeedParticipantIds, tournament.id],
  );

  const deleteTournament = useCallback(async () => {
    setError(null);
    setIsDeletingTournament(true);

    try {
      const response = await fetch(`/api/tournaments/${tournament.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? "Failed to delete tournament.");
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
      setIsDeletingTournament(false);
    }
  }, [router, tournament.id]);

  const markViewerReady = useCallback(() => {
    setViewerReady(true);
  }, []);

  const updateMatch = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedMatch) return;

      setError(null);
      setIsSaving(true);

      try {
        const normalizedGames = games.map((game) => {
          const parsed1 = parseOptionalScore(game.score1);
          const parsed2 = parseOptionalScore(game.score2);

          if (!parsed1.valid || !parsed2.valid) {
            throw new Error(`Game ${game.number} scores must be non-negative numbers.`);
          }

          if ((parsed1.value === null) !== (parsed2.value === null)) {
            throw new Error(`Game ${game.number} requires both scores, or neither score.`);
          }

          return {
            number: game.number,
            score1: parsed1.value,
            score2: parsed2.value,
            youtubeUrl: game.youtubeUrl.trim() ? game.youtubeUrl.trim() : null,
          };
        });

        const response = await fetch(`/api/tournaments/${tournament.id}/matches/${selectedMatch.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bestOf,
            games: normalizedGames,
          }),
        });

        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Failed to update match.");

        setSnapshot(payload as TournamentSnapshot);
        closeModal();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unexpected error.");
      } finally {
        setIsSaving(false);
      }
    },
    [bestOf, closeModal, games, selectedMatch, tournament.id],
  );

  useEffect(() => {
    if (games.some((game) => game.number === activeGameNumber)) return;
    setActiveGameNumber(games[0]?.number ?? 1);
  }, [activeGameNumber, games]);

  useEffect(() => {
    if (stages.some((stage) => stage.id === activeStageId)) return;
    setActiveStageId(tournament.stageId);
  }, [activeStageId, stages, tournament.stageId]);

  useEffect(() => {
    if (window.bracketsViewer) markViewerReady();
  }, [markViewerReady]);

  useEffect(() => {
    if (!viewerReady || !window.bracketsViewer) return;

    window.bracketsViewer.setParticipantImages?.(participantImages);

    void window.bracketsViewer.render(viewerPayload, {
      clear: true,
      selector: "#tournament-view",
      onMatchClick: (match: TournamentViewerMatchClickPayload) => openMatchModal(Number(match.id)),
      highlightParticipantOnHover: true,
    });
  }, [openMatchModal, participantImages, viewerPayload, viewerReady]);

  useEffect(() => {
    if (!isActionsMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (actionsMenuRef.current?.contains(target)) return;
      setIsActionsMenuOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isActionsMenuOpen]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (isSeedModalOpen) {
        setIsSeedModalOpen(false);
        return;
      }
      if (isActionsMenuOpen) {
        setIsActionsMenuOpen(false);
        return;
      }
      if (isDeleteModalOpen) {
        setIsDeleteModalOpen(false);
        return;
      }
      closeModal();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeModal, isActionsMenuOpen, isDeleteModalOpen, isSeedModalOpen]);

  const canEdit = !readOnly && selectedMatch ? isEditableMatch(selectedMatch) : false;
  const isModalOpen = selectedMatch !== null && selectedNames !== null;

  return (
    <main className="dashboard">
      <Script
        src="https://cdn.jsdelivr.net/npm/brackets-viewer@1.9.0/dist/brackets-viewer.min.js"
        strategy="afterInteractive"
        onLoad={markViewerReady}
        onReady={markViewerReady}
      />

      <div className="bg-glow glow-a" aria-hidden="true" />
      <div className="bg-glow glow-b" aria-hidden="true" />

      <nav className="top-nav">
        <div className="top-nav-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              R
            </span>
            <span>Rivalboard</span>
          </div>
          <div className="nav-meta">
            {!readOnly && user && (
              <>
                <Link href="/dashboard" className="primary-btn as-link">
                  Dashboard
                </Link>
                <details className="user-menu">
                  <summary className="user-menu-trigger" aria-label="Account menu" title={user.name}>
                    <span className="user-avatar" aria-hidden="true">
                      <CircleUserRound className="user-avatar-icon" />
                    </span>
                    <span className="user-menu-caret" aria-hidden="true">
                      <ChevronDown className="user-menu-caret-icon" />
                    </span>
                  </summary>
                  <div className="user-menu-panel">
                    <Link href="/account" className="user-menu-item">
                      Account
                    </Link>
                    <div className="user-menu-divider" />
                    <button type="button" className="user-menu-item" onClick={signOut}>
                      Logout
                    </button>
                  </div>
                </details>
              </>
            )}
          </div>
        </div>
      </nav>

      {info && <p className="info-banner">{info}</p>}

      {error && <p className="error-banner">{error}</p>}

      <section className="card tournament-card">
        {!readOnly && user && (
          <div className="user-menu viewer-actions-menu" ref={actionsMenuRef}>
            <button
              type="button"
              className="user-menu-trigger menu-trigger-plain"
              aria-label="Tournament actions"
              title="Tournament actions"
              aria-expanded={isActionsMenuOpen}
              onClick={() => setIsActionsMenuOpen((open) => !open)}
            >
              <Ellipsis className="menu-trigger-plain-icon" aria-hidden="true" />
            </button>
            {isActionsMenuOpen && (
              <div className="user-menu-panel">
                <button type="button" className="user-menu-item" onClick={saveTournament} disabled={isExportingImage}>
                  <Save className="user-menu-item-icon" aria-hidden="true" />
                  {isExportingImage ? "Saving..." : "Save"}
                </button>
                <button type="button" className="user-menu-item" onClick={sharePublicLink}>
                  <Share2 className="user-menu-item-icon" aria-hidden="true" />
                  Share
                </button>
                <div className="user-menu-divider" />
                <button
                  type="button"
                  className="user-menu-item danger-item"
                  onClick={() => {
                    setIsActionsMenuOpen(false);
                    setIsDeleteModalOpen(true);
                  }}
                >
                  <Trash2 className="user-menu-item-icon" aria-hidden="true" />
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
        {stages.length > 0 && (
          <div className="stage-strip" aria-label="Tournament stages">
            <div className="stage-timeline">
              {timelineStages.map((stage, index) => {
                const isNextStagePlaceholder = stage.id === -1;
                const isActive = !isNextStagePlaceholder && stage.id === activeStageId;

                return (
                  <Fragment key={`${stage.id}-${stage.number}`}>
                    <button
                      type="button"
                      className={`stage-chip stage-chip-btn ${isActive ? "active" : ""} ${isNextStagePlaceholder && !canOpenNextStage ? "stage-chip-locked" : ""}`}
                      onClick={() => {
                        if (isNextStagePlaceholder) {
                          void openNextStage();
                          return;
                        }
                        setActiveStageId(stage.id);
                      }}
                      disabled={isNextStagePlaceholder && !canOpenNextStage}
                    >
                      <strong>{stageDisplayName(stage, hasRoundRobinStage)}</strong>
                      <small>
                        {formatStageType(stage.type)}{" "}
                        {isNextStagePlaceholder
                          ? canOpenNextStage
                            ? "| ready"
                            : "| locked"
                          : `| ${stage.completedMatches}/${stage.matchCount}`}
                      </small>
                    </button>
                    {index < timelineStages.length - 1 && (
                      <span className="stage-arrow" aria-hidden="true">
                        {"->"}
                      </span>
                    )}
                  </Fragment>
                );
              })}
            </div>
          </div>
        )}
        <div id="tournament-view" className={`brackets-viewer ${readOnly ? "public-tournament-viewer" : ""}`} />
      </section>

      {isDeleteModalOpen && !readOnly && user && (
        <DeleteTournamentModal
          isDeleting={isDeletingTournament}
          onClose={() => setIsDeleteModalOpen(false)}
          onDelete={deleteTournament}
        />
      )}

      {isSeedModalOpen &&
        !readOnly &&
        user &&
        pendingSeedSelection &&
        pendingSeedSelection.status === "pending_seed_confirmation" && (
          <ConfirmSeedsModal
            pending={pendingSeedSelection}
            participants={snapshot.data.participant}
            seedCandidates={seedCandidates}
            selectedParticipantIds={selectedSeedParticipantIds}
            isLoading={isLoadingSeedCandidates}
            isSubmitting={isSubmittingSeeds}
            onParticipantToggle={toggleSeedParticipant}
            onSeedReorder={reorderSeedParticipants}
            onClose={() => setIsSeedModalOpen(false)}
            onSubmit={confirmSeeds}
          />
        )}

      {isModalOpen && selectedMatch && selectedNames && !readOnly && (
        <MatchUpdateModal
          match={selectedMatch}
          names={selectedNames}
          canEdit={canEdit}
          bestOf={bestOf}
          games={games}
          activeGameNumber={activeGameNumber}
          matchScore1={matchScore.p1}
          matchScore2={matchScore.p2}
          isSaving={isSaving}
          onBestOfChange={(value) => {
            setBestOf(value);
            setGames((current) => buildGameDrafts(value, current));
          }}
          onActiveGameNumberChange={setActiveGameNumber}
          onActiveGameScore1Change={(value) =>
            setGames((current) =>
              current.map((game) => (game.number === activeGameNumber ? { ...game, score1: value } : game)),
            )
          }
          onActiveGameScore2Change={(value) =>
            setGames((current) =>
              current.map((game) => (game.number === activeGameNumber ? { ...game, score2: value } : game)),
            )
          }
          onActiveGameYoutubeUrlChange={(value) =>
            setGames((current) =>
              current.map((game) => (game.number === activeGameNumber ? { ...game, youtubeUrl: value } : game)),
            )
          }
          onClose={closeModal}
          onSubmit={updateMatch}
        />
      )}

      {isModalOpen && selectedMatch && selectedNames && readOnly && (
        <PublicMatchModal
          match={selectedMatch}
          names={selectedNames}
          games={games}
          activeGameNumber={activeGameNumber}
          totalScore1={selectedMatch.opponent1?.score ?? 0}
          totalScore2={selectedMatch.opponent2?.score ?? 0}
          p1ImageUrl={selectedParticipantVisuals.p1ImageUrl}
          p2ImageUrl={selectedParticipantVisuals.p2ImageUrl}
          p1Detail={selectedParticipantVisuals.p1Detail}
          p2Detail={selectedParticipantVisuals.p2Detail}
          p1IsTeam={selectedParticipantVisuals.p1IsTeam}
          p2IsTeam={selectedParticipantVisuals.p2IsTeam}
          p1Players={selectedParticipantVisuals.p1Players}
          p2Players={selectedParticipantVisuals.p2Players}
          p1SocialUrl={selectedParticipantVisuals.p1SocialUrl}
          p2SocialUrl={selectedParticipantVisuals.p2SocialUrl}
          onActiveGameNumberChange={setActiveGameNumber}
          onClose={closeModal}
        />
      )}
    </main>
  );
}
