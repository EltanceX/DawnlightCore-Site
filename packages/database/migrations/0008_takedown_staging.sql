alter table author_project_versions
  drop constraint if exists author_project_versions_status_check;

alter table author_project_versions
  add constraint author_project_versions_status_check check (status in (
    'draft', 'validating', 'loader-failed', 'awaiting-review',
    'changes-requested', 'rejected', 'approved', 'publishing', 'publish-failed',
    'published', 'withdrawn', 'taken-down'
  ));

alter table review_submissions
  drop constraint if exists review_submissions_status_check;

alter table review_submissions
  add constraint review_submissions_status_check check (status in (
    'awaiting-review', 'changes-requested', 'rejected', 'approved',
    'publishing', 'publish-failed', 'published', 'withdrawn', 'taken-down'
  ));

alter table published_artifacts
  drop constraint if exists published_artifacts_status_check;

alter table published_artifacts
  add constraint published_artifacts_status_check
  check (status in ('available', 'withdrawn', 'taken-down'));

alter table moderation_actions
  drop constraint if exists moderation_actions_action_check;

alter table moderation_actions
  add constraint moderation_actions_action_check
  check (action in ('hide', 'unhide', 'ban', 'unban', 'withdraw', 'resolve', 'takedown'));

create table if not exists takedown_decisions (
  id uuid primary key default gen_random_uuid(),
  project_version_id uuid not null unique references author_project_versions(id),
  published_artifact_id uuid not null unique references published_artifacts(id),
  actor_id uuid not null references auth_users(id),
  category text not null check (category in (
    'malicious-package', 'credential-exposure', 'copyright', 'legal', 'security'
  )),
  private_reason text not null check (length(private_reason) between 10 and 4000),
  public_notice text check (public_notice is null or length(public_notice) between 10 and 1000),
  object_key text not null,
  public_url text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size bigint not null check (size > 0),
  blocked_at timestamptz not null default now(),
  request_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists takedown_evidence_outbox (
  decision_id uuid primary key references takedown_decisions(id),
  status text not null default 'pending'
    check (status in ('pending', 'retained', 'failed')),
  evidence_object_key text,
  failure_summary text not null default '',
  dispatch_attempts integer not null default 0,
  dispatched_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists takedown_evidence_pending_idx
  on takedown_evidence_outbox(created_at)
  where status in ('pending', 'failed') and dispatched_at is null;

create or replace function reject_takedown_decision_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'takedown_decisions is append-only';
end;
$$;

drop trigger if exists takedown_decisions_append_only on takedown_decisions;
create trigger takedown_decisions_append_only
before update or delete on takedown_decisions
for each row execute function reject_takedown_decision_mutation();
