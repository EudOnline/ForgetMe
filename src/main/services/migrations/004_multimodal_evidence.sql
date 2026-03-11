create table if not exists enrichment_jobs (
  id text primary key,
  file_id text not null,
  enhancer_type text not null,
  provider text not null,
  model text not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  input_hash text,
  started_at text,
  finished_at text,
  error_message text,
  usage_json text not null default '{}',
  created_at text not null,
  updated_at text not null,
  foreign key(file_id) references vault_files(id)
);

create table if not exists enrichment_artifacts (
  id text primary key,
  job_id text not null,
  artifact_type text not null,
  payload_json text not null,
  created_at text not null,
  foreign key(job_id) references enrichment_jobs(id)
);

create table if not exists enriched_evidence (
  id text primary key,
  file_id text not null,
  job_id text not null,
  evidence_type text not null,
  payload_json text not null,
  risk_level text not null default 'low',
  status text not null default 'approved',
  created_at text not null,
  updated_at text not null,
  foreign key(file_id) references vault_files(id),
  foreign key(job_id) references enrichment_jobs(id)
);

create table if not exists structured_field_candidates (
  id text primary key,
  file_id text not null,
  job_id text not null,
  field_type text not null,
  field_key text not null,
  field_value_json text not null,
  document_type text not null,
  confidence real not null,
  risk_level text not null,
  source_page integer,
  source_span_json text,
  status text not null default 'pending',
  created_at text not null,
  reviewed_at text,
  review_note text,
  approved_journal_id text,
  foreign key(file_id) references vault_files(id),
  foreign key(job_id) references enrichment_jobs(id),
  foreign key(approved_journal_id) references decision_journal(id)
);

create index if not exists idx_enrichment_jobs_status on enrichment_jobs(status);
create index if not exists idx_enrichment_jobs_file_type on enrichment_jobs(file_id, enhancer_type);
create index if not exists idx_enrichment_artifacts_job on enrichment_artifacts(job_id, artifact_type);
create index if not exists idx_enriched_evidence_file on enriched_evidence(file_id, evidence_type);
create index if not exists idx_structured_field_candidates_status on structured_field_candidates(status);
create index if not exists idx_structured_field_candidates_risk on structured_field_candidates(risk_level, field_key);
