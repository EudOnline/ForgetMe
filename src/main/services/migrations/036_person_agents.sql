create table if not exists person_agents (
  id text primary key,
  canonical_person_id text not null,
  status text not null,
  promotion_tier text not null,
  promotion_score real not null,
  promotion_reason_summary text not null,
  facts_version integer not null default 0,
  interaction_version integer not null default 0,
  last_refreshed_at text,
  last_activated_at text,
  created_at text not null,
  updated_at text not null,
  foreign key(canonical_person_id) references canonical_people(id)
);

create unique index if not exists uq_person_agents_canonical_person_id
  on person_agents(canonical_person_id);

create index if not exists idx_person_agents_status
  on person_agents(status);

create table if not exists person_agent_fact_memory (
  id text primary key,
  person_agent_id text not null,
  canonical_person_id text not null,
  memory_key text not null,
  section_key text not null,
  display_label text not null,
  summary_value text not null,
  memory_kind text not null,
  confidence real,
  conflict_state text not null,
  freshness_at text,
  source_refs_json text not null default '[]',
  source_hash text not null,
  created_at text not null,
  updated_at text not null,
  foreign key(person_agent_id) references person_agents(id),
  foreign key(canonical_person_id) references canonical_people(id)
);

create index if not exists idx_person_agent_fact_memory_canonical_person_id
  on person_agent_fact_memory(canonical_person_id);

create index if not exists idx_person_agent_fact_memory_person_agent_memory_key
  on person_agent_fact_memory(person_agent_id, memory_key);

create table if not exists person_agent_interaction_memory (
  id text primary key,
  person_agent_id text not null,
  canonical_person_id text not null,
  memory_key text not null,
  topic_label text not null,
  summary text not null,
  question_count integer not null default 0,
  citation_count integer not null default 0,
  outcome_kinds_json text not null default '[]',
  supporting_turn_ids_json text not null default '[]',
  last_question_at text,
  last_citation_at text,
  created_at text not null,
  updated_at text not null,
  foreign key(person_agent_id) references person_agents(id),
  foreign key(canonical_person_id) references canonical_people(id)
);

create index if not exists idx_person_agent_interaction_memory_canonical_person_id
  on person_agent_interaction_memory(canonical_person_id);

create index if not exists idx_person_agent_interaction_memory_person_agent_memory_key
  on person_agent_interaction_memory(person_agent_id, memory_key);

create table if not exists person_agent_refresh_queue (
  id text primary key,
  canonical_person_id text not null,
  person_agent_id text,
  status text not null,
  reasons_json text not null default '[]',
  requested_at text not null,
  started_at text,
  completed_at text,
  last_error text,
  created_at text not null,
  updated_at text not null,
  foreign key(person_agent_id) references person_agents(id),
  foreign key(canonical_person_id) references canonical_people(id)
);

create index if not exists idx_person_agent_refresh_queue_status
  on person_agent_refresh_queue(status);

create index if not exists idx_person_agent_refresh_queue_canonical_person_id
  on person_agent_refresh_queue(canonical_person_id);

create table if not exists person_agent_audit_events (
  id text primary key,
  person_agent_id text,
  canonical_person_id text not null,
  event_kind text not null,
  payload_json text not null default '{}',
  created_at text not null,
  foreign key(person_agent_id) references person_agents(id),
  foreign key(canonical_person_id) references canonical_people(id)
);

create index if not exists idx_person_agent_audit_events_canonical_person_id
  on person_agent_audit_events(canonical_person_id);

create index if not exists idx_person_agent_audit_events_person_agent_id
  on person_agent_audit_events(person_agent_id);
