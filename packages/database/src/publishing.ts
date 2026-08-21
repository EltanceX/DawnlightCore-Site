import type { Pool, PoolClient } from "pg";
import { AuthoringError, type MutationContext } from "./authoring.js";

export type LoaderValidationStatus =
  | "queued"
  | "running"
  | "loader-passed"
  | "loader-failed"
  | "security-failed"
  | "timed-out"
  | "infrastructure-error";

export type ValidationSection = {
  status: "passed" | "failed" | "declared" | "unavailable";
  summary: string;
  details?: Record<string, unknown>;
};

export type LoaderValidationSections = {
  schema: ValidationSection;
  loader: ValidationSection;
  security: ValidationSection;
  resource: ValidationSection;
  compatibility: ValidationSection;
};

export type LoaderValidationReport = {
  status: Exclude<LoaderValidationStatus, "queued" | "running">;
  exitCode: number | null;
  sections: LoaderValidationSections;
  logSummary: string;
};

export type LoaderCandidate = {
  uploadId: string;
  projectId: string;
  versionId: string;
  objectKey: string;
  inputSha256: string;
  version: string;
};

export type ReviewSubmission = {
  id: string;
  projectId: string;
  projectSlug: string;
  projectName: string;
  versionId: string;
  version: string;
  channel: string;
  revision: number;
  status: string;
  uploadId: string;
  validationRunId: string;
  submittedBy: string;
  submittedAt: string;
  frozenMetadata: Record<string, unknown>;
  validation: {
    status: LoaderValidationStatus;
    coreCommit: string;
    cliVersion: string;
    validatorImage: string;
    inputSha256: string;
    sections: LoaderValidationSections;
  };
};

export type PublicationCandidate = {
  submissionId: string;
  projectId: string;
  projectSlug: string;
  versionId: string;
  version: string;
  uploadId: string;
  sourceObjectKey: string;
  inputSha256: string;
  inputSize: number;
  fileName: string;
  coreCommit: string;
  loaderSections: LoaderValidationSections;
  frozenMetadata: Record<string, unknown>;
};

export interface PublishingDataService {
  submitVersion(
    context: MutationContext,
    projectId: string,
    versionId: string,
    uploadId: string,
  ): Promise<ReviewSubmission>;
  listReviewQueue(actorId: string): Promise<ReviewSubmission[]>;
  decideReview(
    context: MutationContext,
    submissionId: string,
    decision: "approve" | "reject" | "request-changes",
    reason: string,
  ): Promise<ReviewSubmission>;
  withdrawVersion(
    context: MutationContext,
    projectId: string,
    versionId: string,
    reason: string,
  ): Promise<void>;
  getVersionWorkflow(
    actorId: string,
    projectId: string,
    versionId: string,
  ): Promise<{
    uploadId: string | null;
    validation: LoaderValidationReport | null;
    submission: ReviewSubmission | null;
  }>;
}

export interface PublishingWorkerDataService {
  listPendingLoaderUploads(limit?: number): Promise<string[]>;
  markLoaderDispatched(uploadId: string): Promise<void>;
  getLoaderCandidate(uploadId: string): Promise<LoaderCandidate>;
  beginLoaderValidation(
    candidate: LoaderCandidate,
    validatorImage: string,
    cliVersion: string,
    coreCommit: string,
    jobId: string,
    attempt: number,
  ): Promise<string>;
  completeLoaderValidation(
    runId: string,
    report: LoaderValidationReport,
    transitionVersion?: boolean,
  ): Promise<void>;
  listPendingPublications(limit?: number): Promise<string[]>;
  markPublicationDispatched(submissionId: string): Promise<void>;
  getPublicationCandidate(submissionId: string): Promise<PublicationCandidate>;
  markPublicationRunning(
    submissionId: string,
    jobId: string,
    attempt: number,
  ): Promise<string>;
  recordPublicationFailure(
    runId: string,
    errorSummary: string,
    finalAttempt: boolean,
  ): Promise<void>;
  completePublication(
    runId: string,
    candidate: PublicationCandidate,
    artifact: { objectKey: string; publicUrl: string; size: number },
    feed: {
      payload: unknown;
      payloadSha256: string;
      signatureBase64: string;
      signingKeyId: string;
    },
  ): Promise<void>;
}

type SubmissionRow = {
  id: string;
  project_id: string;
  project_slug: string;
  project_name: string;
  project_version_id: string;
  version: string;
  channel: string;
  revision: number;
  status: string;
  upload_id: string;
  validation_run_id: string;
  submitted_by: string;
  submitted_at: Date;
  frozen_metadata: Record<string, unknown>;
  validation_status: LoaderValidationStatus;
  core_commit: string;
  cli_version: string;
  validator_image: string;
  input_sha256: string;
  sections: LoaderValidationSections;
};

const json = (value: unknown) => JSON.stringify(value);

const submissionSelect = `
  select s.*, p.slug as project_slug, p.name as project_name,
    v.version, v.channel, r.status as validation_status, r.core_commit,
    r.cli_version, r.validator_image, r.input_sha256, r.sections
  from review_submissions s
  join author_projects p on p.id = s.project_id
  join author_project_versions v on v.id = s.project_version_id
  join loader_validation_runs r on r.id = s.validation_run_id`;

function mapSubmission(row: SubmissionRow): ReviewSubmission {
  return {
    id: row.id,
    projectId: row.project_id,
    projectSlug: row.project_slug,
    projectName: row.project_name,
    versionId: row.project_version_id,
    version: row.version,
    channel: row.channel,
    revision: row.revision,
    status: row.status,
    uploadId: row.upload_id,
    validationRunId: row.validation_run_id,
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at.toISOString(),
    frozenMetadata: row.frozen_metadata,
    validation: {
      status: row.validation_status,
      coreCommit: row.core_commit,
      cliVersion: row.cli_version,
      validatorImage: row.validator_image,
      inputSha256: row.input_sha256,
      sections: row.sections,
    },
  };
}

export class PostgresPublishingDataService
  implements PublishingDataService, PublishingWorkerDataService
{
  constructor(private readonly pool: Pool) {}

  async submitVersion(
    context: MutationContext,
    projectId: string,
    versionId: string,
    uploadId: string,
  ) {
    await this.requireRole(context.actorId, projectId, ["owner", "maintainer"]);
    return this.withIdempotency(context, "version.submit", async (client) => {
      const result = await client.query<{
        version: string;
        channel: string;
        changelog: string;
        license_spdx: string | null;
        project_license: string | null;
        compatibility: unknown;
        artifact_declarations: unknown;
        revision: number;
        validation_run_id: string;
        input_sha256: string;
      }>(
        `select v.version, v.channel, v.changelog, v.license_spdx,
           p.license_spdx as project_license, v.compatibility,
           v.artifact_declarations, v.revision, r.id as validation_run_id,
           r.input_sha256
         from author_project_versions v
         join author_projects p on p.id = v.project_id
         join upload_sessions u on u.id = $3 and u.project_version_id = v.id
         join loader_validation_runs r on r.upload_id = u.id
           and r.status = 'loader-passed'
         where v.id = $1 and v.project_id = $2
           and v.status in ('draft', 'changes-requested')
         order by r.completed_at desc limit 1 for update of v`,
        [versionId, projectId, uploadId],
      );
      const row = result.rows[0];
      if (!row) {
        throw new AuthoringError(
          "LoaderValidationRequired",
          "只有当前版本中通过真实 Loader 验证的上传才能提交审核。",
          409,
        );
      }
      const licenseSpdx = row.license_spdx ?? row.project_license;
      if (!licenseSpdx) {
        throw new AuthoringError(
          "LicenseRequired",
          "提交审核前必须声明可核对的 SPDX 许可证。",
          409,
        );
      }
      const frozenMetadata = {
        version: row.version,
        channel: row.channel,
        changelog: row.changelog,
        licenseSpdx,
        compatibility: row.compatibility,
        artifactDeclarations: row.artifact_declarations,
        revision: row.revision,
        inputSha256: row.input_sha256,
      };
      const inserted = await client.query<{ id: string }>(
        `insert into review_submissions
         (project_id, project_version_id, upload_id, validation_run_id, revision,
          status, frozen_metadata, submitted_by)
         values ($1,$2,$3,$4,$5,'awaiting-review',$6::jsonb,$7)
         returning id`,
        [
          projectId,
          versionId,
          uploadId,
          row.validation_run_id,
          row.revision,
          json(frozenMetadata),
          context.actorId,
        ],
      );
      await client.query(
        `update author_project_versions set status = 'awaiting-review',
         selected_upload_id = $2, frozen_metadata = $3::jsonb, updated_at = now()
         where id = $1`,
        [versionId, uploadId, json(frozenMetadata)],
      );
      await this.audit(
        client,
        context,
        "version.submit",
        "project-version",
        versionId,
        {
          uploadId,
          revision: row.revision,
        },
      );
      return this.getSubmission(inserted.rows[0]!.id, client);
    });
  }

  async listReviewQueue(actorId: string) {
    const rows = await this.pool.query<SubmissionRow>(
      `${submissionSelect}
       join auth_users reviewer on reviewer.id = $1 and reviewer.status = 'active'
       left join project_memberships m on m.project_id = s.project_id and m.user_id = $1
       where s.status = 'awaiting-review'
         and (reviewer.is_platform_admin or m.role = 'reviewer')
       order by s.submitted_at`,
      [actorId],
    );
    return rows.rows.map(mapSubmission);
  }

  async decideReview(
    context: MutationContext,
    submissionId: string,
    decision: "approve" | "reject" | "request-changes",
    reason: string,
  ) {
    return this.withIdempotency(context, "review.decision", async (client) => {
      const locked = await client.query<{
        project_id: string;
        project_version_id: string;
        submitted_by: string;
        status: string;
      }>(
        `select project_id, project_version_id, submitted_by, status
         from review_submissions where id = $1 for update`,
        [submissionId],
      );
      const row = locked.rows[0];
      if (!row)
        throw new AuthoringError("SubmissionNotFound", "审核提交不存在。", 404);
      await this.requireReviewer(context.actorId, row.project_id, client);
      if (row.submitted_by === context.actorId) {
        throw new AuthoringError(
          "SelfReviewForbidden",
          "提交者不能审核自己的版本。",
          403,
        );
      }
      if (row.status !== "awaiting-review") {
        throw new AuthoringError(
          "ReviewStateConflict",
          "该提交已不在待审核状态。",
          409,
        );
      }
      const submissionStatus =
        decision === "approve"
          ? "approved"
          : decision === "reject"
            ? "rejected"
            : "changes-requested";
      const versionStatus = submissionStatus;
      await client.query(
        `insert into review_decisions(submission_id, reviewer_id, decision, reason)
         values ($1,$2,$3,$4)`,
        [submissionId, context.actorId, decision, reason],
      );
      await client.query(
        `update review_submissions set status = $2, decided_at = now() where id = $1`,
        [submissionId, submissionStatus],
      );
      await client.query(
        `update author_project_versions set status = $2, updated_at = now() where id = $1`,
        [row.project_version_id, versionStatus],
      );
      if (decision === "approve") {
        await client.query(
          `insert into publish_job_outbox(submission_id) values ($1)
           on conflict (submission_id) do update set dispatched_at = null`,
          [submissionId],
        );
      }
      await this.audit(
        client,
        context,
        "review.decision",
        "review-submission",
        submissionId,
        {
          decision,
          reason,
        },
      );
      return this.getSubmission(submissionId, client);
    });
  }

  async withdrawVersion(
    context: MutationContext,
    projectId: string,
    versionId: string,
    reason: string,
  ) {
    await this.requireRole(context.actorId, projectId, ["owner"]);
    await this.withIdempotency(context, "version.withdraw", async (client) => {
      const changed = await client.query(
        `update author_project_versions set status = 'withdrawn', withdrawn_at = now(),
         updated_at = now() where id = $1 and project_id = $2 and status = 'published'`,
        [versionId, projectId],
      );
      if (!changed.rowCount) {
        throw new AuthoringError(
          "PublishedVersionNotFound",
          "没有可撤回的已发布版本。",
          409,
        );
      }
      await client.query(
        `update published_artifacts set status = 'withdrawn', withdrawn_at = now()
         where project_version_id = $1`,
        [versionId],
      );
      await client.query(
        `update review_submissions set status = 'withdrawn'
         where project_version_id = $1 and status = 'published'`,
        [versionId],
      );
      await client.query(
        `update directory_project_versions set status = 'withdrawn'
         where id = $1`,
        [`community-version:${versionId}`],
      );
      await client.query(
        `update directory_artifacts set status = 'withdrawn'
         where project_version_id = $1`,
        [`community-version:${versionId}`],
      );
      await client.query(
        `update directory_projects set status = 'withdrawn', updated_at = now()
         where id = $1 and not exists (
           select 1 from directory_project_versions
           where project_id = $1 and status = 'available'
         )`,
        [`community:${projectId}`],
      );
      await client.query(
        `insert into withdrawal_announcements(project_version_id, reason, created_by)
         values ($1,$2,$3)`,
        [versionId, reason, context.actorId],
      );
      await this.audit(
        client,
        context,
        "version.withdraw",
        "project-version",
        versionId,
        {
          reason,
        },
      );
      return { withdrawn: true };
    });
  }

  async getVersionWorkflow(
    actorId: string,
    projectId: string,
    versionId: string,
  ) {
    await this.requireRole(actorId, projectId, [
      "owner",
      "maintainer",
      "reviewer",
    ]);
    const validation = await this.pool.query<{
      upload_id: string;
      status: LoaderValidationReport["status"];
      exit_code: number | null;
      sections: LoaderValidationSections;
      log_summary: string;
    }>(
      `select r.upload_id, r.status, r.exit_code, r.sections, r.log_summary
       from loader_validation_runs r
       where r.project_version_id = $1 order by r.created_at desc limit 1`,
      [versionId],
    );
    const submission = await this.pool.query<SubmissionRow>(
      `${submissionSelect} where s.project_version_id = $1
       order by s.submitted_at desc limit 1`,
      [versionId],
    );
    const run = validation.rows[0];
    return {
      uploadId: run?.upload_id ?? null,
      validation: run
        ? {
            status: run.status,
            exitCode: run.exit_code,
            sections: run.sections,
            logSummary: run.log_summary,
          }
        : null,
      submission: submission.rows[0] ? mapSubmission(submission.rows[0]) : null,
    };
  }

  async listPendingLoaderUploads(limit = 100) {
    const rows = await this.pool.query<{ upload_id: string }>(
      `select upload_id from loader_job_outbox where dispatched_at is null
       order by created_at limit $1`,
      [limit],
    );
    return rows.rows.map((row) => row.upload_id);
  }

  async markLoaderDispatched(uploadId: string) {
    await this.pool.query(
      `update loader_job_outbox set dispatched_at = now(),
       dispatch_attempts = dispatch_attempts + 1 where upload_id = $1`,
      [uploadId],
    );
  }

  async getLoaderCandidate(uploadId: string): Promise<LoaderCandidate> {
    const result = await this.pool.query<{
      upload_id: string;
      project_id: string;
      project_version_id: string;
      object_key: string;
      input_sha256: string;
      version: string;
    }>(
      `select u.id as upload_id, u.project_id, u.project_version_id,
       u.object_key, p.input_sha256, v.version
       from upload_sessions u join preflight_runs p on p.upload_id = u.id
       join author_project_versions v on v.id = u.project_version_id
       where u.id = $1 and u.status = 'passed' and p.status = 'passed'
         and p.input_sha256 is not null`,
      [uploadId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("LoaderCandidateNotReady");
    return {
      uploadId: row.upload_id,
      projectId: row.project_id,
      versionId: row.project_version_id,
      objectKey: row.object_key,
      inputSha256: row.input_sha256,
      version: row.version,
    };
  }

  async beginLoaderValidation(
    candidate: LoaderCandidate,
    validatorImage: string,
    cliVersion: string,
    coreCommit: string,
    jobId: string,
    attempt: number,
  ) {
    const result = await this.pool.query<{ id: string }>(
      `insert into loader_validation_runs
       (upload_id, project_version_id, status, validator_image, cli_version,
        core_commit, input_sha256, attempt, job_id, started_at)
       values ($1,$2,'running',$3,$4,$5,$6,$7,$8,now()) returning id`,
      [
        candidate.uploadId,
        candidate.versionId,
        validatorImage,
        cliVersion,
        coreCommit,
        candidate.inputSha256,
        attempt,
        jobId,
      ],
    );
    return result.rows[0]!.id;
  }

  async completeLoaderValidation(
    runId: string,
    report: LoaderValidationReport,
    transitionVersion = true,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const run = await client.query<{ project_version_id: string }>(
        `update loader_validation_runs set status = $2, exit_code = $3,
         sections = $4::jsonb, log_summary = $5, completed_at = now()
         where id = $1 returning project_version_id`,
        [
          runId,
          report.status,
          report.exitCode,
          json(report.sections),
          report.logSummary,
        ],
      );
      const versionId = run.rows[0]?.project_version_id;
      if (!versionId) throw new Error("LoaderValidationRunNotFound");
      if (transitionVersion) {
        await client.query(
          `update author_project_versions set status = $2, updated_at = now()
           where id = $1 and status = 'validating'`,
          [
            versionId,
            report.status === "loader-passed" ? "draft" : "loader-failed",
          ],
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

  async listPendingPublications(limit = 100) {
    const rows = await this.pool.query<{ submission_id: string }>(
      `select submission_id from publish_job_outbox where dispatched_at is null
       order by created_at limit $1`,
      [limit],
    );
    return rows.rows.map((row) => row.submission_id);
  }

  async markPublicationDispatched(submissionId: string) {
    await this.pool.query(
      `update publish_job_outbox set dispatched_at = now(),
       dispatch_attempts = dispatch_attempts + 1 where submission_id = $1`,
      [submissionId],
    );
  }

  async getPublicationCandidate(
    submissionId: string,
  ): Promise<PublicationCandidate> {
    const result = await this.pool.query<{
      submission_id: string;
      project_id: string;
      slug: string;
      project_version_id: string;
      version: string;
      upload_id: string;
      object_key: string;
      input_sha256: string;
      input_size: string | number;
      original_file_name: string;
      core_commit: string;
      sections: LoaderValidationSections;
      frozen_metadata: Record<string, unknown>;
    }>(
      `select s.id as submission_id, s.project_id, p.slug, s.project_version_id,
       v.version, s.upload_id, u.object_key, r.input_sha256, pr.input_size,
       u.original_file_name, r.core_commit, r.sections, s.frozen_metadata
       from review_submissions s
       join author_projects p on p.id = s.project_id
       join author_project_versions v on v.id = s.project_version_id
       join upload_sessions u on u.id = s.upload_id
       join preflight_runs pr on pr.upload_id = u.id
       join loader_validation_runs r on r.id = s.validation_run_id
       where s.id = $1 and s.status in ('approved','publishing','publish-failed')
         and r.status = 'loader-passed'`,
      [submissionId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("PublicationCandidateNotReady");
    return {
      submissionId: row.submission_id,
      projectId: row.project_id,
      projectSlug: row.slug,
      versionId: row.project_version_id,
      version: row.version,
      uploadId: row.upload_id,
      sourceObjectKey: row.object_key,
      inputSha256: row.input_sha256,
      inputSize: Number(row.input_size),
      fileName: row.original_file_name,
      coreCommit: row.core_commit,
      loaderSections: row.sections,
      frozenMetadata: row.frozen_metadata,
    };
  }

  async markPublicationRunning(
    submissionId: string,
    jobId: string,
    attempt: number,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `update review_submissions set status = 'publishing'
         where id = $1 and status in ('approved','publishing','publish-failed')`,
        [submissionId],
      );
      await client.query(
        `update author_project_versions set status = 'publishing' where id =
         (select project_version_id from review_submissions where id = $1)
         and status in ('approved','publishing','publish-failed')`,
        [submissionId],
      );
      const run = await client.query<{ id: string }>(
        `insert into publication_runs(submission_id, status, attempt, job_id)
         values ($1,'running',$2,$3) returning id`,
        [submissionId, attempt, jobId],
      );
      await client.query("commit");
      return run.rows[0]!.id;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async recordPublicationFailure(
    runId: string,
    errorSummary: string,
    finalAttempt: boolean,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const run = await client.query<{ submission_id: string }>(
        `update publication_runs set status = 'infrastructure-error',
         error_summary = $2, completed_at = now() where id = $1
         returning submission_id`,
        [runId, errorSummary.slice(0, 1000)],
      );
      const submissionId = run.rows[0]?.submission_id;
      if (!submissionId) throw new Error("PublicationRunNotFound");
      if (finalAttempt) {
        await client.query(
          `update review_submissions set status = 'publish-failed'
           where id = $1 and status = 'publishing'`,
          [submissionId],
        );
        await client.query(
          `update author_project_versions set status = 'publish-failed', updated_at = now()
           where id = (select project_version_id from review_submissions where id = $1)
             and status = 'publishing'`,
          [submissionId],
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

  async completePublication(
    runId: string,
    candidate: PublicationCandidate,
    artifact: { objectKey: string; publicUrl: string; size: number },
    feed: {
      payload: unknown;
      payloadSha256: string;
      signatureBase64: string;
      signingKeyId: string;
    },
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into published_artifacts
         (submission_id, project_version_id, source_upload_id, object_key,
          public_url, file_name, size, sha256, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'available')
         on conflict (submission_id) do nothing`,
        [
          candidate.submissionId,
          candidate.versionId,
          candidate.uploadId,
          artifact.objectKey,
          artifact.publicUrl,
          candidate.fileName,
          artifact.size,
          candidate.inputSha256,
        ],
      );
      await this.upsertDirectory(client, candidate, artifact.publicUrl);
      await client.query(
        `insert into release_feed_snapshots
         (payload, payload_sha256, signature_base64, signing_key_id)
         values ($1::jsonb,$2,$3,$4)`,
        [
          json(feed.payload),
          feed.payloadSha256,
          feed.signatureBase64,
          feed.signingKeyId,
        ],
      );
      await client.query(
        `update publication_runs set status = 'completed', completed_at = now()
         where id = $1 and submission_id = $2`,
        [runId, candidate.submissionId],
      );
      await client.query(
        `update review_submissions set status = 'published', published_at = now()
         where id = $1`,
        [candidate.submissionId],
      );
      await client.query(
        `update author_project_versions set status = 'published',
         published_at = now(), updated_at = now() where id = $1`,
        [candidate.versionId],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async upsertDirectory(
    client: PoolClient,
    candidate: PublicationCandidate,
    publicUrl: string,
  ) {
    const metadata = candidate.frozenMetadata as {
      channel?: string;
      licenseSpdx?: string;
      compatibility?: Array<{
        coreRange?: string;
        gameApiTag?: string;
        platforms?: string[];
        architectures?: string[];
        gpuClasses?: string[];
        note?: string;
      }>;
      artifactDeclarations?: Array<{
        platform?: string;
        architecture?: string;
        gpuClass?: string;
      }>;
    };
    const project = await client.query<{ name: string; summary: string }>(
      "select name, summary from author_projects where id = $1",
      [candidate.projectId],
    );
    const directoryProjectId = `community:${candidate.projectId}`;
    const directoryVersionId = `community-version:${candidate.versionId}`;
    const artifactId = `community-artifact:${candidate.versionId}`;
    const compatibilityId = `community-compat:${candidate.versionId}`;
    const compatibility = metadata.compatibility?.[0] ?? {};
    const declaration = metadata.artifactDeclarations?.[0] ?? {};
    const loaderDetails = candidate.loaderSections.loader.details ?? {};
    const manifestVersion = Number(loaderDetails.manifestVersion);
    const settingsSchemaVersion = Number(loaderDetails.settingsSchemaVersion);
    if (
      !Number.isInteger(manifestVersion) ||
      manifestVersion < 1 ||
      !Number.isInteger(settingsSchemaVersion) ||
      settingsSchemaVersion < 1
    ) {
      throw new Error("LoaderReportMissingSchemaVersions");
    }
    const sourceRef = {
      path: "review-submission",
      pointer: candidate.submissionId,
      commit: candidate.coreCommit,
    };
    await client.query(
      `insert into directory_projects
       (id, slug, name, summary, status, visibility, license_id, source_ref)
       values ($1,$2,$3,$4,'available','published',$5,$6::jsonb)
       on conflict (id) do update set status = 'available', visibility = 'published', updated_at = now()`,
      [
        directoryProjectId,
        candidate.projectSlug,
        project.rows[0]!.name,
        project.rows[0]!.summary,
        `community-license:${candidate.projectId}`,
        json(sourceRef),
      ],
    );
    await client.query(
      `insert into directory_licenses(id, project_id, status, spdx_id, name, reason)
       values ($1,$2,'declared',$3,$3,'作者声明并经审核员批准。')
       on conflict (id) do update set status = 'declared', spdx_id = excluded.spdx_id,
         name = excluded.name, reason = excluded.reason`,
      [
        `community-license:${candidate.projectId}`,
        directoryProjectId,
        metadata.licenseSpdx,
      ],
    );
    await client.query(
      `insert into directory_project_versions
       (id, project_id, version, channel, status, verification, contract_version,
        core_commit, game_api_tag, manifest_version, settings_schema_version,
        compatibility_ids, artifact_ids, image_ids, source_ref)
       values ($1,$2,$3,$4,'available','loader-verified','loader-runtime',$5,$6,$7,$8,$9,$10,'{}',$11::jsonb)
       on conflict (id) do nothing`,
      [
        directoryVersionId,
        directoryProjectId,
        candidate.version,
        metadata.channel ?? "preview",
        candidate.coreCommit,
        compatibility.gameApiTag ?? "unknown",
        manifestVersion,
        settingsSchemaVersion,
        [compatibilityId],
        [artifactId],
        json(sourceRef),
      ],
    );
    await client.query(
      `insert into directory_artifacts
       (id, project_version_id, status, platform, architecture, gpu_class,
        file_name, size, sha256, download_url, source_ref)
       values ($1,$2,'available',$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       on conflict (id) do nothing`,
      [
        artifactId,
        directoryVersionId,
        declaration.platform ?? "any",
        declaration.architecture ?? "any",
        declaration.gpuClass ?? "unspecified",
        candidate.fileName,
        candidate.inputSize,
        candidate.inputSha256,
        publicUrl,
        json(sourceRef),
      ],
    );
    await client.query(
      `insert into directory_compatibilities
       (id, project_version_id, status, core_range, game_api_tag, platforms,
        architectures, gpu_classes, reason)
       values ($1,$2,'compatible',$3,$4,$5,$6,$7,$8)
       on conflict (id) do nothing`,
      [
        compatibilityId,
        directoryVersionId,
        compatibility.coreRange ?? candidate.coreCommit,
        compatibility.gameApiTag ?? "unknown",
        compatibility.platforms ?? [],
        compatibility.architectures ?? [],
        compatibility.gpuClasses ?? [],
        compatibility.note ??
          "真实 Loader 验证通过；设备兼容性仍以声明范围为准。",
      ],
    );
  }

  private async getSubmission(
    id: string,
    queryable: Pool | PoolClient = this.pool,
  ) {
    const result = await queryable.query<SubmissionRow>(
      `${submissionSelect} where s.id = $1`,
      [id],
    );
    if (!result.rows[0])
      throw new AuthoringError("SubmissionNotFound", "审核提交不存在。", 404);
    return mapSubmission(result.rows[0]);
  }

  private async requireRole(
    actorId: string,
    projectId: string,
    roles: string[],
  ) {
    const result = await this.pool.query<{ role: string }>(
      `select m.role from project_memberships m join auth_users u on u.id = m.user_id
       where m.user_id = $1 and m.project_id = $2 and u.status = 'active'`,
      [actorId, projectId],
    );
    if (!result.rows[0] || !roles.includes(result.rows[0].role)) {
      throw new AuthoringError(
        "Forbidden",
        "当前账户没有此项目操作权限。",
        403,
      );
    }
  }

  private async requireReviewer(
    actorId: string,
    projectId: string,
    client: PoolClient,
  ) {
    const result = await client.query<{ allowed: boolean }>(
      `select (u.is_platform_admin or coalesce(m.role = 'reviewer', false)) as allowed
       from auth_users u left join project_memberships m
         on m.user_id = u.id and m.project_id = $2
       where u.id = $1 and u.status = 'active'`,
      [actorId, projectId],
    );
    if (!result.rows[0]?.allowed) {
      throw new AuthoringError(
        "ReviewerRequired",
        "只有独立 reviewer 可以作出审核决定。",
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
         where actor_id = $1 and scope = $2 and idempotency_key = $3 and expires_at > now()`,
        [context.actorId, scope, context.idempotencyKey],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== context.requestHash)
          throw new AuthoringError(
            "IdempotencyConflict",
            "同一幂等键已用于不同请求。",
            409,
          );
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

  private async audit(
    client: PoolClient,
    context: MutationContext,
    action: string,
    resourceType: string,
    resourceId: string,
    metadata: Record<string, unknown>,
  ) {
    await client.query(
      `insert into audit_events
       (actor_id, action, resource_type, resource_id, outcome, request_id, metadata)
       values ($1,$2,$3,$4,'allowed',$5,$6::jsonb)`,
      [
        context.actorId,
        action,
        resourceType,
        resourceId,
        context.requestId,
        json(metadata),
      ],
    );
  }
}

export function createPostgresPublishingDataService(pool: Pool) {
  return new PostgresPublishingDataService(pool);
}
