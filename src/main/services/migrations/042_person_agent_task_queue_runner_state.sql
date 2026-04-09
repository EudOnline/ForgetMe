create table if not exists person_agent_task_queue_runner_state (
  runner_name text primary key,
  status text not null,
  last_started_at text,
  last_completed_at text,
  last_failed_at text,
  last_processed_task_count integer not null default 0,
  total_processed_task_count integer not null default 0,
  last_error text,
  updated_at text not null
);

create index if not exists idx_person_agent_task_queue_runner_state_updated_at
  on person_agent_task_queue_runner_state(updated_at desc);
