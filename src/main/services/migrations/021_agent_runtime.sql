create table if not exists agent_runs (
  id text primary key,
  role text not null,
  task_kind text,
  status text not null,
  prompt text not null,
  confirmation_token text,
  policy_version text,
  error_message text,
  created_at text not null,
  updated_at text not null
);

create index if not exists idx_agent_runs_created_at
  on agent_runs(created_at desc);

create index if not exists idx_agent_runs_status
  on agent_runs(status);

create index if not exists idx_agent_runs_role
  on agent_runs(role);

create table if not exists agent_messages (
  id text primary key,
  run_id text not null,
  ordinal integer not null,
  sender text not null,
  content text not null,
  created_at text not null,
  foreign key(run_id) references agent_runs(id)
);

create unique index if not exists uq_agent_messages_run_ordinal
  on agent_messages(run_id, ordinal asc);

create index if not exists idx_agent_messages_run_id
  on agent_messages(run_id);

create table if not exists agent_memories (
  id text primary key,
  role text not null,
  memory_key text not null,
  memory_value text not null,
  created_at text not null,
  updated_at text not null
);

create unique index if not exists uq_agent_memories_role_key
  on agent_memories(role, memory_key);

create index if not exists idx_agent_memories_role
  on agent_memories(role);

create table if not exists agent_policy_versions (
  id text primary key,
  role text not null,
  policy_key text not null,
  policy_body text not null,
  created_at text not null
);

create index if not exists idx_agent_policy_versions_role
  on agent_policy_versions(role);
