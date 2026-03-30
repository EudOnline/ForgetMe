create table if not exists agent_suggestions (
  id text primary key,
  trigger_kind text not null,
  status text not null,
  role text not null,
  task_kind text not null,
  task_input_json text not null,
  dedupe_key text not null,
  source_run_id text,
  executed_run_id text,
  created_at text not null,
  updated_at text not null,
  last_observed_at text not null
);

create unique index if not exists uq_agent_suggestions_dedupe_key
  on agent_suggestions(dedupe_key);

create index if not exists idx_agent_suggestions_status
  on agent_suggestions(status);

create index if not exists idx_agent_suggestions_role
  on agent_suggestions(role);

create index if not exists idx_agent_suggestions_last_observed_at
  on agent_suggestions(last_observed_at desc);
