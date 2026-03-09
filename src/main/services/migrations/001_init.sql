create table if not exists import_batches (
  id text primary key,
  source_label text not null,
  status text not null,
  created_at text not null,
  deleted_at text
);

create table if not exists vault_files (
  id text primary key,
  batch_id text not null,
  source_path text not null,
  frozen_path text not null,
  file_name text not null,
  extension text not null,
  mime_type text,
  file_size integer not null,
  sha256 text,
  duplicate_class text not null default 'unknown',
  parser_status text not null default 'pending',
  created_at text not null,
  deleted_at text,
  foreign key(batch_id) references import_batches(id)
);

create table if not exists file_derivatives (
  id text primary key,
  file_id text not null,
  derivative_type text not null,
  payload_json text not null,
  created_at text not null,
  foreign key(file_id) references vault_files(id)
);

create table if not exists people (
  id text primary key,
  display_name text not null,
  source_type text not null,
  confidence real not null,
  created_at text not null
);

create table if not exists relations (
  id text primary key,
  source_id text not null,
  source_type text not null,
  target_id text not null,
  target_type text not null,
  relation_type text not null,
  confidence real,
  created_at text not null
);

create table if not exists audit_logs (
  id text primary key,
  action text not null,
  entity_id text not null,
  entity_type text not null,
  actor text not null,
  payload_json text,
  created_at text not null
);
