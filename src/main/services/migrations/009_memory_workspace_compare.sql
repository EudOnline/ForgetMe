create table if not exists memory_workspace_compare_sessions (
  id text primary key,
  scope_kind text not null,
  scope_target_id text,
  title text not null,
  question text not null,
  run_count integer not null default 0,
  created_at text not null,
  updated_at text not null
);

create index if not exists idx_memory_workspace_compare_sessions_scope_updated
  on memory_workspace_compare_sessions(scope_kind, scope_target_id, updated_at desc, created_at desc);

create table if not exists memory_workspace_compare_runs (
  id text primary key,
  compare_session_id text not null,
  ordinal integer not null,
  target_id text not null,
  target_label text not null,
  execution_mode text not null,
  provider text,
  model text,
  status text not null,
  error_message text,
  response_json text,
  prompt_hash text not null,
  context_hash text not null,
  created_at text not null,
  foreign key(compare_session_id) references memory_workspace_compare_sessions(id)
);

create unique index if not exists idx_memory_workspace_compare_runs_session_ordinal
  on memory_workspace_compare_runs(compare_session_id, ordinal);

create index if not exists idx_memory_workspace_compare_runs_session_created
  on memory_workspace_compare_runs(compare_session_id, created_at asc);
