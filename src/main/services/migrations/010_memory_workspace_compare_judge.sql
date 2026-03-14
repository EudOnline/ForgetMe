create table if not exists memory_workspace_compare_judgements (
  compare_run_id text primary key,
  status text not null,
  provider text,
  model text,
  decision text,
  score integer,
  rationale text,
  strengths_json text not null default '[]',
  concerns_json text not null default '[]',
  error_message text,
  created_at text,
  foreign key(compare_run_id) references memory_workspace_compare_runs(id)
);

create index if not exists idx_memory_workspace_compare_judgements_status
  on memory_workspace_compare_judgements(status, created_at asc);
