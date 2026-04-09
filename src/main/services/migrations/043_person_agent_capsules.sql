create table if not exists person_agent_capsules (
  id text primary key,
  person_agent_id text not null unique,
  canonical_person_id text not null,
  capsule_status text not null,
  activation_source text not null,
  session_namespace text not null,
  workspace_root text not null,
  state_root text not null,
  identity_profile_json text not null default '{}',
  latest_checkpoint_id text,
  latest_checkpoint_at text,
  activated_at text not null,
  created_at text not null,
  updated_at text not null,
  foreign key(person_agent_id) references person_agents(id),
  foreign key(canonical_person_id) references canonical_people(id)
);

create index if not exists idx_person_agent_capsules_canonical_person_id
  on person_agent_capsules(canonical_person_id, updated_at desc);

create index if not exists idx_person_agent_capsules_updated_at
  on person_agent_capsules(updated_at desc);

create table if not exists person_agent_capsule_memory_checkpoints (
  id text primary key,
  capsule_id text not null,
  person_agent_id text not null,
  canonical_person_id text not null,
  checkpoint_kind text not null,
  facts_version integer not null,
  interaction_version integer not null,
  strategy_profile_version integer,
  task_snapshot_at text,
  summary text not null,
  summary_json text not null default '{}',
  created_at text not null,
  foreign key(capsule_id) references person_agent_capsules(id),
  foreign key(person_agent_id) references person_agents(id),
  foreign key(canonical_person_id) references canonical_people(id)
);

create index if not exists idx_person_agent_capsule_memory_checkpoints_capsule_id
  on person_agent_capsule_memory_checkpoints(capsule_id, created_at desc);

create index if not exists idx_person_agent_capsule_memory_checkpoints_person_agent_id
  on person_agent_capsule_memory_checkpoints(person_agent_id, created_at desc);
