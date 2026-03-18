import path from "node:path";
import { mkdir } from "node:fs/promises";

const REPO_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  ".."
);

export function resolveFromRoot(...segments: string[]): string {
  return path.resolve(REPO_ROOT, ...segments);
}

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function ensureRuntimeDirs(paths: string[]): Promise<void> {
  await Promise.all(paths.map((dirPath) => ensureDir(dirPath)));
}
