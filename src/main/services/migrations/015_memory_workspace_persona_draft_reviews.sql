create table if not exists persona_draft_reviews (
  id text primary key,
  source_turn_id text not null unique,
  scope_kind text not null,
  scope_target_id text,
  workflow_kind text not null,
  status text not null,
  base_draft text not null,
  edited_draft text not null,
  review_notes text not null default '',
  supporting_excerpts_json text not null default '[]',
  trace_json text not null default '[]',
  approved_journal_id text,
  rejected_journal_id text,
  created_at text not null,
  updated_at text not null,
  foreign key(source_turn_id) references memory_workspace_turns(id),
  foreign key(approved_journal_id) references decision_journal(id),
  foreign key(rejected_journal_id) references decision_journal(id)
);

create index if not exists idx_persona_draft_reviews_status_updated
  on persona_draft_reviews(status, updated_at desc, created_at desc);

create index if not exists idx_persona_draft_reviews_scope_updated
  on persona_draft_reviews(scope_kind, scope_target_id, updated_at desc, created_at desc);
