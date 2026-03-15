alter table memory_workspace_compare_sessions
  add column expression_mode text not null default 'grounded';

update memory_workspace_compare_sessions
set expression_mode = 'grounded'
where expression_mode is null or trim(expression_mode) = '';

alter table memory_workspace_compare_matrices
  add column expression_mode text not null default 'grounded';

update memory_workspace_compare_matrices
set expression_mode = 'grounded'
where expression_mode is null or trim(expression_mode) = '';
