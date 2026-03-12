create table if not exists decision_batches (
  id text primary key,
  batch_type text not null,
  status text not null,
  canonical_person_id text,
  canonical_person_name_snapshot text,
  item_type text not null,
  field_key text,
  item_count integer not null,
  journal_id text,
  created_by text not null,
  created_at text not null,
  undone_at text,
  undone_by text
);

create index if not exists idx_decision_batches_status_created_at on decision_batches(status, created_at desc);
create index if not exists idx_decision_batches_person_field on decision_batches(canonical_person_id, item_type, field_key);

create table if not exists decision_batch_items (
  id text primary key,
  batch_id text not null,
  queue_item_id text not null,
  decision_journal_id text not null,
  ordinal integer not null,
  created_at text not null,
  foreign key(batch_id) references decision_batches(id),
  foreign key(queue_item_id) references review_queue(id),
  foreign key(decision_journal_id) references decision_journal(id)
);

create unique index if not exists idx_decision_batch_items_batch_queue on decision_batch_items(batch_id, queue_item_id);
create unique index if not exists idx_decision_batch_items_batch_journal on decision_batch_items(batch_id, decision_journal_id);
create index if not exists idx_decision_batch_items_batch_ordinal on decision_batch_items(batch_id, ordinal asc);
