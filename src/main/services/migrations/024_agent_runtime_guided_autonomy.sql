alter table agent_suggestions
  add column priority text not null default 'medium';

alter table agent_suggestions
  add column rationale text not null default '';

alter table agent_suggestions
  add column auto_runnable integer not null default 0;

alter table agent_suggestions
  add column follow_up_of_suggestion_id text;

alter table agent_suggestions
  add column attempt_count integer not null default 0;

alter table agent_suggestions
  add column cooldown_until text;

alter table agent_suggestions
  add column last_attempted_at text;

alter table agent_runs
  add column execution_origin text not null default 'operator_manual';

create table if not exists agent_runtime_settings (
  settings_id text primary key,
  autonomy_mode text not null,
  updated_at text not null
);

create index if not exists idx_agent_suggestions_priority
  on agent_suggestions(priority, last_observed_at desc);

create index if not exists idx_agent_suggestions_auto_runnable
  on agent_suggestions(auto_runnable, status);

create index if not exists idx_agent_suggestions_cooldown_until
  on agent_suggestions(cooldown_until);

create index if not exists idx_agent_suggestions_follow_up_of_suggestion_id
  on agent_suggestions(follow_up_of_suggestion_id);
