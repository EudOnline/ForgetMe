create table if not exists persona_draft_share_host_artifacts (
  id text primary key,
  share_link_id text not null,
  draft_review_id text not null,
  publication_id text not null,
  source_turn_id text not null,
  operation_kind text not null,
  host_kind text not null,
  host_label text not null,
  request_hash text not null,
  created_at text not null,
  foreign key(draft_review_id) references persona_draft_reviews(id),
  foreign key(source_turn_id) references memory_workspace_turns(id)
);

create table if not exists persona_draft_share_host_events (
  id text primary key,
  artifact_id text not null,
  event_type text not null,
  payload_json text not null,
  created_at text not null,
  foreign key(artifact_id) references persona_draft_share_host_artifacts(id)
);

create index if not exists idx_persona_draft_share_host_artifacts_review
  on persona_draft_share_host_artifacts(draft_review_id, created_at);

create index if not exists idx_persona_draft_share_host_events_artifact
  on persona_draft_share_host_events(artifact_id, event_type, created_at);
