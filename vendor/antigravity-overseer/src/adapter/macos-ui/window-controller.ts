import type { AppConfig } from "../../config/defaults.ts";
import { nowIso } from "../../utils/time.ts";
import type { Logger } from "../../utils/logger.ts";
import type { WindowSession } from "../core/session.ts";

export class WindowController {
  private readonly config: AppConfig;
  private readonly logger: Logger;

  constructor(
    config: AppConfig,
    logger: Logger
  ) {
    this.config = config;
    this.logger = logger;
  }

  async attach(): Promise<WindowSession> {
    this.logger.info("Attached bootstrap macOS window controller", {
      appName: this.config.appName
    });

    return {
      appName: this.config.appName,
      windowTitle: this.config.windowTitlePattern,
      attachedAt: nowIso(),
      status: "attached"
    };
  }
}
