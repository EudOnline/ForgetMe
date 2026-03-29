alter table agent_runs
  add column target_role text;

alter table agent_runs
  add column assigned_roles_json text not null default '[]';

alter table agent_runs
  add column latest_assistant_response text;
