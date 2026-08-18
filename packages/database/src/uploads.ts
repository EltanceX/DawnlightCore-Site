import type { Pool, PoolClient } from "pg";
import {
  AuthoringError,
  type MutationContext,
  type ProjectRole,
} from "./authoring.js";

export const preflightQueueName = "dawnlight.preflight.v1" as const;
export const quarantineCleanupQueueName =
  "dawnlight.quarantine.cleanup.v1" as const;
export const preflightDeadLetterQueueName =
  "dawnlight.preflight.dead-letter.v1" as const;
export const loaderValidationQueueName =
  "dawnlight.loader-validation.v1" as const;
export const loaderValidationDeadLetterQueueName =
  "dawnlight.loader-validation.dead-letter.v1" as const;
export const publicationQueueName = "dawnlight.publication.v1" as const;
export const publicationDeadLetterQueueName =
  "dawnlight.publication.dead-letter.v1" as const;

export type UploadStatus =
  | "created"
  | "queued"
  | "inspecting"
  | "passed"
  | "rejected"
  | "infrastructure-error"
  | "expired";

export type PreflightDiagnostic = {
  code: string;
  severity: "error" | "warning";
  path: string | null;
  message: string;
};

export type PreflightManifestEntry = {
  path: string;
  size: number;
  compressedSize: number;
  sha256: string;
};

export type AuthorUpload = {
  id: string;
  projectId: string;
  versionId: string;
  fileName: string;
  expectedSize: number;
  contentType: string;
  status: UploadStatus;
  expiresAt: string;
  objectSize: number | null;
  inputSha256: string | null;
  fileCount: number | null;
  extractedSize: number | null;
  manifest: PreflightManifestEntry[];
  diagnostics: PreflightDiagnostic[];
  createdAt: string;
  updatedAt: string;
};

export type InternalUpload = AuthorUpload & {
  objectKey: string;
  objectEtag: string | null;
};

export type CreateUploadInput = {
  id: string;
  objectKey: string;
  fileName: string;
  expectedSize: number;
  contentType: string;
  expiresAt: Date;
};

export type CompleteUploadEvidence = {
  size: number;
  contentType: string | null;
  etag: string | null;
};

export type PreflightResult = {
  inputSha256: string;
  inputSize: number;
  fileCount: number;
  extractedSize: number;
  manifest: PreflightManifestEntry[];
  diagnostics: PreflightDiagnostic[];
};

export interface UploadDataService {
  createUpload(
    context: MutationContext,
    projectId: string,
    versionId: string,
    input: CreateUploadInput,
  ): Promise<InternalUpload>;
  completeUpload(
    context: MutationContext,
    uploadId: string,
    evidence: CompleteUploadEvidence,
  ): Promise<InternalUpload>;
  getAuthorUpload(actorId: string, uploadId: string): Promise<AuthorUpload>;
  getUploadForCompletion(
    actorId: string,
    uploadId: string,
  ): Promise<InternalUpload>;
  listPendingPreflightUploads(limit?: number): Promise<string[]>;
  markPreflightDispatched(uploadId: string): Promise<void>;
}

export type WorkerUpload = {
  id: string;
  objectKey: string;
  expectedSize: number;
  contentType: string;
  status: UploadStatus;
};

export interface PreflightDataService {
  getWorkerUpload(uploadId: string): Promise<WorkerUpload>;
  beginPreflight(
    uploadId: string,
    workerVersion: string,
    jobId: string,
    attempt: number,
  ): Promise<void>;
  completePreflight(
    uploadId: string,
    result: PreflightResult,
    accepted: boolean,
    failedRetentionSeconds: number,
  ): Promise<void>;
  recordInfrastructureFailure(
    uploadId: string,
    jobId: string,
    attempt: number,
    errorCode: string,
    finalAttempt: boolean,
    failedRetentionSeconds: number,
  ): Promise<void>;
  listCleanupCandidates(limit?: number): Promise<WorkerUpload[]>;
  markUploadExpired(uploadId: string): Promise<void>;
}

type UploadRow = {
  id: string;
  project_id: string;
  project_version_id: string;
  object_key: string;
  original_file_name: string;
  expected_size: string | number;
  expected_content_type: string;
  status: UploadStatus;
  expires_at: Date;
  object_size: string | number | null;
  object_etag: string | null;
  input_sha256: string | null;
  file_count: number | null;
  extracted_size: string | number | null;
  manifest: PreflightManifestEntry[] | null;
  diagnostics: PreflightDiagnostic[] | null;
  created_at: Date;
  updated_at: Date;
};

const json = (value: unknown) => JSON.stringify(value);
const toNumber = (value: string | number | null) =>
  value === null ? null : Number(value);

function mapInternalUpload(row: UploadRow): InternalUpload {
  return {
    id: row.id,
    projectId: row.project_id,
    versionId: row.project_version_id,
    objectKey: row.object_key,
    objectEtag: row.object_etag,
    fileName: row.original_file_name,
    expectedSize: Number(row.expected_size),
    contentType: row.expected_content_type,
    status: row.status,
    expiresAt: row.expires_at.toISOString(),
    objectSize: toNumber(row.object_size),
    inputSha256: row.input_sha256,
    fileCount: row.file_count,
    extractedSize: toNumber(row.extracted_size),
    manifest: row.manifest ?? [],
    diagnostics: row.diagnostics ?? [],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toAuthorUpload(upload: InternalUpload): AuthorUpload {
  const {
    objectKey: _objectKey,
    objectEtag: _objectEtag,
    ...publicUpload
  } = upload;
  return publicUpload;
}

const uploadSelect = `
  select u.*, r.input_sha256, r.file_count, r.extracted_size,
         r.manifest, r.diagnostics
  from upload_sessions u
  left join preflight_runs r on r.upload_id = u.id`;

export class PostgresUploadDataService
  implements UploadDataService, PreflightDataService
{
  constructor(private readonly pool: Pool) {}

  async createUpload(
    context: MutationContext,
    projectId: string,
    versionId: string,
    input: CreateUploadInput,
  ) {
    await this.requireProjectRole(context.actorId, projectId, [
      "owner",
      "maintainer",
    ]);
    return this.withIdempotency(context, "upload.create", async (client) => {
      const version = await client.query(
        `select 1 from author_project_versions
         where id = $1 and project_id = $2 and status in ('draft', 'changes-requested')`,
        [versionId, projectId],
      );
      if (!version.rowCount) {
        throw new AuthoringError(
          "VersionNotFound",
          "草稿版本不存在或不可接收上传。",
          404,
        );
      }
      const created = await client.query<UploadRow>(
        `insert into upload_sessions
         (id, project_id, project_version_id, created_by, object_key,
          original_file_name, expected_size, expected_content_type, status, expires_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'created',$9)
         returning *, null::text as input_sha256, null::integer as file_count,
                   null::bigint as extracted_size, '[]'::jsonb as manifest,
                   '[]'::jsonb as diagnostics`,
        [
          input.id,
          projectId,
          versionId,
          context.actorId,
          input.objectKey,
          input.fileName,
          input.expectedSize,
          input.contentType,
          input.expiresAt,
        ],
      );
      await this.insertAudit(client, context, "upload.create", input.id, {
        projectId,
        versionId,
        expectedSize: input.expectedSize,
      });
      return mapInternalUpload(created.rows[0]!);
    });
  }

  async completeUpload(
    context: MutationContext,
    uploadId: string,
    evidence: CompleteUploadEvidence,
  ) {
    const existing = await this.findInternal(uploadId);
    await this.requireProjectRole(context.actorId, existing.projectId, [
      "owner",
      "maintainer",
    ]);
    return this.withIdempotency(context, "upload.complete", async (client) => {
      const locked = await client.query<UploadRow>(
        `${uploadSelect} where u.id = $1 for update of u`,
        [uploadId],
      );
      const row = locked.rows[0];
      if (!row) {
        throw new AuthoringError("UploadNotFound", "上传会话不存在。", 404);
      }
      if (row.status !== "created") return mapInternalUpload(row);
      if (row.expires_at.getTime() <= Date.now()) {
        await client.query(
          "update upload_sessions set status = 'expired', updated_at = now() where id = $1",
          [uploadId],
        );
        throw new AuthoringError("UploadExpired", "上传会话已过期。", 410);
      }
      if (Number(row.expected_size) !== evidence.size) {
        throw new AuthoringError(
          "UploadSizeMismatch",
          "对象存储报告的文件大小与上传声明不一致。",
          409,
          { expected: Number(row.expected_size), actual: evidence.size },
        );
      }
      if (
        evidence.contentType &&
        evidence.contentType !== row.expected_content_type
      ) {
        throw new AuthoringError(
          "UploadContentTypeMismatch",
          "对象存储报告的 Content-Type 与上传声明不一致。",
          409,
        );
      }
      const completed = await client.query<UploadRow>(
        `update upload_sessions set status = 'queued', completed_at = now(),
           object_size = $2, object_etag = $3, updated_at = now()
         where id = $1
         returning *, null::text as input_sha256, null::integer as file_count,
                   null::bigint as extracted_size, '[]'::jsonb as manifest,
                   '[]'::jsonb as diagnostics`,
        [uploadId, evidence.size, evidence.etag],
      );
      await client.query(
        `insert into upload_job_outbox(upload_id) values ($1)
         on conflict (upload_id) do nothing`,
        [uploadId],
      );
      await this.insertAudit(client, context, "upload.complete", uploadId, {
        projectId: row.project_id,
        versionId: row.project_version_id,
        objectSize: evidence.size,
      });
      return mapInternalUpload(completed.rows[0]!);
    });
  }

  async getAuthorUpload(actorId: string, uploadId: string) {
    const upload = await this.findInternal(uploadId);
    await this.requireProjectRole(actorId, upload.projectId, [
      "owner",
      "maintainer",
      "reviewer",
    ]);
    return toAuthorUpload(upload);
  }

  async getUploadForCompletion(actorId: string, uploadId: string) {
    const upload = await this.findInternal(uploadId);
    await this.requireProjectRole(actorId, upload.projectId, [
      "owner",
      "maintainer",
    ]);
    return upload;
  }

  async listPendingPreflightUploads(limit = 100) {
    const result = await this.pool.query<{ upload_id: string }>(
      `select upload_id from upload_job_outbox
       where dispatched_at is null order by created_at limit $1`,
      [limit],
    );
    return result.rows.map((row) => row.upload_id);
  }

  async markPreflightDispatched(uploadId: string) {
    await this.pool.query(
      `update upload_job_outbox set dispatched_at = now(),
       dispatch_attempts = dispatch_attempts + 1 where upload_id = $1`,
      [uploadId],
    );
  }

  async getWorkerUpload(uploadId: string): Promise<WorkerUpload> {
    const result = await this.pool.query<UploadRow>(
      `${uploadSelect} where u.id = $1`,
      [uploadId],
    );
    const row = result.rows[0];
    if (!row)
      throw new AuthoringError("UploadNotFound", "上传会话不存在。", 404);
    return {
      id: row.id,
      objectKey: row.object_key,
      expectedSize: Number(row.expected_size),
      contentType: row.expected_content_type,
      status: row.status,
    };
  }

  async beginPreflight(
    uploadId: string,
    workerVersion: string,
    jobId: string,
    attempt: number,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const updated = await client.query(
        `update upload_sessions set status = 'inspecting', updated_at = now()
         where id = $1 and status in ('queued', 'inspecting')`,
        [uploadId],
      );
      if (!updated.rowCount) {
        throw new AuthoringError(
          "UploadStateConflict",
          "上传不处于可预检状态。",
          409,
        );
      }
      await client.query(
        `insert into preflight_runs(upload_id, status, worker_version, job_id, attempt)
         values ($1,'inspecting',$2,$3,$4)
         on conflict(upload_id) do update set status = 'inspecting',
           worker_version = excluded.worker_version, job_id = excluded.job_id,
           attempt = excluded.attempt, started_at = now(), completed_at = null,
           error_code = null`,
        [uploadId, workerVersion, jobId, attempt],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async completePreflight(
    uploadId: string,
    result: PreflightResult,
    accepted: boolean,
    failedRetentionSeconds: number,
  ) {
    const status = accepted ? "passed" : "rejected";
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `update preflight_runs set status = $2, input_sha256 = $3,
          input_size = $4, file_count = $5, extracted_size = $6,
          manifest = $7::jsonb, diagnostics = $8::jsonb, completed_at = now()
         where upload_id = $1`,
        [
          uploadId,
          status,
          result.inputSha256,
          result.inputSize,
          result.fileCount,
          result.extractedSize,
          json(result.manifest),
          json(result.diagnostics),
        ],
      );
      await client.query(
        `update upload_sessions set status = $2,
          expires_at = case when $2 = 'rejected'
            then now() + ($3 * interval '1 second') else expires_at end,
          updated_at = now() where id = $1`,
        [uploadId, status, failedRetentionSeconds],
      );
      if (accepted) {
        await client.query(
          `insert into loader_job_outbox(upload_id) values ($1)
           on conflict (upload_id) do update set dispatched_at = null`,
          [uploadId],
        );
        await client.query(
          `update author_project_versions v set status = 'validating', updated_at = now()
           from upload_sessions u
           where u.id = $1 and v.id = u.project_version_id
             and v.status in ('draft', 'changes-requested', 'loader-failed')`,
          [uploadId],
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async recordInfrastructureFailure(
    uploadId: string,
    jobId: string,
    attempt: number,
    errorCode: string,
    finalAttempt: boolean,
    failedRetentionSeconds: number,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `update preflight_runs set status = 'infrastructure-error',
         error_code = $2, completed_at = now() where upload_id = $1`,
        [uploadId, errorCode],
      );
      await client.query(
        `update upload_sessions set status = $2,
          expires_at = case when $3 then now() + ($4 * interval '1 second') else expires_at end,
          updated_at = now() where id = $1`,
        [
          uploadId,
          finalAttempt ? "infrastructure-error" : "queued",
          finalAttempt,
          failedRetentionSeconds,
        ],
      );
      if (finalAttempt) {
        await client.query(
          `insert into preflight_dead_letters(upload_id, job_id, attempt, error_code)
           values ($1,$2,$3,$4)`,
          [uploadId, jobId, attempt, errorCode],
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async listCleanupCandidates(limit = 100) {
    const result = await this.pool.query<UploadRow>(
      `${uploadSelect}
       where u.expires_at <= now()
         and u.status in ('created', 'rejected', 'infrastructure-error')
       order by u.expires_at limit $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      objectKey: row.object_key,
      expectedSize: Number(row.expected_size),
      contentType: row.expected_content_type,
      status: row.status,
    }));
  }

  async markUploadExpired(uploadId: string) {
    await this.pool.query(
      `update upload_sessions set status = 'expired', updated_at = now()
       where id = $1 and status in ('created', 'rejected', 'infrastructure-error')`,
      [uploadId],
    );
  }

  private async findInternal(uploadId: string) {
    const result = await this.pool.query<UploadRow>(
      `${uploadSelect} where u.id = $1`,
      [uploadId],
    );
    if (!result.rows[0]) {
      throw new AuthoringError("UploadNotFound", "上传会话不存在。", 404);
    }
    return mapInternalUpload(result.rows[0]);
  }

  private async requireProjectRole(
    actorId: string,
    projectId: string,
    roles: ProjectRole[],
  ) {
    const result = await this.pool.query<{ role: ProjectRole }>(
      `select m.role from project_memberships m join auth_users u on u.id = m.user_id
       where m.project_id = $1 and m.user_id = $2 and u.status = 'active'`,
      [projectId, actorId],
    );
    if (!result.rows[0] || !roles.includes(result.rows[0].role)) {
      throw new AuthoringError(
        "Forbidden",
        "当前账户没有此项目操作权限。",
        403,
      );
    }
  }

  private async withIdempotency<T>(
    context: MutationContext,
    scope: string,
    action: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [
        `${context.actorId}:${scope}:${context.idempotencyKey}`,
      ]);
      const prior = await client.query<{
        request_hash: string;
        response_body: T;
      }>(
        `select request_hash, response_body from idempotency_keys
         where actor_id = $1 and scope = $2 and idempotency_key = $3
           and expires_at > now()`,
        [context.actorId, scope, context.idempotencyKey],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== context.requestHash) {
          throw new AuthoringError(
            "IdempotencyConflict",
            "同一幂等键已用于不同请求。",
            409,
          );
        }
        await client.query("commit");
        return prior.rows[0].response_body;
      }
      const response = await action(client);
      await client.query(
        `insert into idempotency_keys
         (actor_id, scope, idempotency_key, request_hash, response_status, response_body, expires_at)
         values ($1,$2,$3,$4,200,$5::jsonb,now() + interval '24 hours')`,
        [
          context.actorId,
          scope,
          context.idempotencyKey,
          context.requestHash,
          json(response),
        ],
      );
      await client.query("commit");
      return response;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertAudit(
    client: PoolClient,
    context: MutationContext,
    action: string,
    resourceId: string,
    metadata: Record<string, unknown>,
  ) {
    await client.query(
      `insert into audit_events
       (actor_id, action, resource_type, resource_id, outcome, request_id, metadata)
       values ($1,$2,'upload',$3,'allowed',$4,$5::jsonb)`,
      [context.actorId, action, resourceId, context.requestId, json(metadata)],
    );
  }
}

export function createPostgresUploadDataService(pool: Pool) {
  return new PostgresUploadDataService(pool);
}
