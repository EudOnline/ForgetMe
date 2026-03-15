alter table memory_workspace_compare_sessions
  add column workflow_kind text not null default 'default';

update memory_workspace_compare_sessions
set workflow_kind = 'default'
where workflow_kind is null or trim(workflow_kind) = '';
