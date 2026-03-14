create table if not exists memory_workspace_compare_matrices (
  id text primary key,
  title text not null,
  row_count integer not null default 0,
  completed_row_count integer not null default 0,
  failed_row_count integer not null default 0,
  target_labels_json text not null default '[]',
  judge_enabled integer not null default 0,
  judge_status text not null default 'disabled',
  created_at text not null,
  updated_at text not null
);

create index if not exists idx_memory_workspace_compare_matrices_updated
  on memory_workspace_compare_matrices(updated_at desc, created_at desc);

create table if not exists memory_workspace_compare_matrix_rows (
  id text primary key,
  matrix_session_id text not null,
  ordinal integer not null,
  label text,
  scope_kind text not null,
  scope_target_id text,
  question text not null,
  status text not null,
  error_message text,
  compare_session_id text,
  recommended_compare_run_id text,
  recommended_target_label text,
  failed_run_count integer not null default 0,
  created_at text not null,
  foreign key(matrix_session_id) references memory_workspace_compare_matrices(id)
);

create unique index if not exists idx_memory_workspace_compare_matrix_rows_session_ordinal
  on memory_workspace_compare_matrix_rows(matrix_session_id, ordinal);

create index if not exists idx_memory_workspace_compare_matrix_rows_session_created
  on memory_workspace_compare_matrix_rows(matrix_session_id, created_at asc);
