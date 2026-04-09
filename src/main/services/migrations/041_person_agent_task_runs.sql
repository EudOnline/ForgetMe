create table if not exists person_agent_task_runs (
  id text primary key,
  task_id text not null,
  task_key text not null,
  person_agent_id text not null,
  canonical_person_id text not null,
  task_kind text not null,
  run_status text not null,
  summary text not null,
  suggested_question text,
  action_items_json text not null default '[]',
  source text,
  created_at text not null,
  updated_at text not null,
  foreign key(person_agent_id) references person_agents(id),
  foreign key(canonical_person_id) references canonical_people(id)
);

create index if not exists idx_person_agent_task_runs_task_id
  on person_agent_task_runs(task_id, created_at desc);

create index if not exists idx_person_agent_task_runs_canonical_person_id
  on person_agent_task_runs(canonical_person_id, created_at desc);
