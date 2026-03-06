"use client";

import Link from "next/link";
import { ChevronDown, CircleUserRound, LogOut, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import RivalboardBrand from "@/components/rivalboard-brand";
import type { PublicUser, TournamentFormat, TournamentGameType, TournamentSummary } from "@/lib/contracts";

interface DashboardClientProps {
  user: PublicUser;
  initialTournaments: TournamentSummary[];
}

type BestOfOption = 1 | 3 | 5 | 7;
type ParticipantMode = "simple" | "player" | "team";
type CreateStep = 0 | 1;
type DashboardFilter = "all" | "open" | "completed";
const ITEMS_PER_PAGE = 10;

interface PlayerDraft {
  id: string;
  name: string;
  socialUrl: string;
  jerseyNumber: string;
}

interface IndividualDraft {
  id: string;
  type: "individual";
  name: string;
  socialUrl: string;
  jerseyNumber: string;
}

interface TeamDraft {
  id: string;
  type: "team";
  name: string;
  socialUrl: string;
  players: PlayerDraft[];
}

type ParticipantDraft = IndividualDraft | TeamDraft;

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseSimpleParticipants(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function toOptional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function serializeParticipants(participants: ParticipantDraft[]) {
  return participants.map((participant) => {
    if (participant.type === "individual") {
      return {
        type: "individual" as const,
        name: participant.name,
        socialUrl: toOptional(participant.socialUrl),
        jerseyNumber: toOptional(participant.jerseyNumber),
      };
    }

    return {
      type: "team" as const,
      name: participant.name,
      socialUrl: toOptional(participant.socialUrl),
      players: participant.players.map((player) => ({
        name: player.name,
        socialUrl: toOptional(player.socialUrl),
        jerseyNumber: toOptional(player.jerseyNumber),
      })),
    };
  });
}

function relativeTime(value: string): string {
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function formatLabel(format: TournamentFormat): string {
  if (format === "rr_se") return "Round Robin -> Single Elim";
  if (format === "rr_de") return "Round Robin -> Double Elim";
  if (format === "de") return "Double Elimination";
  return "Single Elimination";
}

function gameTypeLabel(gameType: TournamentGameType): string {
  return gameType.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function DashboardClient({ user, initialTournaments }: DashboardClientProps) {
  const router = useRouter();
  const [tournaments, setTournaments] = useState(initialTournaments);
  const [error, setError] = useState<string | null>(null);
  const [isCreateWarningOpen, setIsCreateWarningOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createStep, setCreateStep] = useState<CreateStep>(0);

  const [name, setName] = useState("Weekend Cup");
  const [gameType, setGameType] = useState<TournamentGameType>("esports");
  const [format, setFormat] = useState<TournamentFormat>("se");
  const [participantMode, setParticipantMode] = useState<ParticipantMode>("simple");
  const [defaultBestOf, setDefaultBestOf] = useState<BestOfOption>(1);
  const [shuffle, setShuffle] = useState(true);
  const [participants, setParticipants] = useState<ParticipantDraft[]>([]);
  const [simpleParticipantsText, setSimpleParticipantsText] = useState("Apex\nNova\nOrbit\nPulse\nEcho\nVortex");

  const [individualForm, setIndividualForm] = useState({
    name: "",
    socialUrl: "",
    jerseyNumber: "",
  });

  const [teamForm, setTeamForm] = useState({
    name: "",
    socialUrl: "",
  });

  const [playerForm, setPlayerForm] = useState({
    name: "",
    socialUrl: "",
    jerseyNumber: "",
  });

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [dashboardFilter, setDashboardFilter] = useState<DashboardFilter>("open");
  const [currentPage, setCurrentPage] = useState(1);

  const individuals = useMemo(
    () => participants.filter((participant): participant is IndividualDraft => participant.type === "individual"),
    [participants],
  );

  const teams = useMemo(
    () => participants.filter((participant): participant is TeamDraft => participant.type === "team"),
    [participants],
  );

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) ?? null,
    [selectedTeamId, teams],
  );

  const simpleParticipants = useMemo(() => parseSimpleParticipants(simpleParticipantsText), [simpleParticipantsText]);
  const namedParticipantsCount = participants.filter((participant) => participant.name.trim().length > 0).length;
  const hasMinimumParticipants = participantMode === "simple" ? simpleParticipants.length >= 2 : namedParticipantsCount >= 2;
  const filteredTournaments = useMemo(() => {
    return tournaments.filter((tournament) => {
      const isCompleted = tournament.totalMatches > 0 && tournament.completedMatches >= tournament.totalMatches;
      if (dashboardFilter === "all") {
        return true;
      }
      if (dashboardFilter === "open") {
        return !isCompleted;
      }
      return isCompleted;
    });
  }, [tournaments, dashboardFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredTournaments.length / ITEMS_PER_PAGE));

  useEffect(() => {
    setCurrentPage(1);
  }, [dashboardFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedTournaments = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredTournaments.slice(start, start + ITEMS_PER_PAGE);
  }, [currentPage, filteredTournaments]);

  const pageStart = filteredTournaments.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const pageEnd = Math.min(currentPage * ITEMS_PER_PAGE, filteredTournaments.length);

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.replace("/signin");
    router.refresh();
  }

  function switchParticipantMode(nextMode: ParticipantMode) {
    setParticipantMode(nextMode);
    setParticipants([]);
    setSelectedTeamId(null);
    setIndividualForm({ name: "", socialUrl: "", jerseyNumber: "" });
    setTeamForm({ name: "", socialUrl: "" });
    setPlayerForm({ name: "", socialUrl: "", jerseyNumber: "" });
  }

  function addIndividual() {
    if (!individualForm.name.trim()) return;

    setParticipants((current) => [
      ...current,
      {
        id: makeId(),
        type: "individual",
        name: individualForm.name.trim(),
        socialUrl: individualForm.socialUrl.trim(),
        jerseyNumber: individualForm.jerseyNumber.trim(),
      },
    ]);

    setIndividualForm({ name: "", socialUrl: "", jerseyNumber: "" });
  }

  function removeIndividual(individualId: string) {
    setParticipants((current) =>
      current.filter((participant) => !(participant.type === "individual" && participant.id === individualId)),
    );
  }

  function addTeam() {
    if (!teamForm.name.trim()) return;

    const team: TeamDraft = {
      id: makeId(),
      type: "team",
      name: teamForm.name.trim(),
      socialUrl: teamForm.socialUrl.trim(),
      players: [],
    };

    setParticipants((current) => [...current, team]);
    setSelectedTeamId(team.id);
    setTeamForm({ name: "", socialUrl: "" });
  }

  function removeTeam(teamId: string) {
    setParticipants((current) =>
      current.filter((participant) => !(participant.type === "team" && participant.id === teamId)),
    );

    if (selectedTeamId === teamId) {
      setSelectedTeamId(null);
    }
  }

  function addPlayerToSelectedTeam() {
    if (!selectedTeamId || !playerForm.name.trim()) return;

    const player: PlayerDraft = {
      id: makeId(),
      name: playerForm.name.trim(),
      socialUrl: playerForm.socialUrl.trim(),
      jerseyNumber: playerForm.jerseyNumber.trim(),
    };

    setParticipants((current) =>
      current.map((participant) =>
        participant.type === "team" && participant.id === selectedTeamId
          ? { ...participant, players: [...participant.players, player] }
          : participant,
      ),
    );

    setPlayerForm({ name: "", socialUrl: "", jerseyNumber: "" });
  }

  function removePlayer(playerId: string) {
    if (!selectedTeamId) return;

    setParticipants((current) =>
      current.map((participant) =>
        participant.type === "team" && participant.id === selectedTeamId
          ? { ...participant, players: participant.players.filter((player) => player.id !== playerId) }
          : participant,
      ),
    );
  }

  function canContinue(step: CreateStep): boolean {
    if (step === 0) return name.trim().length > 0 && format.trim().length > 0;
    return true;
  }

  async function createTournament() {
    if (createStep !== 1) return;

    if (!hasMinimumParticipants) {
      setError("Add at least 2 participants.");
      return;
    }

    setError(null);
    setIsCreating(true);

    try {
      const response = await fetch("/api/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          gameType,
          format,
          participants: participantMode === "simple" ? simpleParticipants : serializeParticipants(participants),
          shuffle,
          defaultBestOf,
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Failed to create tournament.");
      const tournament = payload.tournament;

      setTournaments((current) => [
        {
          id: tournament.id,
          name: tournament.name,
          description: "",
          gameType: tournament.gameType ?? "esports",
          format: tournament.format ?? "se",
          type: tournament.type,
          updatedAt: tournament.updatedAt,
          totalMatches: payload.stats.totalMatches,
          completedMatches: payload.stats.completedMatches,
        },
        ...current,
      ]);

      setIsModalOpen(false);
      setCreateStep(0);
      setName("Weekend Cup");
      setGameType("esports");
      setFormat("se");
      setParticipantMode("simple");
      setDefaultBestOf(1);
      setShuffle(true);
      setParticipants([]);
      setSimpleParticipantsText("Apex\nNova\nOrbit\nPulse\nEcho\nVortex");
      setSelectedTeamId(null);
      setIndividualForm({ name: "", socialUrl: "", jerseyNumber: "" });
      setTeamForm({ name: "", socialUrl: "" });
      setPlayerForm({ name: "", socialUrl: "", jerseyNumber: "" });

      router.push(`/tournaments/${tournament.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setIsCreating(false);
    }
  }

  function handleNextStep() {
    if (!canContinue(0)) return;
    setError(null);
    setCreateStep(1);
  }

  function handleBackStep() {
    setCreateStep(0);
  }

  return (
    <main className="dashboard">
      <nav className="top-nav">
        <div className="top-nav-inner">
          <RivalboardBrand />
          <div className="nav-meta">
            <button
              type="button"
              className="primary-btn"
              onClick={() => {
                setError(null);
                setCreateStep(0);
                setIsModalOpen(true);
              }}
            >
              Create
            </button>
            <details className="user-menu">
              <summary className="user-menu-trigger dashboard-user-menu-trigger" aria-label="Account menu" title={user.name}>
                <CircleUserRound className="user-avatar-icon" aria-hidden="true" />
                <span className="user-menu-caret" aria-hidden="true">
                  <ChevronDown className="user-menu-caret-icon" />
                </span>
              </summary>
              <div className="user-menu-panel">
                <Link href="/account" className="user-menu-item">
                  <User className="user-menu-item-icon" aria-hidden="true" />
                  Account
                </Link>
                <div className="user-menu-divider" />
                <button type="button" className="user-menu-item" onClick={signOut}>
                  <LogOut className="user-menu-item-icon" aria-hidden="true" />
                  Logout
                </button>
              </div>
            </details>
          </div>
        </div>
      </nav>

      <section className="dashboard-main">
        <section className="card tournament-list">

          <div className="filter-pills" role="tablist" aria-label="Dashboard filters">
            <button
              type="button"
              className={`filter-pill ${dashboardFilter === "all" ? "active" : ""}`}
              onClick={() => setDashboardFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              className={`filter-pill ${dashboardFilter === "open" ? "active" : ""}`}
              onClick={() => setDashboardFilter("open")}
            >
              Open
            </button>
            <button
              type="button"
              className={`filter-pill ${dashboardFilter === "completed" ? "active" : ""}`}
              onClick={() => setDashboardFilter("completed")}
            >
              Completed
            </button>
          </div>

          {tournaments.length === 0 && <p className="muted">No tournaments yet. Create your first one.</p>}
          {tournaments.length > 0 && filteredTournaments.length === 0 && (
            <p className="muted">No tournaments match this filter.</p>
          )}

          <div className="list-panel">
            {paginatedTournaments.map((tournament) => (
              <Link key={tournament.id} href={`/tournaments/${tournament.id}`} className="list-item-link">
                <article className="list-item">
                  <div className="list-item-top">
                    <strong>{tournament.name}</strong>
                    <span className="pill">{formatLabel(tournament.format)}</span>
                  </div>
                  <div className="list-item-meta">
                    <small>{gameTypeLabel(tournament.gameType)}</small>
                    <small>
                      {tournament.completedMatches}/{tournament.totalMatches} matches complete
                    </small>
                    <small>Updated {relativeTime(tournament.updatedAt)}</small>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-bar"
                      style={{
                        width: `${tournament.totalMatches > 0 ? (tournament.completedMatches / tournament.totalMatches) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </article>
              </Link>
            ))}
          </div>

          {filteredTournaments.length > 0 && (
            <div className="pagination-bar">
              <small className="list-count">
                {pageStart}-{pageEnd} of {filteredTournaments.length}
              </small>
              <div className="pagination-actions">
                <button
                  type="button"
                  className="ghost-btn pagination-btn"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage <= 1}
                >
                  Previous
                </button>
                <small className="list-count">
                  Page {currentPage} / {totalPages}
                </small>
                <button
                  type="button"
                  className="ghost-btn pagination-btn"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage >= totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </section>

      {isCreateWarningOpen && (
        <div className="modal-root modal-root-front" role="dialog" aria-modal="true" aria-labelledby="create-warning-modal-title">
          <button
            type="button"
            className="modal-backdrop"
            onClick={() => setIsCreateWarningOpen(false)}
            aria-label="Close modal"
          />
          <div className="modal-card">
            <div className="modal-head">
              <h3 id="create-warning-modal-title">Before You Create</h3>
              <button type="button" className="icon-btn" onClick={() => setIsCreateWarningOpen(false)}>
                x
              </button>
            </div>
            <p className="modal-note">No editing once a tournament starts. If you need changes, delete it and create a new one.</p>
            <div className="wizard-actions">
              <button
                type="button"
                className="ghost-btn participants-add-btn wizard-nav-btn"
                onClick={() => setIsCreateWarningOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  setIsCreateWarningOpen(false);
                  void createTournament();
                }}
              >
                Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="modal-root" role="dialog" aria-modal="true" aria-labelledby="create-modal-title">
          <button
            type="button"
            className="modal-backdrop"
            onClick={() => {
              setCreateStep(0);
              setIsModalOpen(false);
            }}
          />
          <div className="modal-card modal-card-wide">
            <div className="modal-head">
              <h3 id="create-modal-title">Create Tournament</h3>
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  setCreateStep(0);
                  setIsModalOpen(false);
                }}
              >
                x
              </button>
            </div>
            {error && <p className="error-banner">{error}</p>}

            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
              }}
            >
              <div className="wizard-steps" role="tablist" aria-label="Create tournament steps">
                <button type="button" className={`wizard-step ${createStep === 0 ? "active" : ""}`} onClick={() => setCreateStep(0)}>
                  1. Setup
                </button>
                <button
                  type="button"
                  className={`wizard-step ${createStep === 1 ? "active" : ""}`}
                  onClick={() => {
                    if (!canContinue(0)) return;
                    setCreateStep(1);
                  }}
                >
                  2. Participants
                </button>
              </div>

              {createStep === 0 && (
                <>
                  <label>
                    Tournament Name
                    <input value={name} onChange={(event) => setName(event.target.value)} required />
                  </label>

                  <label>
                    Sport / Game Type
                    <select value={gameType} onChange={(event) => setGameType(event.target.value as TournamentGameType)}>
                      <option value="esports">Esports</option>
                      <option value="basketball">Basketball</option>
                      <option value="football">Football</option>
                      <option value="volleyball">Volleyball</option>
                      <option value="badminton">Badminton</option>
                      <option value="tennis">Tennis</option>
                      <option value="chess">Chess</option>
                      <option value="other">Other</option>
                    </select>
                  </label>

                  <label>
                    Format
                    <select value={format} onChange={(event) => setFormat(event.target.value as TournamentFormat)}>
                      <option value="se">Single Elimination</option>
                      <option value="de">Double Elimination</option>
                      <option value="rr_se">Round Robin -&gt; Single Elimination</option>
                      <option value="rr_de">Round Robin -&gt; Double Elimination</option>
                    </select>
                  </label>

                  <label>
                    Participant Mode
                    <select
                      value={participantMode}
                      onChange={(event) => switchParticipantMode(event.target.value as ParticipantMode)}
                    >
                      <option value="simple">Simple</option>
                      <option value="player">Player</option>
                      <option value="team">Team</option>
                    </select>
                  </label>

                  <label>
                    Default Games Per Match
                    <select value={String(defaultBestOf)} onChange={(event) => setDefaultBestOf(Number(event.target.value) as BestOfOption)}>
                      <option value="1">Best of 1</option>
                      <option value="3">Best of 3</option>
                      <option value="5">Best of 5</option>
                      <option value="7">Best of 7</option>
                    </select>
                  </label>

                  <label className="check-row">
                    <input type="checkbox" checked={shuffle} onChange={(event) => setShuffle(event.target.checked)} />
                    Shuffle seeding
                  </label>

                  <p className="modal-note">Default Best-of can be changed per match later in the match update modal.</p>
                </>
              )}

              {createStep === 1 && participantMode === "simple" && (
                <div className="participant-layout-single">
                  <section className="participant-column">
                    <div className="participant-column-head">
                      <strong>Simple Participants</strong>
                      <small className="muted">{simpleParticipants.length} lines</small>
                    </div>

                    <label>
                      One participant per line
                      <textarea
                        rows={12}
                        value={simpleParticipantsText}
                        onChange={(event) => setSimpleParticipantsText(event.target.value)}
                        placeholder={"Apex\nNova\nOrbit"}
                      />
                    </label>
                    <p className="modal-note">Use this mode for quick setup. Minimum 2 unique names.</p>
                  </section>
                </div>
              )}

              {createStep === 1 && participantMode === "player" && (
                <div className="participant-layout-single">
                  <section className="participant-column">
                    <div className="participant-column-head">
                      <strong>Players</strong>
                      <small className="muted">{individuals.length} added</small>
                    </div>

                    <div className="compact-form-grid">
                      <label>
                        Name
                        <input
                          value={individualForm.name}
                          onChange={(event) => setIndividualForm((current) => ({ ...current, name: event.target.value }))}
                          placeholder="Player name"
                        />
                      </label>
                      <label>
                        Jersey
                        <input
                          value={individualForm.jerseyNumber}
                          onChange={(event) => setIndividualForm((current) => ({ ...current, jerseyNumber: event.target.value }))}
                          placeholder="e.g. 10"
                        />
                      </label>
                      <label>
                        Social URL
                        <input
                          type="url"
                          inputMode="url"
                          value={individualForm.socialUrl}
                          onChange={(event) => setIndividualForm((current) => ({ ...current, socialUrl: event.target.value }))}
                          placeholder="https://..."
                        />
                      </label>
                    </div>

                    <div className="compact-actions">
                      <button type="button" className="ghost-btn participants-add-btn" onClick={addIndividual}>
                        Add Player
                      </button>
                    </div>
                  </section>

                  <section className="participant-column">
                    <div className="participant-column-head">
                      <strong>List</strong>
                      <small className="muted">Need at least 2</small>
                    </div>

                    {individuals.length === 0 && <p className="muted">No individuals added yet.</p>}

                    <div className="simple-list">
                      {individuals.map((individual) => (
                        <article key={individual.id} className="simple-list-item">
                          <div className="simple-list-main">
                            <strong>{individual.name}</strong>
                            <small>
                              {individual.jerseyNumber ? `#${individual.jerseyNumber}` : "No jersey"} |{" "}
                              {individual.socialUrl ? "Has social" : "No social"}
                            </small>
                          </div>
                          <button
                            type="button"
                            className="ghost-btn participant-remove-btn"
                            onClick={() => removeIndividual(individual.id)}
                          >
                            Remove
                          </button>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {createStep === 1 && participantMode === "team" && (
                <div className="participant-layout">
                  <section className="participant-column">
                    <div className="participant-column-head">
                      <strong>Teams</strong>
                      <small className="muted">{teams.length} added</small>
                    </div>

                    <div className="participant-block participant-block-form">
                      <div className="participant-block-head">
                        <strong>Add Team</strong>
                      </div>

                      <div className="compact-form-grid compact-form-grid-single">
                        <label>
                          Team Name
                          <input
                            value={teamForm.name}
                            onChange={(event) => setTeamForm((current) => ({ ...current, name: event.target.value }))}
                            placeholder="Team name"
                          />
                        </label>
                        <label>
                          Team Social URL
                          <input
                            type="url"
                            inputMode="url"
                            value={teamForm.socialUrl}
                            onChange={(event) => setTeamForm((current) => ({ ...current, socialUrl: event.target.value }))}
                            placeholder="https://..."
                          />
                        </label>
                      </div>

                      <div className="compact-actions">
                        <button type="button" className="ghost-btn participants-add-btn" onClick={addTeam}>
                          Add Team
                        </button>
                      </div>
                    </div>

                    <div className="participant-divider" />

                    <div className="participant-block participant-block-list">
                      <div className="participant-block-head">
                        <strong>Team List</strong>
                        <small className="muted">Select a team</small>
                      </div>

                      <div className="simple-list">
                        {teams.length === 0 && <p className="muted">No teams added yet.</p>}
                        {teams.map((team) => (
                          <article
                            key={team.id}
                            className={`simple-list-item team-list-item ${selectedTeamId === team.id ? "active" : ""}`}
                            onClick={() => setSelectedTeamId(team.id)}
                          >
                            <div className="simple-list-main">
                              <strong>{team.name}</strong>
                              <small>
                                {team.players.length} players | {team.socialUrl ? "Has social" : "No social"}
                              </small>
                            </div>
                            <button
                              type="button"
                              className="ghost-btn participant-remove-btn"
                              onClick={(event) => {
                                event.stopPropagation();
                                removeTeam(team.id);
                              }}
                            >
                              Remove
                            </button>
                          </article>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className={`participant-column participant-column-player${selectedTeam ? " has-selected-team" : ""}`}>
                    <div className="participant-column-head">
                      <strong>Players</strong>
                      <small className="muted">{selectedTeam ? selectedTeam.name : "Select a team"}</small>
                    </div>

                    {selectedTeam ? (
                      <>
                        <div className="participant-block participant-block-form player-form-block">
                          <div className="participant-block-head">
                            <strong>Add Player</strong>
                          </div>

                          <div className="compact-form-grid">
                            <label>
                              Player Name
                              <input
                                value={playerForm.name}
                                onChange={(event) => setPlayerForm((current) => ({ ...current, name: event.target.value }))}
                                placeholder="Player name"
                              />
                            </label>
                            <label>
                              Jersey
                              <input
                                value={playerForm.jerseyNumber}
                                onChange={(event) => setPlayerForm((current) => ({ ...current, jerseyNumber: event.target.value }))}
                                placeholder="e.g. 7"
                              />
                            </label>
                            <label className="compact-span-2">
                              Social URL
                              <input
                                type="url"
                                inputMode="url"
                                value={playerForm.socialUrl}
                                onChange={(event) => setPlayerForm((current) => ({ ...current, socialUrl: event.target.value }))}
                                placeholder="https://..."
                              />
                            </label>
                          </div>

                          <div className="compact-actions">
                            <button type="button" className="ghost-btn participants-add-btn" onClick={addPlayerToSelectedTeam}>
                              Add Player
                            </button>
                          </div>
                        </div>

                        <div className="participant-divider" />

                        <div className="participant-block participant-block-list player-list-block">
                          <div className="participant-block-head">
                            <strong>Player List</strong>
                            <small className="muted">{selectedTeam.players.length} players</small>
                          </div>

                          <div className="simple-list">
                            {selectedTeam.players.length === 0 && <p className="muted">No players yet for this team.</p>}
                            {selectedTeam.players.map((player) => (
                              <article key={player.id} className="simple-list-item">
                                <div className="simple-list-main">
                                  <strong>{player.name}</strong>
                                  <small>{player.jerseyNumber ? `#${player.jerseyNumber}` : "No jersey"}</small>
                                </div>
                                <button
                                  type="button"
                                  className="ghost-btn participant-remove-btn"
                                  onClick={() => removePlayer(player.id)}
                                >
                                  Remove
                                </button>
                              </article>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="muted participant-empty-state">Select a team from the left to manage players.</p>
                    )}
                  </section>
                </div>
              )}

              <div className="wizard-actions">
                <button
                  type="button"
                  className="ghost-btn participants-add-btn wizard-nav-btn"
                  onClick={handleBackStep}
                  disabled={createStep === 0 || isCreating}
                >
                  Back
                </button>

                {createStep === 0 ? (
                  <button
                    type="button"
                    className="primary-btn wizard-nav-btn"
                    onClick={handleNextStep}
                    disabled={!canContinue(0) || isCreating}
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => setIsCreateWarningOpen(true)}
                    disabled={isCreating || !hasMinimumParticipants}
                  >
                    {isCreating ? "Creating..." : "Create"}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
