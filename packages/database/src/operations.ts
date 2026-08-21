import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { AuthoringError, type MutationContext } from "./authoring.js";

export const downloadRetentionQueueName =
  "dawnlight.download-retention.v1" as const;
export const takedownEvidenceQueueName =
  "dawnlight.takedown-evidence.v1" as const;

export type TakedownCategory =
  | "malicious-package"
  | "credential-exposure"
  | "copyright"
  | "legal"
  | "security";

export type TakedownDecision = {
  id: string;
  versionId: string;
  category: TakedownCategory;
  publicNotice: string | null;
  publicUrl: string;
  blockedAt: string;
  evidenceStatus: "pending" | "retained" | "failed";
};

export type PublishedArtifactAccess = {
  objectKey: string;
  fileName: string;
  size: number;
  sha256: string;
  disposition: "available" | "withdrawn";
};

export type TakedownEvidenceCandidate = {
  decisionId: string;
  sourceObjectKey: string;
  evidenceObjectKey: string;
  sha256: string;
  size: number;
};

export type DownloadResolution = {
  artifactId: string;
  projectVersionId: string;
  url: string;
  fileName: string;
  size: number;
  sha256: string;
};

export type DownloadEventInput = {
  eventId: string | null;
  edgeRegion: string;
  sourceClass: "direct" | "referral" | "client" | "unknown";
};

export type OperationsOverview = {
  period: { from: string; to: string };
  downloads: { success: number; errors: number; uniqueArtifacts: number };
  topArtifacts: Array<{
    artifactId: string;
    fileName: string;
    projectSlug: string | null;
    count: number;
  }>;
  loader: Record<string, number>;
  validationFailureRate: number | null;
  queues: Record<string, number>;
  reviewQueue: number;
  downloadErrors: Array<{ code: string; count: number }>;
  storage: {
    publishedObjects: number;
    publishedBytes: number;
    quarantineObjects: number;
    quarantineExpectedBytes: number;
    capacityBytes: number | null;
  };
};

export type OperationsReport = {
  id: string;
  resourceId: string | null;
  contact: string;
  reason: string;
  status: string;
  createdAt: string;
};

export interface OperationsDataService {
  resolveDownload(
    artifactId: string,
    input: DownloadEventInput,
  ): Promise<DownloadResolution>;
  recordDownloadError(
    artifactId: string | null,
    input: DownloadEventInput,
    statusCode: number,
    errorCode: string,
  ): Promise<void>;
  getOverview(actorId: string, days?: number): Promise<OperationsOverview>;
  createReport(input: {
    resourceId: string | null;
    contact: string;
    reason: string;
  }): Promise<OperationsReport>;
  listReports(actorId: string, status?: string): Promise<OperationsReport[]>;
  resolveReport(
    context: MutationContext,
    reportId: string,
    status: "in-review" | "resolved" | "rejected",
    reason: string,
  ): Promise<OperationsReport>;
  withdrawVersion(
    context: MutationContext,
    versionId: string,
    reason: string,
  ): Promise<void>;
  takedownVersion(
    context: MutationContext,
    versionId: string,
    input: {
      category: TakedownCategory;
      privateReason: string;
      publicNotice: string | null;
    },
  ): Promise<TakedownDecision>;
  resolvePublishedArtifact(objectKey: string): Promise<PublishedArtifactAccess>;
  listPendingTakedownEvidence(): Promise<TakedownEvidenceCandidate[]>;
  getTakedownEvidenceCandidate(
    decisionId: string,
  ): Promise<TakedownEvidenceCandidate | null>;
  markTakedownEvidenceDispatched(decisionId: string): Promise<void>;
  completeTakedownEvidence(
    decisionId: string,
    evidenceObjectKey: string,
  ): Promise<void>;
  recordTakedownEvidenceFailure(
    decisionId: string,
    failureSummary: string,
    finalAttempt: boolean,
  ): Promise<void>;
  moderateProject(
    context: MutationContext,
    projectId: string,
    action: "hide" | "unhide" | "ban" | "unban",
    reason: string,
  ): Promise<void>;
  purgeExpiredDownloadEvents(retentionDays: number): Promise<number>;
}

type ReportRow = {
  id: string;
  resource_id: string | null;
  contact: string;
  reason: string;
  status: string;
  created_at: Date;
};

function mapReport(row: ReportRow): OperationsReport {
  return {
    id: row.id,
    resourceId: row.resource_id,
    contact: row.contact,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

const eventInput = (input: DownloadEventInput) => [
  input.eventId
    ? createHash("sha256").update(input.eventId).digest("hex")
    : null,
  input.edgeRegion.slice(0, 32) || "unknown",
  input.sourceClass,
];

export class PostgresOperationsDataService implements OperationsDataService {
  constructor(private readonly pool: Pool) {}

  async resolveDownload(artifactId: string, input: DownloadEventInput) {
    const result = await this.pool.query<{
      id: string;
      project_version_id: string;
      download_url: string;
      file_name: string;
      size: string | number;
      sha256: string;
    }>(
      `select id, project_version_id, download_url, file_name, size, sha256
       from directory_artifacts where id = $1 and status = 'available'`,
      [artifactId],
    );
    const row = result.rows[0];
    if (!row) {
      await this.recordDownloadError(null, input, 404, "ArtifactNotFound");
      throw new AuthoringError(
        "ArtifactNotFound",
        "下载 artifact 不存在或已撤回。",
        404,
      );
    }
    await this.pool.query(
      `insert into download_events
       (event_id, bucket, artifact_id, project_version_id, edge_region,
        source_class, outcome, status_code)
       values ($1,date_trunc('hour', now()),$2,$3,$4,$5,'success',302)
       on conflict do nothing`,
      [
        ...eventInput(input).slice(0, 1),
        row.id,
        row.project_version_id,
        ...eventInput(input).slice(1),
      ],
    );
    return {
      artifactId: row.id,
      projectVersionId: row.project_version_id,
      url: row.download_url,
      fileName: row.file_name,
      size: Number(row.size),
      sha256: row.sha256,
    };
  }

  async recordDownloadError(
    artifactId: string | null,
    input: DownloadEventInput,
    statusCode: number,
    errorCode: string,
  ) {
    await this.pool.query(
      `insert into download_events
       (event_id, bucket, artifact_id, edge_region, source_class, outcome,
        status_code, error_code)
       values ($1,date_trunc('hour', now()),$2,$3,$4,'error',$5,$6)
       on conflict do nothing`,
      [
        input.eventId,
        artifactId,
        input.edgeRegion.slice(0, 32) || "unknown",
        input.sourceClass,
        statusCode,
        errorCode,
      ],
    );
  }

  async getOverview(actorId: string, days = 7) {
    await this.requireAdmin(actorId);
    const periodDays = Math.min(Math.max(days, 1), 31);
    const [downloads, topArtifacts, loader, queues, review, errors, storage] =
      await Promise.all([
        this.pool.query<{
          success: string;
          errors: string;
          unique_artifacts: string;
        }>(
          `select count(*) filter (where outcome = 'success') as success,
             count(*) filter (where outcome = 'error') as errors,
             count(distinct artifact_id) filter (where outcome = 'success') as unique_artifacts
           from download_events where bucket >= now() - ($1 || ' days')::interval`,
          [periodDays],
        ),
        this.pool.query<{
          artifact_id: string;
          file_name: string;
          project_slug: string | null;
          count: string;
        }>(
          `select e.artifact_id, max(a.file_name) as file_name,
             max(p.slug) as project_slug, count(*) as count
           from download_events e
           join directory_artifacts a on a.id = e.artifact_id
           join directory_project_versions v on v.id = a.project_version_id
           join directory_projects p on p.id = v.project_id
           where e.outcome = 'success' and e.bucket >= now() - ($1 || ' days')::interval
           group by e.artifact_id order by count(*) desc limit 10`,
          [periodDays],
        ),
        this.pool.query<{ status: string; count: string }>(
          `select status, count(*) from loader_validation_runs
           where created_at >= now() - ($1 || ' days')::interval group by status`,
          [periodDays],
        ),
        this.pool.query<{ queue: string; count: string }>(
          `select 'preflight' as queue, count(*) from upload_job_outbox where dispatched_at is null
           union all select 'loader', count(*) from loader_job_outbox where dispatched_at is null
           union all select 'publication', count(*) from publish_job_outbox where dispatched_at is null
           union all select 'review', count(*) from review_submissions where status = 'awaiting-review'
           union all select 'takedown-evidence', count(*) from takedown_evidence_outbox
             where status in ('pending','failed')`,
        ),
        this.pool.query<{ count: string }>(
          "select count(*) from review_submissions where status = 'awaiting-review'",
        ),
        this.pool.query<{ code: string; count: string }>(
          `select coalesce(error_code, 'unknown') as code, count(*)
           from download_events where outcome = 'error'
             and bucket >= now() - interval '24 hours'
           group by error_code order by count(*) desc limit 10`,
        ),
        this.pool.query<{
          published_objects: string;
          published_bytes: string;
          quarantine_objects: string;
          quarantine_expected_bytes: string;
        }>(
          `select
             (select count(*) from published_artifacts where status = 'available') as published_objects,
             (select coalesce(sum(size), 0) from published_artifacts where status = 'available') as published_bytes,
             (select count(*) from upload_sessions where status in ('created','queued','inspecting','passed')) as quarantine_objects,
             (select coalesce(sum(expected_size), 0) from upload_sessions where status in ('created','queued','inspecting','passed')) as quarantine_expected_bytes`,
        ),
      ]);
    const period = {
      from: new Date(Date.now() - periodDays * 86400000).toISOString(),
      to: new Date().toISOString(),
    };
    const loaderCounts = Object.fromEntries(
      loader.rows.map((row) => [row.status, Number(row.count)]),
    );
    const validationFailures =
      (loaderCounts["loader-failed"] ?? 0) +
      (loaderCounts["security-failed"] ?? 0) +
      (loaderCounts["timed-out"] ?? 0);
    const completedValidations =
      validationFailures + (loaderCounts["loader-passed"] ?? 0);
    return {
      period,
      downloads: {
        success: Number(downloads.rows[0]?.success ?? 0),
        errors: Number(downloads.rows[0]?.errors ?? 0),
        uniqueArtifacts: Number(downloads.rows[0]?.unique_artifacts ?? 0),
      },
      topArtifacts: topArtifacts.rows.map((row) => ({
        artifactId: row.artifact_id,
        fileName: row.file_name,
        projectSlug: row.project_slug,
        count: Number(row.count),
      })),
      loader: loaderCounts,
      validationFailureRate:
        completedValidations > 0
          ? validationFailures / completedValidations
          : null,
      queues: Object.fromEntries(
        queues.rows.map((row) => [row.queue, Number(row.count)]),
      ),
      reviewQueue: Number(review.rows[0]?.count ?? 0),
      downloadErrors: errors.rows.map((row) => ({
        code: row.code,
        count: Number(row.count),
      })),
      storage: {
        publishedObjects: Number(storage.rows[0]?.published_objects ?? 0),
        publishedBytes: Number(storage.rows[0]?.published_bytes ?? 0),
        quarantineObjects: Number(storage.rows[0]?.quarantine_objects ?? 0),
        quarantineExpectedBytes: Number(
          storage.rows[0]?.quarantine_expected_bytes ?? 0,
        ),
        capacityBytes: null,
      },
    } satisfies OperationsOverview;
  }

  async createReport(input: {
    resourceId: string | null;
    contact: string;
    reason: string;
  }) {
    const result = await this.pool.query<ReportRow>(
      `insert into account_operation_requests
       (request_type, status, contact, reason, resource_id)
       values ('copyright-complaint','received',$1,$2,$3)
       returning id, resource_id, contact, reason, status, created_at`,
      [
        input.contact.slice(0, 320),
        input.reason.slice(0, 4000),
        input.resourceId?.slice(0, 160) ?? null,
      ],
    );
    return mapReport(result.rows[0]!);
  }

  async listReports(actorId: string, status?: string) {
    await this.requireAdmin(actorId);
    const result = await this.pool.query<ReportRow>(
      `select id, resource_id, contact, reason, status, created_at
       from account_operation_requests where request_type = 'copyright-complaint'
       and ($1::text is null or status = $1) order by created_at desc limit 100`,
      [status ?? null],
    );
    return result.rows.map(mapReport);
  }

  async resolveReport(
    context: MutationContext,
    reportId: string,
    status: "in-review" | "resolved" | "rejected",
    reason: string,
  ) {
    await this.requireAdmin(context.actorId);
    return this.withIdempotency(
      context,
      "ops.report.resolve",
      async (client) => {
        const result = await client.query<ReportRow>(
          `update account_operation_requests set status = $2,
           resolved_at = case when $2 in ('resolved','rejected') then now() else null end,
           reason = reason || E'\\n\\n运营备注：' || $3
         where id = $1 and request_type = 'copyright-complaint'
         returning id, resource_id, contact, reason, status, created_at`,
          [reportId, status, reason.slice(0, 4000)],
        );
        if (!result.rows[0])
          throw new AuthoringError("ReportNotFound", "举报记录不存在。", 404);
        await this.audit(
          client,
          context,
          "report.resolve",
          "report",
          reportId,
          {
            status,
          },
        );
        return mapReport(result.rows[0]);
      },
    );
  }

  async withdrawVersion(
    context: MutationContext,
    versionId: string,
    reason: string,
  ) {
    await this.requireAdmin(context.actorId);
    await this.withIdempotency(
      context,
      "ops.version.withdraw",
      async (client) => {
        const changed = await client.query<{ project_id: string }>(
          `update author_project_versions set status = 'withdrawn', withdrawn_at = now(), updated_at = now()
         where id = $1 and status = 'published' returning project_id`,
          [versionId],
        );
        if (!changed.rows[0])
          throw new AuthoringError(
            "PublishedVersionNotFound",
            "没有可撤回的已发布版本。",
            409,
          );
        await client.query(
          "update published_artifacts set status = 'withdrawn', withdrawn_at = now() where project_version_id = $1",
          [versionId],
        );
        await client.query(
          "update review_submissions set status = 'withdrawn' where project_version_id = $1 and status = 'published'",
          [versionId],
        );
        await client.query(
          "update directory_project_versions set status = 'withdrawn' where id = $1",
          [`community-version:${versionId}`],
        );
        await client.query(
          "update directory_artifacts set status = 'withdrawn' where project_version_id = $1",
          [`community-version:${versionId}`],
        );
        await client.query(
          `update directory_projects set status = 'withdrawn', updated_at = now()
           where id = $1 and not exists (
             select 1 from directory_project_versions
             where project_id = $1 and status = 'available'
           )`,
          [`community:${changed.rows[0].project_id}`],
        );
        await client.query(
          "insert into withdrawal_announcements(project_version_id, reason, created_by) values ($1,$2,$3)",
          [versionId, reason, context.actorId],
        );
        await client.query(
          "insert into moderation_actions(actor_id, resource_type, resource_id, action, reason) values ($1,'version',$2,'withdraw',$3)",
          [context.actorId, versionId, reason],
        );
        await this.audit(
          client,
          context,
          "version.withdraw",
          "project-version",
          versionId,
          { reason, operator: true },
        );
        return { withdrawn: true };
      },
    );
  }

  async takedownVersion(
    context: MutationContext,
    versionId: string,
    input: {
      category: TakedownCategory;
      privateReason: string;
      publicNotice: string | null;
    },
  ) {
    await this.requireAdmin(context.actorId);
    return this.withIdempotency(
      context,
      "ops.version.takedown",
      async (client) => {
        const existing = await client.query<{
          id: string;
          category: TakedownCategory;
          public_notice: string | null;
          public_url: string;
          blocked_at: Date;
          evidence_status: "pending" | "retained" | "failed";
        }>(
          `select d.id, d.category, d.public_notice, d.public_url, d.blocked_at,
             e.status as evidence_status
           from takedown_decisions d
           join takedown_evidence_outbox e on e.decision_id = d.id
           where d.project_version_id = $1`,
          [versionId],
        );
        if (existing.rows[0]) {
          const row = existing.rows[0];
          return {
            id: row.id,
            versionId,
            category: row.category,
            publicNotice: row.public_notice,
            publicUrl: row.public_url,
            blockedAt: row.blocked_at.toISOString(),
            evidenceStatus: row.evidence_status,
          } satisfies TakedownDecision;
        }

        const artifact = await client.query<{
          id: string;
          object_key: string;
          public_url: string;
          sha256: string;
          size: string | number;
        }>(
          `select id, object_key, public_url, sha256, size
           from published_artifacts
           where project_version_id = $1 and status in ('available','withdrawn')
           for update`,
          [versionId],
        );
        const row = artifact.rows[0];
        if (!row) {
          throw new AuthoringError(
            "TakedownTargetNotFound",
            "没有可紧急下架的已发布 artifact。",
            409,
          );
        }

        const decision = await client.query<{
          id: string;
          blocked_at: Date;
        }>(
          `insert into takedown_decisions
           (project_version_id, published_artifact_id, actor_id, category,
            private_reason, public_notice, object_key, public_url, sha256,
            size, request_id)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           returning id, blocked_at`,
          [
            versionId,
            row.id,
            context.actorId,
            input.category,
            input.privateReason,
            input.publicNotice,
            row.object_key,
            row.public_url,
            row.sha256,
            row.size,
            context.requestId,
          ],
        );
        const decisionRow = decision.rows[0]!;

        await client.query(
          `update published_artifacts set status = 'taken-down', withdrawn_at = now()
           where id = $1`,
          [row.id],
        );
        await client.query(
          `update author_project_versions set status = 'taken-down',
             withdrawn_at = now(), updated_at = now() where id = $1`,
          [versionId],
        );
        await client.query(
          `update review_submissions set status = 'taken-down'
           where project_version_id = $1 and status in ('published','withdrawn')`,
          [versionId],
        );
        await client.query(
          `update directory_project_versions set status = 'taken-down'
           where id = $1`,
          [`community-version:${versionId}`],
        );
        await client.query(
          `update directory_artifacts set status = 'taken-down'
           where project_version_id = $1`,
          [`community-version:${versionId}`],
        );
        await client.query(
          `update directory_projects set status = 'taken-down', updated_at = now()
           where id = (
             select 'community:' || project_id::text
             from author_project_versions where id = $1
           ) and not exists (
             select 1 from directory_project_versions
             where project_id = directory_projects.id and status = 'available'
           )`,
          [versionId],
        );
        await client.query(
          "insert into takedown_evidence_outbox(decision_id) values ($1)",
          [decisionRow.id],
        );
        await client.query(
          `insert into moderation_actions
             (actor_id, resource_type, resource_id, action, reason)
           values ($1,'version',$2,'takedown',$3)`,
          [context.actorId, versionId, input.privateReason],
        );
        await this.audit(
          client,
          context,
          "version.takedown",
          "project-version",
          versionId,
          {
            category: input.category,
            decisionId: decisionRow.id,
            publicNotice: input.publicNotice,
          },
        );
        return {
          id: decisionRow.id,
          versionId,
          category: input.category,
          publicNotice: input.publicNotice,
          publicUrl: row.public_url,
          blockedAt: decisionRow.blocked_at.toISOString(),
          evidenceStatus: "pending",
        } satisfies TakedownDecision;
      },
    );
  }

  async resolvePublishedArtifact(objectKey: string) {
    const result = await this.pool.query<{
      object_key: string;
      file_name: string;
      size: string | number;
      sha256: string;
      status: "available" | "withdrawn" | "taken-down";
    }>(
      `select object_key, file_name, size, sha256, status
       from published_artifacts where object_key = $1`,
      [objectKey],
    );
    const row = result.rows[0];
    if (!row) {
      throw new AuthoringError("ArtifactNotFound", "artifact 不存在。", 404);
    }
    if (row.status === "taken-down") {
      throw new AuthoringError(
        "ArtifactTakenDown",
        "artifact 已因安全、法律或版权事件被紧急下架。",
        410,
      );
    }
    return {
      objectKey: row.object_key,
      fileName: row.file_name,
      size: Number(row.size),
      sha256: row.sha256,
      disposition: row.status,
    } satisfies PublishedArtifactAccess;
  }

  async listPendingTakedownEvidence() {
    const result = await this.pool.query<{
      decision_id: string;
      object_key: string;
      sha256: string;
      size: string | number;
    }>(
      `select d.id as decision_id, d.object_key, d.sha256, d.size
       from takedown_decisions d
       join takedown_evidence_outbox e on e.decision_id = d.id
       where e.status in ('pending','failed') and e.dispatched_at is null
       order by e.created_at limit 100`,
    );
    return result.rows.map((row) => ({
      decisionId: row.decision_id,
      sourceObjectKey: row.object_key,
      evidenceObjectKey: `takedown-evidence/${row.decision_id}/${row.sha256}.zip`,
      sha256: row.sha256,
      size: Number(row.size),
    }));
  }

  async getTakedownEvidenceCandidate(decisionId: string) {
    const result = await this.pool.query<{
      decision_id: string;
      object_key: string;
      sha256: string;
      size: string | number;
    }>(
      `select d.id as decision_id, d.object_key, d.sha256, d.size
       from takedown_decisions d
       join takedown_evidence_outbox e on e.decision_id = d.id
       where d.id = $1 and e.status in ('pending','failed')`,
      [decisionId],
    );
    const row = result.rows[0];
    return row
      ? {
          decisionId: row.decision_id,
          sourceObjectKey: row.object_key,
          evidenceObjectKey: `takedown-evidence/${row.decision_id}/${row.sha256}.zip`,
          sha256: row.sha256,
          size: Number(row.size),
        }
      : null;
  }

  async markTakedownEvidenceDispatched(decisionId: string) {
    await this.pool.query(
      `update takedown_evidence_outbox set dispatched_at = now(),
       dispatch_attempts = dispatch_attempts + 1 where decision_id = $1`,
      [decisionId],
    );
  }

  async completeTakedownEvidence(
    decisionId: string,
    evidenceObjectKey: string,
  ) {
    await this.pool.query(
      `update takedown_evidence_outbox set status = 'retained',
       evidence_object_key = $2, completed_at = now(), failure_summary = ''
       where decision_id = $1`,
      [decisionId, evidenceObjectKey],
    );
  }

  async recordTakedownEvidenceFailure(
    decisionId: string,
    failureSummary: string,
    finalAttempt: boolean,
  ) {
    await this.pool.query(
      `update takedown_evidence_outbox set status = 'failed',
       failure_summary = $2, dispatched_at = case when $3 then now() else null end
       where decision_id = $1`,
      [decisionId, failureSummary.slice(0, 1000), finalAttempt],
    );
  }

  async moderateProject(
    context: MutationContext,
    projectId: string,
    action: "hide" | "unhide" | "ban" | "unban",
    reason: string,
  ) {
    await this.requireAdmin(context.actorId);
    await this.withIdempotency(
      context,
      "ops.project.moderate",
      async (client) => {
        const directoryStatus =
          action === "hide" || action === "ban" ? "deprecated" : "available";
        const visibility =
          action === "hide" || action === "ban"
            ? "public-candidate"
            : "published";
        const updated = await client.query(
          "update directory_projects set status = $2, visibility = $3, updated_at = now() where id = $1",
          [`community:${projectId}`, directoryStatus, visibility],
        );
        if (!updated.rowCount)
          throw new AuthoringError("ProjectNotFound", "目录项目不存在。", 404);
        await client.query(
          "insert into moderation_actions(actor_id, resource_type, resource_id, action, reason) values ($1,'project',$2,$3,$4)",
          [context.actorId, projectId, action, reason],
        );
        await this.audit(
          client,
          context,
          "project.moderate",
          "project",
          projectId,
          { action, reason },
        );
        return { action };
      },
    );
  }

  async purgeExpiredDownloadEvents(retentionDays: number) {
    const result = await this.pool.query(
      "delete from download_events where created_at < now() - ($1 || ' days')::interval",
      [Math.min(Math.max(retentionDays, 1), 3650)],
    );
    return result.rowCount ?? 0;
  }

  private async requireAdmin(actorId: string) {
    const result = await this.pool.query<{ is_platform_admin: boolean }>(
      "select is_platform_admin from auth_users where id = $1 and status = 'active'",
      [actorId],
    );
    if (!result.rows[0]?.is_platform_admin)
      throw new AuthoringError(
        "PlatformAdminRequired",
        "需要平台运营管理员权限。",
        403,
      );
  }

  private async withIdempotency<T>(
    context: MutationContext,
    scope: string,
    callback: (client: PoolClient) => Promise<T>,
  ) {
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
      const result = await callback(client);
      await client.query(
        `insert into idempotency_keys
         (actor_id, scope, idempotency_key, request_hash, response_status,
          response_body, expires_at)
         values ($1,$2,$3,$4,200,$5::jsonb,now() + interval '24 hours')`,
        [
          context.actorId,
          scope,
          context.idempotencyKey,
          context.requestHash,
          JSON.stringify(result),
        ],
      );
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async audit(
    client: PoolClient,
    context: MutationContext,
    action: string,
    resourceType: string,
    resourceId: string,
    metadata: Record<string, unknown>,
  ) {
    await client.query(
      `insert into audit_events(actor_id, action, resource_type, resource_id, outcome, request_id, metadata)
       values ($1,$2,$3,$4,'allowed',$5,$6::jsonb)`,
      [
        context.actorId,
        action,
        resourceType,
        resourceId,
        context.requestId,
        JSON.stringify(metadata),
      ],
    );
  }
}

export function createPostgresOperationsDataService(pool: Pool) {
  return new PostgresOperationsDataService(pool);
}
