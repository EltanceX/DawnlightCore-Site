create table if not exists auth_users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  email text not null,
  email_normalized text not null unique,
  status text not null check (status in ('active', 'disabled', 'deletion-requested')),
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists auth_oidc_identities (
  issuer text not null,
  subject text not null,
  user_id uuid not null references auth_users(id) on delete cascade,
  email_at_link text not null,
  linked_at timestamptz not null default now(),
  last_login_at timestamptz not null default now(),
  primary key (issuer, subject)
);

create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth_users(id) on delete cascade,
  token_hash text not null unique,
  csrf_token text not null,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists oidc_login_transactions (
  state_hash text primary key,
  code_verifier text not null,
  nonce text not null,
  return_to text not null,
  account_invite_token_hash text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists account_invitations (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null,
  token_hash text not null unique,
  status text not null check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid references auth_users(id),
  grants_platform_admin boolean not null default false,
  expires_at timestamptz not null,
  accepted_by uuid references auth_users(id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists author_projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  summary text not null,
  license_spdx text,
  status text not null check (status in ('draft', 'archived')),
  created_by uuid not null references auth_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists project_memberships (
  project_id uuid not null references author_projects(id) on delete cascade,
  user_id uuid not null references auth_users(id) on delete cascade,
  role text not null check (role in ('owner', 'maintainer', 'reviewer')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references author_projects(id) on delete cascade,
  email_normalized text not null,
  role text not null check (role in ('maintainer', 'reviewer')),
  token_hash text not null unique,
  status text not null check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid not null references auth_users(id),
  expires_at timestamptz not null,
  accepted_by uuid references auth_users(id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists author_project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references author_projects(id) on delete cascade,
  version text not null,
  channel text not null check (channel in ('preview', 'alpha', 'beta', 'stable')),
  status text not null check (status in ('draft', 'changes-requested')),
  changelog text not null,
  license_spdx text,
  compatibility jsonb not null default '[]'::jsonb,
  artifact_declarations jsonb not null default '[]'::jsonb,
  revision integer not null default 1,
  created_by uuid not null references auth_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, version)
);

create table if not exists idempotency_keys (
  actor_id uuid not null references auth_users(id),
  scope text not null,
  idempotency_key text not null,
  request_hash text not null,
  response_status integer not null,
  response_body jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, scope, idempotency_key)
);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth_users(id),
  action text not null,
  resource_type text not null,
  resource_id text,
  outcome text not null check (outcome in ('allowed', 'denied', 'failed')),
  request_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists account_operation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth_users(id),
  request_type text not null check (request_type in ('recovery', 'deletion', 'copyright-complaint')),
  status text not null check (status in ('received', 'in-review', 'resolved', 'rejected')),
  contact text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists auth_sessions_active_idx on auth_sessions(token_hash, expires_at) where revoked_at is null;
create index if not exists project_memberships_user_idx on project_memberships(user_id, project_id);
create index if not exists author_versions_project_idx on author_project_versions(project_id, updated_at desc);
create index if not exists project_invitations_project_idx on project_invitations(project_id, status);
create index if not exists audit_events_resource_idx on audit_events(resource_type, resource_id, created_at desc);
create index if not exists audit_events_actor_idx on audit_events(actor_id, created_at desc);

create or replace function reject_audit_event_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_events is append-only';
end;
$$;

drop trigger if exists audit_events_append_only on audit_events;
create trigger audit_events_append_only
before update or delete on audit_events
for each row execute function reject_audit_event_mutation();
