import { inject, singleton } from "tsyringe";
import { ConfigService } from "../../../config/config.service.ts";
import type { AgentEvent } from "../../../models/index.ts";
import { OrchestratorNotConfiguredError, OrchestratorRequestError } from "../../errors/orchestrator.errors.ts";

export interface EventSink {
  sendEvents(events: AgentEvent[]): Promise<void>;
}

@singleton()
export class OrchestratorClient implements EventSink {
  constructor(@inject(ConfigService) private readonly config: ConfigService) {}

  async sendEvents(events: AgentEvent[]): Promise<void> {
    const { apiUrl, apiToken } = this.config.get().orchestrator;
    if (!apiUrl || !apiToken) {
      throw new OrchestratorNotConfiguredError();
    }
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
      body: JSON.stringify({ events }),
    });
    if (!response.ok) {
      throw new OrchestratorRequestError(response.status);
    }
  }
}
