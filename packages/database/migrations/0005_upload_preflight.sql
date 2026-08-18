create unique index if not exists author_versions_id_project_unique
  on author_project_versions(id, project_id);

create table if not exists upload_sessions (
  id uuid primary key,
  project_id uuid not null references author_projects(id) on delete cascade,
  project_version_id uuid not null references author_project_versions(id) on delete cascade,
  created_by uuid not null references auth_users(id),
  object_key text not null unique,
  original_file_name text not null,
  expected_size bigint not null check (expected_size > 0),
  expected_content_type text not null,
  status text not null check (status in (
    'created', 'queued', 'inspecting', 'passed', 'rejected',
    'infrastructure-error', 'expired'
  )),
  expires_at timestamptz not null,
  completed_at timestamptz,
  object_size bigint,
  object_etag text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint upload_version_project_fk
    foreign key (project_version_id, project_id)
    references author_project_versions(id, project_id)
);

create table if not exists preflight_runs (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null unique references upload_sessions(id) on delete cascade,
  status text not null check (status in ('inspecting', 'passed', 'rejected', 'infrastructure-error')),
  worker_version text not null,
  job_id text,
  attempt integer not null check (attempt > 0),
  input_sha256 text,
  input_size bigint,
  file_count integer,
  extracted_size bigint,
  manifest jsonb not null default '[]'::jsonb,
  diagnostics jsonb not null default '[]'::jsonb,
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint preflight_sha256_check
    check (input_sha256 is null or input_sha256 ~ '^[0-9a-f]{64}$')
);

create table if not exists upload_job_outbox (
  upload_id uuid primary key references upload_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  dispatch_attempts integer not null default 0
);

create table if not exists preflight_dead_letters (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references upload_sessions(id) on delete cascade,
  job_id text,
  attempt integer not null,
  error_code text not null,
  created_at timestamptz not null default now()
);

create index if not exists upload_sessions_project_idx
  on upload_sessions(project_id, created_at desc);
create index if not exists upload_sessions_cleanup_idx
  on upload_sessions(status, expires_at);
create index if not exists upload_job_outbox_pending_idx
  on upload_job_outbox(created_at) where dispatched_at is null;
