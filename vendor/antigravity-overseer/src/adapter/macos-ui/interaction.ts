import { appendFile } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../../config/defaults.ts";
import type { Logger } from "../../utils/logger.ts";
import { AdapterNotReadyError } from "../core/errors.ts";

export class Interaction {
  private readonly config: AppConfig;
  private readonly logger: Logger;

  constructor(
    config: AppConfig,
    logger: Logger
  ) {
    this.config = config;
    this.logger = logger;
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.config.writeControls.writesEnabled) {
      throw new AdapterNotReadyError("Writes are disabled. Refusing to send a message without visible confirmation hooks.");
    }

    const outboxPath = path.resolve(this.config.profilePath, "outbox.log");
    await appendFile(outboxPath, `${new Date().toISOString()} ${text}\n`, "utf8");
    this.logger.warn("Stub write path used for send_message", { outboxPath });
  }
}
