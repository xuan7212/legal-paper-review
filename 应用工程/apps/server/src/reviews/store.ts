import { randomUUID } from "node:crypto";
import {
  blankWorkspace,
  KEY_TTL,
  type Model,
  type Workspace,
  type Round,
  type JobView,
  type CredentialStatus,
} from "../../../../packages/shared/src/domain.js";
import { AppError } from "../errors.js";

export type Job = JobView & {
  controller: AbortController;
  workspaceId: string;
  revision: number;
  baseRound?: string;
  generation: number;
  model?: Model;
  key?: string;
  input: Workspace;
  cache: Map<string, unknown>;
  completedAt?: number;
};
export type Session = {
  id: string;
  workspace: Workspace;
  rounds: Round[];
  jobs: Map<string, Job>;
  idempotency: Map<string, { signature: string; jobId: string }>;
  credentials?: { key: string; model: Model; expiresAt: number };
  generation: number;
  activeAt: number;
  testing?: AbortController;
};

export class Store {
  sessions = new Map<string, Session>();
  constructor(public now: () => number = Date.now) {}
  create() {
    if (this.sessions.size >= 200)
      throw new AppError(
        "CAPACITY",
        "当前试用人数已达上限，请稍后再试",
        503,
        true,
      );
    const session: Session = {
      id: randomUUID(),
      workspace: blankWorkspace(randomUUID()),
      rounds: [],
      jobs: new Map(),
      idempotency: new Map(),
      generation: 0,
      activeAt: this.now(),
    };
    this.sessions.set(session.id, session);
    return session;
  }
  get(id: string) {
    this.sweep();
    const session = this.sessions.get(id);
    if (!session)
      throw new AppError(
        "SESSION_EXPIRED",
        "会话已失效，请重新进入并配置模型",
        401,
      );
    return session;
  }
  clearCredentials(session: Session) {
    session.generation++;
    session.credentials = undefined;
    session.testing?.abort();
    for (const job of session.jobs.values()) {
      if (job.type !== "parse") this.cancel(job);
      job.key = undefined;
    }
  }
  cancel(job: Job) {
    if (job.status === "running" || job.status === "queued") {
      job.status = "cancelled";
      job.stage = "已取消";
      job.controller.abort();
    }
  }
  reset(session: Session) {
    session.testing?.abort();
    session.generation++;
    for (const job of session.jobs.values()) this.cancel(job);
    session.jobs.clear();
    session.idempotency.clear();
    session.workspace = blankWorkspace(randomUUID());
    session.rounds = [];
    session.activeAt = this.now();
  }
  remove(session: Session) {
    this.clearCredentials(session);
    this.reset(session);
    this.sessions.delete(session.id);
  }
  status(session: Session): CredentialStatus {
    const credential = session.credentials;
    return credential
      ? {
          status: "ok",
          model: credential.model,
          masked: `${credential.key.slice(0, 3)}••••••••${credential.key.slice(-4)}`,
          expiresAt: credential.expiresAt,
        }
      : { status: "unconfigured", model: "deepseek-chat", masked: "" };
  }
  sweep() {
    for (const session of this.sessions.values()) {
      if (this.now() - session.activeAt >= KEY_TTL) {
        this.remove(session);
        continue;
      }
      if (session.credentials && session.credentials.expiresAt <= this.now())
        this.clearCredentials(session);
      for (const job of session.jobs.values()) {
        if (job.completedAt && this.now() - job.completedAt > 15 * 60 * 1000)
          job.cache.clear();
      }
    }
  }
}

export function publicJob(job: Job): JobView {
  return {
    metrics: job.metrics,
    id: job.id,
    type: job.type,
    status: job.status,
    stage: job.stage,
    result: job.result,
    error: job.error,
  };
}
