create extension if not exists pgcrypto;

create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists runtime_instances (
  id uuid primary key,
  service text not null,
  environment text not null,
  started_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists runtime_instances_service_started_idx
  on runtime_instances (service, started_at desc);
