import path from "node:path";
import { writeFile } from "node:fs/promises";
import type { AppConfig } from "../../config/defaults.ts";
import { runShellCommand, shellEscape } from "../../utils/shell.ts";

export class Screenshots {
  private readonly config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  async capture(label: string, visibleText: string): Promise<string> {
    if (!this.config.legacyUi.enabled) {
      const fileName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${label}.txt`;
      const fullPath = path.resolve(this.config.evidenceDir, fileName);
      await writeFile(fullPath, visibleText || "[no visible text captured]\n", "utf8");
      return fullPath;
    }

    if (this.config.screenSource.screenshotCommand) {
      const fileName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${label}.png`;
      const fullPath = path.resolve(this.config.evidenceDir, fileName);
      const command = this.config.screenSource.screenshotCommand.includes("{output}")
        ? this.config.screenSource.screenshotCommand.replaceAll("{output}", shellEscape(fullPath))
        : `${this.config.screenSource.screenshotCommand} ${shellEscape(fullPath)}`;

      await runShellCommand(command);
      return fullPath;
    }

    const fileName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${label}.txt`;
    const fullPath = path.resolve(this.config.evidenceDir, fileName);
    await writeFile(fullPath, visibleText || "[no visible text captured]\n", "utf8");
    return fullPath;
  }
}
