create extension if not exists pg_trgm;

create index if not exists directory_projects_search_trgm_idx
  on directory_projects using gin ((lower(slug) || ' ' || lower(name) || ' ' || lower(summary)) gin_trgm_ops);
create index if not exists directory_versions_search_trgm_idx
  on directory_project_versions using gin ((lower(version) || ' ' || lower(core_commit) || ' ' || lower(game_api_tag)) gin_trgm_ops);
create index if not exists directory_artifacts_search_trgm_idx
  on directory_artifacts using gin (lower(file_name) gin_trgm_ops);
create index if not exists contract_diagnostics_search_trgm_idx
  on contract_diagnostics using gin ((lower(code) || ' ' || lower(entry_id) || ' ' || lower(diagnostic_group)) gin_trgm_ops);
create index if not exists contract_catalog_search_trgm_idx
  on contract_catalog_entries using gin ((lower(entry_id) || ' ' || lower(catalog_kind)) gin_trgm_ops);
create index if not exists contract_capabilities_search_trgm_idx
  on contract_capabilities using gin (lower(entry_id) gin_trgm_ops);

create table if not exists download_events (
  id uuid primary key default gen_random_uuid(),
  event_id text,
  bucket timestamptz not null,
  artifact_id text references directory_artifacts(id) on delete set null,
  project_version_id text,
  edge_region text not null default 'unknown' check (length(edge_region) between 1 and 32),
  source_class text not null default 'unknown' check (source_class in ('direct', 'referral', 'client', 'unknown')),
  outcome text not null check (outcome in ('success', 'error')),
  status_code integer not null check (status_code between 100 and 599),
  error_code text,
  created_at timestamptz not null default now()
);

create unique index if not exists download_events_event_id_unique
  on download_events(event_id) where event_id is not null;
create index if not exists download_events_bucket_idx
  on download_events(bucket desc, outcome, artifact_id);
create index if not exists download_events_version_idx
  on download_events(project_version_id, bucket desc);

create table if not exists moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth_users(id),
  resource_type text not null check (resource_type in ('project', 'version', 'artifact', 'report')),
  resource_id text not null,
  action text not null check (action in ('hide', 'unhide', 'ban', 'unban', 'withdraw', 'resolve')),
  reason text not null check (length(reason) between 3 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists moderation_actions_resource_idx
  on moderation_actions(resource_type, resource_id, created_at desc);

create index if not exists account_operation_requests_queue_idx
  on account_operation_requests(status, created_at desc);

alter table account_operation_requests
  add column if not exists resource_id text;
