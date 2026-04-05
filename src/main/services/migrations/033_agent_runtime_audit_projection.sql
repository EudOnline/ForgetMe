create table if not exists agent_runtime_audit_projection_state (
  projection_key text primary key,
  last_event_rowid integer not null default 0,
  updated_at text not null
);

create table if not exists agent_runtime_audit_buckets (
  bucket_kind text not null,
  bucket_label text not null,
  count integer not null default 0,
  primary key (bucket_kind, bucket_label)
);

create index if not exists idx_agent_runtime_audit_buckets_kind_count
  on agent_runtime_audit_buckets(bucket_kind, count desc, bucket_label asc);
