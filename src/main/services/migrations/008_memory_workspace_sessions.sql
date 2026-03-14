create table if not exists memory_workspace_sessions (
  id text primary key,
  scope_kind text not null,
  scope_target_id text,
  title text not null,
  latest_question text,
  turn_count integer not null default 0,
  created_at text not null,
  updated_at text not null
);

create index if not exists idx_memory_workspace_sessions_scope_updated
  on memory_workspace_sessions(scope_kind, scope_target_id, updated_at desc, created_at desc);

create table if not exists memory_workspace_turns (
  id text primary key,
  session_id text not null,
  ordinal integer not null,
  question text not null,
  response_json text not null,
  provider text,
  model text,
  prompt_hash text not null,
  context_hash text not null,
  created_at text not null,
  foreign key(session_id) references memory_workspace_sessions(id)
);

create unique index if not exists idx_memory_workspace_turns_session_ordinal
  on memory_workspace_turns(session_id, ordinal);
create index if not exists idx_memory_workspace_turns_session_created
  on memory_workspace_turns(session_id, created_at asc);
