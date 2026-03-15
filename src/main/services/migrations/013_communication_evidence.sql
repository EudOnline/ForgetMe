create table if not exists communication_evidence (
  id text primary key,
  file_id text not null,
  ordinal integer not null,
  speaker_display_name text,
  speaker_anchor_person_id text,
  excerpt_text text not null,
  created_at text not null,
  foreign key(file_id) references vault_files(id),
  foreign key(speaker_anchor_person_id) references people(id)
);

create index if not exists idx_communication_evidence_file_id
  on communication_evidence(file_id);

create index if not exists idx_communication_evidence_speaker_anchor_person_id
  on communication_evidence(speaker_anchor_person_id);

create index if not exists idx_communication_evidence_ordinal
  on communication_evidence(ordinal);
