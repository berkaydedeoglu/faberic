import { inject, singleton } from "tsyringe";
import { MonitoringController } from "../../controllers/monitoring.controller.ts";
import { toJson } from "../format.ts";

@singleton()
export class MonitoringCliHandler {
  constructor(@inject(MonitoringController) private readonly controller: MonitoringController) {}

  sessions(): string {
    return toJson(this.controller.getSessions());
  }

  events(): string {
    return toJson(this.controller.getEventStats());
  }

  async errors(): Promise<string> {
    const { file, log } = await this.controller.getErrors();
    return log === "" ? `No errors in ${file}.` : `Errors in ${file}, most recent last:\n${log}`;
  }
}
