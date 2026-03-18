import { readFile } from "node:fs/promises";
import type { AppConfig } from "../../config/defaults.ts";
import { normalizeVisibleText } from "../parsing/normalization.ts";
import { runShellCommand } from "../../utils/shell.ts";

export class Extraction {
  private readonly config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  async getVisibleText(): Promise<string> {
    if (this.config.screenSource.textCommand) {
      const text = await runShellCommand(this.config.screenSource.textCommand);
      return normalizeVisibleText(text);
    }

    if (!this.config.visibleTextPath) {
      return "";
    }

    const text = await readFile(this.config.visibleTextPath, "utf8");
    return normalizeVisibleText(text);
  }
}
