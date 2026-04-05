alter table agent_runtime_alerts add column first_event_rowid integer not null default 0;
alter table agent_runtime_alerts add column latest_event_rowid integer not null default 0;

update agent_runtime_alerts
set
  first_event_rowid = coalesce((
    select rowid
    from agent_runtime_events
    where id = agent_runtime_alerts.first_event_id
  ), first_event_rowid),
  latest_event_rowid = coalesce((
    select rowid
    from agent_runtime_events
    where id = agent_runtime_alerts.latest_event_id
  ), latest_event_rowid);

create index if not exists idx_agent_runtime_alerts_latest_event_rowid
  on agent_runtime_alerts(latest_event_rowid desc, status, severity);
