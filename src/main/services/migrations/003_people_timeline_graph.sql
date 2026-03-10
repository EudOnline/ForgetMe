create table if not exists canonical_people (
  id text primary key,
  primary_display_name text not null,
  normalized_name text not null,
  alias_count integer not null default 0,
  first_seen_at text,
  last_seen_at text,
  evidence_count integer not null default 0,
  manual_labels_json text not null default '[]',
  status text not null default 'approved',
  created_at text not null,
  updated_at text not null
);

create table if not exists person_aliases (
  id text primary key,
  canonical_person_id text not null,
  anchor_person_id text,
  display_name text not null,
  normalized_name text not null,
  source_type text not null,
  confidence real not null,
  created_at text not null,
  foreign key(canonical_person_id) references canonical_people(id),
  foreign key(anchor_person_id) references people(id)
);

create table if not exists person_memberships (
  id text primary key,
  canonical_person_id text not null,
  anchor_person_id text not null,
  status text not null default 'active',
  created_at text not null,
  updated_at text not null,
  foreign key(canonical_person_id) references canonical_people(id),
  foreign key(anchor_person_id) references people(id)
);

create table if not exists person_merge_candidates (
  id text primary key,
  left_canonical_person_id text not null,
  right_canonical_person_id text not null,
  confidence real not null,
  matched_rules_json text not null,
  supporting_evidence_json text not null,
  status text not null default 'pending',
  created_at text not null,
  reviewed_at text,
  review_note text,
  approved_journal_id text,
  foreign key(left_canonical_person_id) references canonical_people(id),
  foreign key(right_canonical_person_id) references canonical_people(id)
);

create table if not exists event_clusters (
  id text primary key,
  title text not null,
  time_start text not null,
  time_end text not null,
  summary text,
  status text not null default 'approved',
  source_candidate_id text,
  created_at text not null,
  updated_at text not null
);

create table if not exists event_cluster_members (
  id text primary key,
  event_cluster_id text not null,
  canonical_person_id text not null,
  created_at text not null,
  foreign key(event_cluster_id) references event_clusters(id),
  foreign key(canonical_person_id) references canonical_people(id)
);

create table if not exists event_cluster_evidence (
  id text primary key,
  event_cluster_id text not null,
  file_id text not null,
  created_at text not null,
  foreign key(event_cluster_id) references event_clusters(id),
  foreign key(file_id) references vault_files(id)
);

create table if not exists event_cluster_candidates (
  id text primary key,
  proposed_title text not null,
  time_start text not null,
  time_end text not null,
  confidence real not null,
  supporting_evidence_json text not null,
  status text not null default 'pending',
  created_at text not null,
  reviewed_at text,
  review_note text,
  approved_journal_id text
);

create table if not exists review_queue (
  id text primary key,
  item_type text not null,
  candidate_id text not null,
  status text not null default 'pending',
  priority integer not null default 0,
  confidence real not null default 0,
  summary_json text not null,
  created_at text not null,
  reviewed_at text
);

create table if not exists decision_journal (
  id text primary key,
  decision_type text not null,
  target_type text not null,
  target_id text not null,
  operation_payload_json text not null,
  undo_payload_json text not null,
  actor text not null,
  created_at text not null,
  undone_at text,
  undone_by text
);

create table if not exists canonical_relationship_labels (
  id text primary key,
  from_person_id text not null,
  to_person_id text not null,
  label text not null,
  status text not null default 'approved',
  created_at text not null,
  updated_at text not null,
  foreign key(from_person_id) references canonical_people(id),
  foreign key(to_person_id) references canonical_people(id)
);

create index if not exists idx_canonical_people_status on canonical_people(status);
create index if not exists idx_canonical_people_name on canonical_people(normalized_name);
create index if not exists idx_person_memberships_anchor on person_memberships(anchor_person_id);
create index if not exists idx_person_memberships_canonical on person_memberships(canonical_person_id);
create index if not exists idx_person_merge_candidates_status on person_merge_candidates(status);
create index if not exists idx_event_clusters_time on event_clusters(time_start, time_end);
create index if not exists idx_event_cluster_candidates_status on event_cluster_candidates(status);
create index if not exists idx_review_queue_status on review_queue(status, item_type);
create index if not exists idx_decision_journal_target on decision_journal(target_type, target_id);
