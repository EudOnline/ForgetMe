create table if not exists persona_draft_provider_egress_artifacts (
  id text primary key,
  draft_review_id text not null,
  source_turn_id text not null,
  provider text not null,
  model text not null,
  policy_key text not null,
  request_hash text not null,
  redaction_summary_json text not null default '{}',
  created_at text not null,
  foreign key(draft_review_id) references persona_draft_reviews(id),
  foreign key(source_turn_id) references memory_workspace_turns(id)
);

create table if not exists persona_draft_provider_egress_events (
  id text primary key,
  artifact_id text not null,
  event_type text not null,
  payload_json text not null,
  created_at text not null,
  foreign key(artifact_id) references persona_draft_provider_egress_artifacts(id)
);

create index if not exists idx_persona_draft_provider_egress_artifacts_review
  on persona_draft_provider_egress_artifacts(draft_review_id, created_at);
create index if not exists idx_persona_draft_provider_egress_events_artifact
  on persona_draft_provider_egress_events(artifact_id, event_type, created_at);
