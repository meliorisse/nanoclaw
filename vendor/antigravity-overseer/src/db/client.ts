import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { resolveFromRoot } from "../utils/paths.ts";

export class DatabaseClient {
  readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA busy_timeout = 5000;");

    try {
      this.db.exec("PRAGMA journal_mode = WAL;");
    } catch {
      // Another local process may already have the database open.
      // Prefer continuing over failing startup, since busy_timeout is already set.
    }
  }

  prepare(sql: string): StatementSync {
    return this.db.prepare(sql);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  close(): void {
    this.db.close();
  }
}

export function openDatabase(dbPath: string): DatabaseClient {
  return new DatabaseClient(dbPath);
}

export function applySchema(client: DatabaseClient): void {
  const schemaPath = resolveFromRoot("src", "db", "schema.sql");
  const schema = readFileSync(schemaPath, "utf8");
  client.exec(schema);
}
