create table if not exists agent_runtime_alert_projection_state (
  projection_key text primary key,
  last_event_rowid integer not null default 0,
  updated_at text not null
);
