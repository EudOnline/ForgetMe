create table if not exists person_agent_tasks (
  id text primary key,
  person_agent_id text not null,
  canonical_person_id text not null,
  task_kind text not null,
  status text not null,
  priority text not null,
  title text not null,
  summary text not null,
  source_ref_json text not null default '{}',
  created_at text not null,
  updated_at text not null,
  foreign key(person_agent_id) references person_agents(id),
  foreign key(canonical_person_id) references canonical_people(id)
);

create index if not exists idx_person_agent_tasks_person_agent_id
  on person_agent_tasks(person_agent_id);

create index if not exists idx_person_agent_tasks_canonical_person_id
  on person_agent_tasks(canonical_person_id);

create index if not exists idx_person_agent_tasks_status_priority
  on person_agent_tasks(status, priority, updated_at);
