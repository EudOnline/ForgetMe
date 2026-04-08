create table if not exists person_agent_consultation_sessions (
  id text primary key,
  person_agent_id text not null,
  canonical_person_id text not null,
  title text not null,
  latest_question text,
  turn_count integer not null default 0,
  created_at text not null,
  updated_at text not null,
  foreign key(person_agent_id) references person_agents(id),
  foreign key(canonical_person_id) references canonical_people(id)
);

create index if not exists idx_person_agent_consultation_sessions_person_agent_id
  on person_agent_consultation_sessions(person_agent_id);

create index if not exists idx_person_agent_consultation_sessions_canonical_person_id
  on person_agent_consultation_sessions(canonical_person_id);

create table if not exists person_agent_consultation_turns (
  id text primary key,
  session_id text not null,
  person_agent_id text not null,
  canonical_person_id text not null,
  ordinal integer not null,
  question text not null,
  answer_pack_json text not null,
  created_at text not null,
  foreign key(session_id) references person_agent_consultation_sessions(id),
  foreign key(person_agent_id) references person_agents(id),
  foreign key(canonical_person_id) references canonical_people(id)
);

create index if not exists idx_person_agent_consultation_turns_session_id
  on person_agent_consultation_turns(session_id, ordinal);

create table if not exists person_agent_runtime_state (
  person_agent_id text primary key,
  canonical_person_id text not null,
  active_session_id text,
  session_count integer not null default 0,
  total_turn_count integer not null default 0,
  latest_question text,
  latest_question_classification text,
  last_answer_digest text,
  last_consulted_at text,
  updated_at text not null,
  foreign key(person_agent_id) references person_agents(id),
  foreign key(canonical_person_id) references canonical_people(id),
  foreign key(active_session_id) references person_agent_consultation_sessions(id)
);

create index if not exists idx_person_agent_runtime_state_canonical_person_id
  on person_agent_runtime_state(canonical_person_id);
