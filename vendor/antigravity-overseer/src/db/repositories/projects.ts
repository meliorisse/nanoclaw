import type { Project } from "../../types/domain.ts";
import { createId } from "../../utils/ids.ts";
import { nowIso } from "../../utils/time.ts";
import type { DatabaseClient } from "../client.ts";

interface ProjectRow {
  id: string;
  external_project_ref: string;
  name: string;
  last_seen_at: string;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

function mapProjectRow(row: ProjectRow | undefined): Project | undefined {
  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    externalProjectRef: row.external_project_ref,
    name: row.name,
    lastSeenAt: row.last_seen_at,
    metadataJson: row.metadata_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class ProjectsRepository {
  private readonly client: DatabaseClient;

  constructor(client: DatabaseClient) {
    this.client = client;
  }

  upsertByExternalRef(input: { externalProjectRef: string; name: string; metadataJson?: string | null }): Project {
    const timestamp = nowIso();
    this.client
      .prepare(
        `INSERT INTO projects (
          id, external_project_ref, name, last_seen_at, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(external_project_ref) DO UPDATE SET
          name = excluded.name,
          last_seen_at = excluded.last_seen_at,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at`
      )
      .run(
        createId("proj"),
        input.externalProjectRef,
        input.name,
        timestamp,
        input.metadataJson ?? null,
        timestamp,
        timestamp
      );

    return this.getByExternalRef(input.externalProjectRef)!;
  }

  list(): Project[] {
    return (this.client
      .prepare("SELECT * FROM projects ORDER BY last_seen_at DESC, created_at DESC")
      .all() as ProjectRow[]).map((row) => mapProjectRow(row)!);
  }

  getById(id: string): Project | undefined {
    return mapProjectRow(this.client.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined);
  }

  getByExternalRef(externalProjectRef: string): Project | undefined {
    return mapProjectRow(
      this.client
        .prepare("SELECT * FROM projects WHERE external_project_ref = ?")
        .get(externalProjectRef) as ProjectRow | undefined
    );
  }
}
