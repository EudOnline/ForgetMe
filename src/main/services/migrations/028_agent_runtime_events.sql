create table if not exists agent_runtime_events (
  id text primary key,
  objective_id text not null references agent_objectives(id) on delete cascade,
  thread_id text references agent_threads(id) on delete set null,
  proposal_id text references agent_proposals(id) on delete set null,
  event_type text not null,
  payload_json text not null,
  created_at text not null
);

create index if not exists idx_agent_runtime_events_objective
  on agent_runtime_events(objective_id, created_at);

create index if not exists idx_agent_runtime_events_proposal
  on agent_runtime_events(proposal_id, event_type, created_at);

create index if not exists idx_agent_runtime_events_type
  on agent_runtime_events(event_type, created_at);
