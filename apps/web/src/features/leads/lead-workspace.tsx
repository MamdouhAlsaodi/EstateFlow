"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiClient } from "../../lib/api-client/index";
import type {
  LeadTaskDto,
  LeadWorkspaceResponse,
  TimelineEventType,
} from "../../lib/api-client/leads";
import type { SessionCsrfProvider } from "../../lib/api-client/session";
import { formatDate, formatDateTime, useT } from "../../i18n";
import {
  getLeadBoardErrorState,
  isLeadMutationSessionRejection,
} from "./lead-board-model";
import styles from "./lead-board.module.css";

type Props = Readonly<{
  organizationId: string;
  leadId: string;
  opener: HTMLButtonElement | null;
  apiClient: ApiClient;
  sessionCsrfProvider: SessionCsrfProvider;
  onClose: () => void;
}>;

type Command =
  | "note"
  | "task"
  | "close-won"
  | "close-lost"
  | `complete:${string}`
  | `reschedule:${string}`;
const CLOSEABLE_STAGES = new Set(["QUALIFIED", "NURTURING"]);
const TERMINAL_STAGES = new Set(["CLOSED_WON", "CLOSED_LOST"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

/**
 * EF-630 — timeline labels come from the catalog; the ad-hoc `Intl`
 * formatter was replaced by the shared locale-aware formatters.
 */
function timelineLabelKey(type: TimelineEventType) {
  return `leads.timeline.${type}` as const;
}

function toUtcIso(value: string): string | null {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

export function LeadWorkspace({
  organizationId,
  leadId,
  opener,
  apiClient,
  sessionCsrfProvider,
  onClose,
}: Props) {
  const t = useT();
  const [workspace, setWorkspace] = useState<LeadWorkspaceResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [pending, setPending] = useState<Command | null>(null);
  const [commandError, setCommandError] = useState<unknown>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueAt, setTaskDueAt] = useState("");
  const [rescheduleDueAt, setRescheduleDueAt] = useState<
    Record<string, string>
  >({});
  const [propertyId, setPropertyId] = useState("");
  const [brokerId, setBrokerId] = useState("");
  const [lostReason, setLostReason] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setWorkspace(
        await apiClient.getLeadWorkspace({ organizationId, leadId }),
      );
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [apiClient, leadId, organizationId]);

  useEffect(() => {
    void reload();
  }, [reload, retryKey]);
  useEffect(
    () => () => {
      opener?.focus();
    },
    [opener],
  );

  const close = useCallback(() => {
    onClose();
    opener?.focus();
  }, [onClose, opener]);

  const runCommand = useCallback(
    async (
      command: Command,
      operation: (csrfToken: string) => Promise<unknown>,
      reset: () => void,
    ) => {
      if (pending === command) return;
      setPending(command);
      setCommandError(null);
      setValidationError(null);
      try {
        const csrfToken = await sessionCsrfProvider.getToken();
        await operation(csrfToken);
        reset();
        await reload();
      } catch (caught) {
        if (isLeadMutationSessionRejection(caught)) sessionCsrfProvider.clear();
        setCommandError(caught);
      } finally {
        setPending(null);
      }
    },
    [pending, reload, sessionCsrfProvider],
  );

  const errorState = error ? getLeadBoardErrorState(error) : null;
  const commandState = commandError
    ? getLeadBoardErrorState(commandError, { mutation: true })
    : null;
  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  if (loading)
    return (
      <WorkspaceShell onClose={close} onKeyDown={handleKeyDown}>
        <p role="status">{t("leads.workspace.loading")}</p>
      </WorkspaceShell>
    );
  if (errorState)
    return (
      <WorkspaceShell onClose={close} onKeyDown={handleKeyDown}>
        <p role="alert">{t(errorState.titleKey)}</p>
        <p>{t(errorState.descriptionKey)}</p>
        <button
          className="button button-secondary"
          onClick={() => setRetryKey((key) => key + 1)}
          type="button"
        >
          {t("leads.board.retry")}
        </button>
      </WorkspaceShell>
    );
  if (!workspace) return null;

  const { lead, timeline, notes, tasks } = workspace;
  const isTerminalStage = TERMINAL_STAGES.has(lead.stage);
  const isCloseable = CLOSEABLE_STAGES.has(lead.stage);
  return (
    <WorkspaceShell onClose={close} onKeyDown={handleKeyDown}>
      <header className={styles.workspaceHeader}>
        <div>
          <p className="eyebrow">{t("leads.workspace.eyebrow")}</p>
          <h2>{t("leads.workspace.title")}</h2>
          <p>{lead.nextAction}</p>
        </div>
        <button
          aria-label={t("leads.workspace.closeAria")}
          className="button button-secondary"
          onClick={close}
          type="button"
        >
          {t("leads.workspace.close")}
        </button>
      </header>
      <dl className={styles.workspaceSummary}>
        <div>
          <dt>{t("leads.workspace.dtStage")}</dt>
          <dd>{lead.stage}</dd>
        </div>
        <div>
          <dt>{t("leads.workspace.dtSource")}</dt>
          <dd>{lead.source}</dd>
        </div>
        <div>
          <dt>{t("leads.workspace.dtNextAction")}</dt>
          <dd>{lead.nextAction}</dd>
        </div>
      </dl>
      <section aria-labelledby="workspace-timeline">
        <h3 id="workspace-timeline">{t("leads.workspace.timeline")}</h3>
        <ol className={styles.workspaceList}>
          {timeline.items.map((event) => (
            <li key={event.id}>
              <strong>{t(timelineLabelKey(event.type))}</strong>
              <time dateTime={event.occurredAt}>
                {formatDateTime(event.occurredAt)}
              </time>
            </li>
          ))}
        </ol>
        {timeline.items.length === 0 && (
          <p>{t("leads.workspace.timelineEmpty")}</p>
        )}
      </section>
      {isCloseable && (
        <section aria-labelledby="workspace-close">
          <h3 id="workspace-close">{t("leads.workspace.closeSection")}</h3>
          <div className={styles.closeSection}>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!isUuid(propertyId) || !isUuid(brokerId)) {
                  setValidationError(t("leads.workspace.uuidError"));
                  return;
                }
                void runCommand(
                  "close-won",
                  (csrfToken) =>
                    apiClient.closeLeadWon({
                      organizationId,
                      leadId,
                      expectedVersion: lead.version,
                      csrfToken,
                      propertyId: propertyId.trim(),
                      brokerId: brokerId.trim(),
                    }),
                  () => {
                    setPropertyId("");
                    setBrokerId("");
                  },
                );
              }}
            >
              <h4>{t("leads.workspace.closeWon")}</h4>
              <label htmlFor="lead-close-property">
                {t("leads.workspace.propertyIdLabel")}
              </label>
              <input
                id="lead-close-property"
                required
                inputMode="text"
                value={propertyId}
                onChange={(event) => setPropertyId(event.target.value)}
              />
              <label htmlFor="lead-close-broker">
                {t("leads.workspace.brokerIdLabel")}
              </label>
              <input
                id="lead-close-broker"
                required
                inputMode="text"
                value={brokerId}
                onChange={(event) => setBrokerId(event.target.value)}
              />
              <button
                className="button button-primary"
                disabled={pending === "close-won"}
                type="submit"
              >
                {pending === "close-won"
                  ? t("leads.workspace.closeWonPending")
                  : t("leads.workspace.closeWon")}
              </button>
            </form>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!lostReason.trim()) {
                  setValidationError(t("leads.workspace.lostReasonError"));
                  return;
                }
                void runCommand(
                  "close-lost",
                  (csrfToken) =>
                    apiClient.closeLeadLost({
                      organizationId,
                      leadId,
                      expectedVersion: lead.version,
                      csrfToken,
                      reason: lostReason.trim(),
                    }),
                  () => setLostReason(""),
                );
              }}
            >
              <h4>{t("leads.workspace.closeLost")}</h4>
              <label htmlFor="lead-close-reason">
                {t("leads.workspace.closeLostReasonLabel")}
              </label>
              <textarea
                id="lead-close-reason"
                required
                value={lostReason}
                onChange={(event) => setLostReason(event.target.value)}
              />
              <button
                className="button button-secondary"
                disabled={pending === "close-lost"}
                type="submit"
              >
                {pending === "close-lost"
                  ? t("leads.workspace.closeWonPending")
                  : t("leads.workspace.closeLost")}
              </button>
            </form>
          </div>
        </section>
      )}
      {!isTerminalStage && (
        <section aria-labelledby="workspace-notes">
          <h3 id="workspace-notes">{t("leads.workspace.notes")}</h3>
          <ul className={styles.workspaceList}>
            {notes.map((note) => (
              <li key={note.id}>
                <p>{note.body}</p>
                <time dateTime={note.createdAt}>
                  {formatDateTime(note.createdAt)}
                </time>
              </li>
            ))}
          </ul>
          {notes.length === 0 && <p>{t("leads.workspace.notesEmpty")}</p>}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void runCommand(
                "note",
                (csrfToken) =>
                  apiClient.createLeadNote({
                    organizationId,
                    leadId,
                    body: noteBody,
                    csrfToken,
                  }),
                () => setNoteBody(""),
              );
            }}
          >
            <label htmlFor="lead-note-body">
              {t("leads.workspace.noteBodyLabel")}
            </label>
            <textarea
              id="lead-note-body"
              required
              value={noteBody}
              onChange={(event) => setNoteBody(event.target.value)}
            />
            <button
              className="button button-primary"
              disabled={pending === "note"}
              type="submit"
            >
              {pending === "note"
                ? t("leads.board.saving")
                : t("leads.workspace.addNote")}
            </button>
          </form>
        </section>
      )}
      {!isTerminalStage && (
        <section aria-labelledby="workspace-tasks">
          <h3 id="workspace-tasks">{t("leads.workspace.tasks")}</h3>
          <ul className={styles.workspaceList}>
            {tasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                pending={pending}
                dueAt={rescheduleDueAt[task.id] ?? ""}
                setDueAt={(value) =>
                  setRescheduleDueAt((current) => ({
                    ...current,
                    [task.id]: value,
                  }))
                }
                onComplete={() =>
                  void runCommand(
                    `complete:${task.id}`,
                    (csrfToken) =>
                      apiClient.completeLeadTask({
                        organizationId,
                        leadId,
                        taskId: task.id,
                        expectedVersion: task.version,
                        csrfToken,
                      }),
                    () => undefined,
                  )
                }
                onReschedule={(dueAt) =>
                  void runCommand(
                    `reschedule:${task.id}`,
                    (csrfToken) =>
                      apiClient.rescheduleLeadTask({
                        organizationId,
                        leadId,
                        taskId: task.id,
                        dueAt,
                        expectedVersion: task.version,
                        csrfToken,
                      }),
                    () => undefined,
                  )
                }
                onInvalidDueAt={() =>
                  setValidationError(t("leads.workspace.dueAtInvalid"))
                }
              />
            ))}
          </ul>
          {tasks.length === 0 && <p>{t("leads.workspace.tasksEmpty")}</p>}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const dueAt = toUtcIso(taskDueAt);
              if (!dueAt) {
                setValidationError(t("leads.workspace.dueAtInvalid"));
                return;
              }
              void runCommand(
                "task",
                (csrfToken) =>
                  apiClient.createLeadTask({
                    organizationId,
                    leadId,
                    title: taskTitle,
                    dueAt,
                    csrfToken,
                  }),
                () => {
                  setTaskTitle("");
                  setTaskDueAt("");
                },
              );
            }}
          >
            <label htmlFor="lead-task-title">
              {t("leads.workspace.taskTitleLabel")}
            </label>
            <input
              id="lead-task-title"
              required
              value={taskTitle}
              onChange={(event) => setTaskTitle(event.target.value)}
            />
            <label htmlFor="lead-task-due">
              {t("leads.workspace.taskDueLabel")}
            </label>
            <input
              id="lead-task-due"
              required
              type="datetime-local"
              value={taskDueAt}
              onChange={(event) => setTaskDueAt(event.target.value)}
            />
            <button
              className="button button-primary"
              disabled={pending === "task"}
              type="submit"
            >
              {pending === "task"
                ? t("leads.board.saving")
                : t("leads.workspace.addTask")}
            </button>
          </form>
        </section>
      )}
      {validationError && <p role="alert">{validationError}</p>}
      {commandState && (
        <div role="alert">
          <p>{t(commandState.titleKey)}</p>
          <p>{t(commandState.descriptionKey)}</p>
          {commandState.kind === "stale" && (
            <button
              className="button button-secondary"
              onClick={() => {
                setCommandError(null);
                void reload();
              }}
              type="button"
            >
              {t("leads.board.reload")}
            </button>
          )}
          {commandState.kind === "csrf" && (
            <button
              className="button button-secondary"
              onClick={() => {
                setCommandError(null);
                void sessionCsrfProvider.getToken();
              }}
              type="button"
            >
              {t("leads.board.reacquireSession")}
            </button>
          )}
        </div>
      )}
    </WorkspaceShell>
  );
}

function TaskItem({
  task,
  pending,
  dueAt,
  setDueAt,
  onComplete,
  onReschedule,
  onInvalidDueAt,
}: Readonly<{
  task: LeadTaskDto;
  pending: Command | null;
  dueAt: string;
  setDueAt: (value: string) => void;
  onComplete: () => void;
  onReschedule: (dueAt: string) => void;
  onInvalidDueAt: () => void;
}>) {
  const t = useT();
  return (
    <li>
      <strong>{task.title}</strong>
      <span>
        {formatDate(task.dueAt)} ·{" "}
        {task.status === "OPEN"
          ? t("leads.workspace.taskOpen")
          : t("leads.workspace.taskCompleted")}
      </span>
      {task.status === "OPEN" && (
        <div className={styles.taskActions}>
          <button
            className="button button-secondary"
            disabled={pending === `complete:${task.id}`}
            onClick={onComplete}
            type="button"
          >
            {pending === `complete:${task.id}`
              ? t("leads.board.saving")
              : t("leads.workspace.completeTask")}
          </button>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const nextDueAt = toUtcIso(dueAt);
              if (!nextDueAt) {
                onInvalidDueAt();
                return;
              }
              onReschedule(nextDueAt);
            }}
          >
            <label htmlFor={`reschedule-${task.id}`}>
              {t("leads.workspace.newDueLabel")}
            </label>
            <input
              id={`reschedule-${task.id}`}
              required
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
            <button
              className="button button-secondary"
              disabled={pending === `reschedule:${task.id}`}
              type="submit"
            >
              {pending === `reschedule:${task.id}`
                ? t("leads.board.saving")
                : t("leads.workspace.reschedule")}
            </button>
          </form>
        </div>
      )}
    </li>
  );
}

function WorkspaceShell({
  children,
  onClose,
  onKeyDown,
}: Readonly<{
  children: React.ReactNode;
  onClose: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
}>) {
  const t = useT();
  return (
    <section
      aria-labelledby="workspace-title"
      className={styles.workspace}
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      <div className={styles.workspaceTop}>
        <h2 id="workspace-title">{t("leads.workspace.selectedTitle")}</h2>
        <button
          aria-label={t("leads.workspace.closeAria")}
          className="button button-secondary"
          onClick={onClose}
          type="button"
        >
          {t("leads.workspace.close")}
        </button>
      </div>
      {children}
    </section>
  );
}
