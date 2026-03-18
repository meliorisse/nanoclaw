import type { Logger } from "../../utils/logger.ts";
import type { WindowSession } from "../core/session.ts";

export class Navigation {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async ensureAgentManagerVisible(session: WindowSession): Promise<void> {
    this.logger.debug("Ensuring Agent Manager window is visible", {
      windowTitle: session.windowTitle
    });
  }
}
