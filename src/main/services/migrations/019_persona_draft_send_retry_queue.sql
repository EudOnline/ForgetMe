create table if not exists persona_draft_provider_send_retry_jobs (
  id text primary key,
  failed_artifact_id text not null unique,
  draft_review_id text not null,
  source_turn_id text not null,
  destination_id text,
  destination_label text,
  status text not null,
  auto_retry_attempt_index integer not null,
  next_retry_at text not null,
  claimed_at text,
  retry_artifact_id text,
  last_error_message text,
  created_at text not null,
  updated_at text not null
);
