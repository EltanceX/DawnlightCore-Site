create table if not exists contract_versions (
  version text primary key,
  contract_id text not null unique,
  status text not null,
  public_api_status text not null,
  source_repository text not null,
  source_commit text not null,
  game_api_tag text not null,
  manifest_versions integer[] not null,
  settings_schema_versions integer[] not null,
  captured_at timestamptz not null,
  content_digest text not null,
  manifest_sha256 text not null,
  signature_status text not null,
  signature_key_id text,
  is_active boolean not null default false,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint contract_versions_source_commit_check
    check (source_commit ~ '^[0-9a-f]{40}$'),
  constraint contract_versions_manifest_sha256_check
    check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  constraint contract_versions_content_digest_check
    check (content_digest ~ '^[0-9a-f]{64}$')
);

create unique index if not exists contract_versions_one_active
  on contract_versions (is_active)
  where is_active;

create table if not exists contract_schemas (
  contract_version text not null references contract_versions(version) on delete cascade,
  entry_id text not null,
  entry_version text not null,
  status text not null,
  source_ref jsonb not null,
  deprecation jsonb,
  document jsonb not null,
  primary key (contract_version, entry_id)
);

create table if not exists contract_diagnostics (
  contract_version text not null references contract_versions(version) on delete cascade,
  entry_id text not null,
  code text not null,
  entry_version text not null,
  status text not null,
  diagnostic_group text not null,
  severities text[] not null,
  catalog_kinds text[] not null,
  source_ref jsonb not null,
  deprecation jsonb,
  primary key (contract_version, entry_id),
  unique (contract_version, code)
);

create table if not exists contract_catalog_entries (
  contract_version text not null references contract_versions(version) on delete cascade,
  entry_id text not null,
  catalog_kind text not null,
  entry_version text not null,
  status text not null,
  source_ref jsonb not null,
  deprecation jsonb,
  primary key (contract_version, catalog_kind, entry_id)
);

create table if not exists contract_capabilities (
  contract_version text not null references contract_versions(version) on delete cascade,
  entry_id text not null,
  entry_version text not null,
  status text not null,
  source_ref jsonb not null,
  deprecation jsonb,
  primary key (contract_version, entry_id)
);

create table if not exists contract_graphs (
  contract_version text primary key references contract_versions(version) on delete cascade,
  entry_id text not null,
  entry_version text not null,
  status text not null,
  source_ref jsonb not null,
  deprecation jsonb,
  reason text,
  nodes jsonb not null,
  edges jsonb not null
);

create table if not exists contract_variants (
  contract_version text primary key references contract_versions(version) on delete cascade,
  entry_id text not null,
  entry_version text not null,
  status text not null,
  source_ref jsonb not null,
  deprecation jsonb,
  reason text,
  explanations jsonb not null
);

create table if not exists contract_ingest_runs (
  id uuid primary key default gen_random_uuid(),
  contract_version text not null,
  manifest_sha256 text not null,
  status text not null,
  row_counts jsonb not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint contract_ingest_runs_status_check
    check (status in ('activated', 'unchanged'))
);

create index if not exists contract_diagnostics_code_idx
  on contract_diagnostics (code);
create index if not exists contract_catalog_entries_id_idx
  on contract_catalog_entries (entry_id);
create index if not exists contract_capabilities_id_idx
  on contract_capabilities (entry_id);
