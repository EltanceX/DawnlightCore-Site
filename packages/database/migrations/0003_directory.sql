create table if not exists directory_projects (
  id text primary key,
  slug text not null unique,
  name text not null,
  summary text not null,
  status text not null,
  visibility text not null,
  license_id text,
  source_ref jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists directory_project_versions (
  id text primary key,
  project_id text not null references directory_projects(id) on delete cascade,
  version text not null,
  channel text not null,
  status text not null,
  verification text not null,
  contract_version text not null,
  core_commit text not null,
  game_api_tag text not null,
  manifest_version integer not null,
  settings_schema_version integer not null,
  compatibility_ids text[] not null default '{}',
  artifact_ids text[] not null default '{}',
  image_ids text[] not null default '{}',
  source_ref jsonb not null,
  unique (project_id, version)
);

create table if not exists directory_artifacts (
  id text primary key,
  project_version_id text not null references directory_project_versions(id) on delete cascade,
  status text not null,
  platform text not null,
  architecture text not null,
  gpu_class text not null,
  file_name text not null,
  size bigint not null,
  sha256 text not null,
  download_url text not null,
  source_ref jsonb not null
);

create table if not exists directory_compatibilities (
  id text primary key,
  project_version_id text not null references directory_project_versions(id) on delete cascade,
  status text not null,
  core_range text not null,
  game_api_tag text not null,
  platforms text[] not null default '{}',
  architectures text[] not null default '{}',
  gpu_classes text[] not null default '{}',
  reason text not null
);

create table if not exists directory_images (
  id text primary key,
  project_version_id text not null references directory_project_versions(id) on delete cascade,
  status text not null,
  url text,
  alt text,
  reason text
);

create table if not exists directory_licenses (
  id text primary key,
  project_id text not null references directory_projects(id) on delete cascade,
  status text not null,
  spdx_id text,
  name text,
  url text,
  reason text not null
);

create index if not exists directory_projects_status_idx on directory_projects(status);
create index if not exists directory_versions_game_api_idx on directory_project_versions(game_api_tag);
create index if not exists directory_versions_core_commit_idx on directory_project_versions(core_commit);
create index if not exists directory_compatibilities_game_api_idx on directory_compatibilities(game_api_tag);
