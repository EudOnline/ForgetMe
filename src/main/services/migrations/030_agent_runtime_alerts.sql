create table if not exists agent_runtime_alerts (
  id text primary key,
  fingerprint text not null unique,
  severity text not null,
  status text not null,
  objective_id text not null,
  proposal_id text,
  first_event_id text not null,
  latest_event_id text not null,
  event_count integer not null default 1,
  title text not null,
  detail text,
  opened_at text not null,
  last_seen_at text not null,
  acknowledged_at text,
  acknowledged_by text,
  resolved_at text
);

create index if not exists idx_agent_runtime_alerts_status_severity
  on agent_runtime_alerts(status, severity, last_seen_at desc);

create index if not exists idx_agent_runtime_alerts_objective
  on agent_runtime_alerts(objective_id, proposal_id, status);
