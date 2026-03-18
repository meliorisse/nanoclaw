import type { SnapshotRecord } from "../../types/evidence.ts";
import type { DatabaseClient } from "../../db/client.ts";
import { SnapshotsRepository } from "../../db/repositories/snapshots.ts";

export function persistSnapshot(client: DatabaseClient, snapshot: Omit<SnapshotRecord, "id" | "createdAt">) {
  const repository = new SnapshotsRepository(client);
  return repository.create(snapshot);
}
