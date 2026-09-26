import { inject, singleton } from "tsyringe";
import { MonitoringController } from "../../controllers/monitoring.controller.ts";

@singleton()
export class MonitoringHttpHandler {
  constructor(@inject(MonitoringController) private readonly controller: MonitoringController) {}

  getSessions() {
    return this.controller.getSessions();
  }

  getEventStats() {
    return this.controller.getEventStats();
  }

  getErrors() {
    return this.controller.getErrors();
  }
}
