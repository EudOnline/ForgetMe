create table if not exists enrichment_attempts (
  id text primary key,
  job_id text not null,
  attempt_index integer not null,
  provider text not null,
  model text not null,
  status text not null default 'processing',
  started_at text not null,
  finished_at text,
  error_kind text,
  error_message text,
  usage_json text not null default '{}',
  created_at text not null,
  foreign key(job_id) references enrichment_jobs(id)
);

create table if not exists person_profile_attributes (
  id text primary key,
  canonical_person_id text not null,
  attribute_group text not null,
  attribute_key text not null,
  value_json text not null,
  display_value text not null,
  source_file_id text,
  source_evidence_id text,
  source_candidate_id text,
  provenance_json text not null default '{}',
  confidence real not null default 0,
  status text not null default 'active',
  approved_journal_id text,
  created_at text not null,
  updated_at text not null,
  foreign key(canonical_person_id) references canonical_people(id),
  foreign key(source_file_id) references vault_files(id),
  foreign key(source_evidence_id) references enriched_evidence(id),
  foreign key(approved_journal_id) references decision_journal(id)
);

create table if not exists profile_attribute_candidates (
  id text primary key,
  proposed_canonical_person_id text,
  source_file_id text,
  source_evidence_id text,
  source_candidate_id text,
  attribute_group text not null,
  attribute_key text not null,
  value_json text not null,
  proposal_basis_json text not null,
  reason_code text not null,
  confidence real not null,
  status text not null default 'pending',
  created_at text not null,
  reviewed_at text,
  review_note text,
  approved_journal_id text,
  foreign key(proposed_canonical_person_id) references canonical_people(id),
  foreign key(source_file_id) references vault_files(id),
  foreign key(source_evidence_id) references enriched_evidence(id),
  foreign key(approved_journal_id) references decision_journal(id)
);

create index if not exists idx_enrichment_attempts_job_attempt on enrichment_attempts(job_id, attempt_index);
create index if not exists idx_enrichment_attempts_status on enrichment_attempts(status, started_at);
create index if not exists idx_person_profile_attributes_person on person_profile_attributes(canonical_person_id, status);
create index if not exists idx_person_profile_attributes_key on person_profile_attributes(attribute_group, attribute_key, status);
create index if not exists idx_profile_attribute_candidates_status on profile_attribute_candidates(status, reason_code);
create index if not exists idx_profile_attribute_candidates_person on profile_attribute_candidates(proposed_canonical_person_id, status);
