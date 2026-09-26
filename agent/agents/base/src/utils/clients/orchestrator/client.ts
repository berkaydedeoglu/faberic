import { inject, singleton } from "tsyringe";
import { ConfigService } from "../../../config/config.service.ts";
import type { AgentEvent } from "../../../models/index.ts";
import {
  GitTokenMissingError,
  OrchestratorNotConfiguredError,
  OrchestratorRequestError,
} from "../../errors/orchestrator.errors.ts";

export interface EventSink {
  sendEvents(events: AgentEvent[]): Promise<void>;
}

export interface GitTokenSource {
  /** A token the orchestrator obtained through the OAuth device flow, for cloning `url`. */
  getGitToken(url: string): Promise<string>;
}

@singleton()
export class OrchestratorClient implements EventSink, GitTokenSource {
  constructor(@inject(ConfigService) private readonly config: ConfigService) {}

  async sendEvents(events: AgentEvent[]): Promise<void> {
    await this.post("events", { events });
  }

  async getGitToken(url: string): Promise<string> {
    const response = await this.post("git/token", { url });
    const body = (await response.json().catch(() => undefined)) as { token?: unknown } | undefined;
    if (typeof body?.token !== "string" || body.token === "") {
      throw new GitTokenMissingError(url);
    }
    return body.token;
  }

  private async post(path: string, body: unknown): Promise<Response> {
    const { apiUrl, apiToken } = this.config.get().orchestrator;
    if (!apiUrl || !apiToken) {
      throw new OrchestratorNotConfiguredError();
    }
    const response = await fetch(`${apiUrl.replace(/\/+$/, "")}/${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new OrchestratorRequestError(path, response.status);
    }
    return response;
  }
}
