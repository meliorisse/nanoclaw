import { loadConfig } from "../config/config.ts";
import { Logger } from "../utils/logger.ts";
import { ensureRuntimeDirs, resolveFromRoot } from "../utils/paths.ts";
import { applySchema, openDatabase } from "./client.ts";

const config = await loadConfig();
const logger = new Logger(config.logging);

await ensureRuntimeDirs([
  resolveFromRoot(config.evidenceDir),
  resolveFromRoot(config.logsDir),
  resolveFromRoot(config.profilePath)
]);

const db = openDatabase(resolveFromRoot(config.dbPath));
applySchema(db);
logger.info("Database schema applied", { dbPath: resolveFromRoot(config.dbPath) });
db.close();
