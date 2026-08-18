alter table author_project_versions
  drop constraint if exists author_project_versions_status_check;

alter table author_project_versions
  add constraint author_project_versions_status_check check (status in (
    'draft', 'validating', 'loader-failed', 'awaiting-review',
    'changes-requested', 'rejected', 'approved', 'publishing', 'publish-failed',
    'published', 'withdrawn'
  ));

alter table author_project_versions
  add column if not exists selected_upload_id uuid references upload_sessions(id),
  add column if not exists frozen_metadata jsonb,
  add column if not exists published_at timestamptz,
  add column if not exists withdrawn_at timestamptz;

create table if not exists loader_validation_runs (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references upload_sessions(id) on delete cascade,
  project_version_id uuid not null references author_project_versions(id) on delete cascade,
  status text not null check (status in (
    'queued', 'running', 'loader-passed', 'loader-failed',
    'security-failed', 'timed-out', 'infrastructure-error'
  )),
  validator_image text not null,
  cli_version text not null,
  core_commit text not null check (core_commit ~ '^[0-9a-f]{40}$'),
  input_sha256 text not null check (input_sha256 ~ '^[0-9a-f]{64}$'),
  attempt integer not null check (attempt > 0),
  job_id text,
  exit_code integer,
  sections jsonb not null default '{}'::jsonb,
  log_summary text not null default '',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists loader_validation_runs_success_unique
  on loader_validation_runs(upload_id, core_commit)
  where status = 'loader-passed';
create index if not exists loader_validation_runs_version_idx
  on loader_validation_runs(project_version_id, created_at desc);

create table if not exists loader_job_outbox (
  upload_id uuid primary key references upload_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  dispatch_attempts integer not null default 0
);

create index if not exists loader_job_outbox_pending_idx
  on loader_job_outbox(created_at) where dispatched_at is null;

create table if not exists review_submissions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references author_projects(id) on delete cascade,
  project_version_id uuid not null references author_project_versions(id) on delete cascade,
  upload_id uuid not null references upload_sessions(id),
  validation_run_id uuid not null references loader_validation_runs(id),
  revision integer not null,
  status text not null check (status in (
    'awaiting-review', 'changes-requested', 'rejected',
    'approved', 'publishing', 'publish-failed', 'published', 'withdrawn'
  )),
  frozen_metadata jsonb not null,
  submitted_by uuid not null references auth_users(id),
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  published_at timestamptz,
  unique (project_version_id, revision)
);

create index if not exists review_submissions_queue_idx
  on review_submissions(status, submitted_at);

create table if not exists review_decisions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references review_submissions(id) on delete cascade,
  reviewer_id uuid not null references auth_users(id),
  decision text not null check (decision in ('approve', 'reject', 'request-changes')),
  reason text not null check (length(reason) between 3 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists publish_job_outbox (
  submission_id uuid primary key references review_submissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  dispatch_attempts integer not null default 0
);

create index if not exists publish_job_outbox_pending_idx
  on publish_job_outbox(created_at) where dispatched_at is null;

create table if not exists publication_runs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references review_submissions(id) on delete cascade,
  status text not null check (status in ('running', 'completed', 'infrastructure-error')),
  attempt integer not null check (attempt > 0),
  job_id text not null,
  error_summary text not null default '',
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists publication_runs_submission_idx
  on publication_runs(submission_id, started_at desc);

create table if not exists published_artifacts (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references review_submissions(id),
  project_version_id uuid not null unique references author_project_versions(id),
  source_upload_id uuid not null references upload_sessions(id),
  object_key text not null unique,
  public_url text not null,
  file_name text not null,
  size bigint not null check (size > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('available', 'withdrawn')),
  published_at timestamptz not null default now(),
  withdrawn_at timestamptz
);

create table if not exists release_feed_snapshots (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  signature_base64 text not null,
  signing_key_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists withdrawal_announcements (
  id uuid primary key default gen_random_uuid(),
  project_version_id uuid not null references author_project_versions(id),
  reason text not null check (length(reason) between 3 and 4000),
  created_by uuid not null references auth_users(id),
  created_at timestamptz not null default now()
);

create or replace function reject_review_decision_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'review_decisions is append-only';
end;
$$;

drop trigger if exists review_decisions_append_only on review_decisions;
create trigger review_decisions_append_only
before update or delete on review_decisions
for each row execute function reject_review_decision_mutation();

create or replace function reject_published_artifact_identity_mutation()
returns trigger language plpgsql as $$
begin
  if new.object_key <> old.object_key or new.sha256 <> old.sha256 or
     new.size <> old.size or new.source_upload_id <> old.source_upload_id or
     new.project_version_id <> old.project_version_id then
    raise exception 'published artifact identity is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists published_artifact_identity_immutable on published_artifacts;
create trigger published_artifact_identity_immutable
before update on published_artifacts
for each row execute function reject_published_artifact_identity_mutation();
