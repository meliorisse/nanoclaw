import type { AppConfig } from "../config/defaults.ts";

export interface LocalModelRequest {
  prompt: string;
}

export interface LocalModelResponse {
  ok: boolean;
  content: string;
  warning?: string;
}

export class LocalModelClient {
  private readonly config: AppConfig["localModel"];

  constructor(config: AppConfig["localModel"]) {
    this.config = config;
  }

  async complete(request: LocalModelRequest): Promise<LocalModelResponse> {
    if (!this.config.enabled) {
      return {
        ok: false,
        content: "",
        warning: "Local model is disabled. Falling back to deterministic behavior."
      };
    }

    return {
      ok: true,
      content: request.prompt
    };
  }
}
