create table if not exists redaction_policies (
  id text primary key,
  policy_key text not null unique,
  enhancer_type text not null,
  status text not null default 'active',
  rules_json text not null default '{}',
  created_at text not null,
  updated_at text not null
);

create table if not exists provider_egress_artifacts (
  id text primary key,
  job_id text not null,
  file_id text not null,
  provider text not null,
  model text not null,
  enhancer_type text not null,
  policy_key text not null,
  request_hash text not null,
  redaction_summary_json text not null default '{}',
  created_at text not null,
  foreign key(job_id) references enrichment_jobs(id),
  foreign key(file_id) references vault_files(id)
);

create table if not exists provider_egress_events (
  id text primary key,
  artifact_id text not null,
  event_type text not null,
  payload_json text not null,
  created_at text not null,
  foreign key(artifact_id) references provider_egress_artifacts(id)
);

create index if not exists idx_redaction_policies_key on redaction_policies(policy_key, status);
create index if not exists idx_provider_egress_artifacts_job on provider_egress_artifacts(job_id, created_at);
create index if not exists idx_provider_egress_artifacts_policy on provider_egress_artifacts(policy_key, provider);
create index if not exists idx_provider_egress_events_artifact on provider_egress_events(artifact_id, event_type, created_at);
