alter table agent_runtime_settings
  rename to agent_runtime_settings_legacy;

create table if not exists agent_runtime_settings (
  settings_id text primary key check (settings_id = 'runtime'),
  disable_auto_commit integer not null default 0,
  force_operator_for_external_actions integer not null default 0,
  disable_nested_delegation integer not null default 0,
  updated_at text not null,
  updated_by text not null
);

insert into agent_runtime_settings (
  settings_id,
  disable_auto_commit,
  force_operator_for_external_actions,
  disable_nested_delegation,
  updated_at,
  updated_by
)
select
  'runtime',
  case
    when lower(coalesce(autonomy_mode, '')) in ('manual', 'operator_review', 'operator_only', 'disabled')
      then 1
    else 0
  end,
  0,
  0,
  coalesce(updated_at, '1970-01-01T00:00:00.000Z'),
  'migration'
from agent_runtime_settings_legacy
limit 1;

drop table agent_runtime_settings_legacy;

create table if not exists agent_runtime_setting_events (
  id text primary key,
  settings_id text not null references agent_runtime_settings(settings_id) on delete cascade,
  setting_key text not null,
  previous_value integer not null,
  next_value integer not null,
  actor text not null,
  created_at text not null
);

create index if not exists idx_agent_runtime_setting_events_created
  on agent_runtime_setting_events(created_at);
