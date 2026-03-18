const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
} as const;

export type LogLevel = keyof typeof LEVELS;

export interface LoggerOptions {
  level: LogLevel;
  json: boolean;
}

export class Logger {
  private readonly level: number;
  private readonly json: boolean;

  constructor(options: LoggerOptions) {
    this.level = LEVELS[options.level];
    this.json = options.json;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.write("debug", message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.write("info", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.write("warn", message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.write("error", message, meta);
  }

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVELS[level] < this.level) {
      return;
    }

    const payload = {
      ts: new Date().toISOString(),
      level,
      message,
      ...meta
    };

    if (this.json) {
      console.log(JSON.stringify(payload));
      return;
    }

    const metaString = meta ? ` ${JSON.stringify(meta)}` : "";
    console.log(`[${payload.ts}] ${level.toUpperCase()} ${message}${metaString}`);
  }
}
