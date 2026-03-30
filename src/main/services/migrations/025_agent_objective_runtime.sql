create table if not exists agent_objectives (
  id text primary key,
  title text not null,
  objective_kind text not null,
  status text not null,
  prompt text not null,
  initiated_by text not null,
  owner_role text not null,
  main_thread_id text,
  risk_level text not null,
  budget_json text,
  requires_operator_input integer not null default 0,
  created_at text not null,
  updated_at text not null
);

create index if not exists idx_agent_objectives_status_created_at
  on agent_objectives(status, created_at desc);

create table if not exists agent_threads (
  id text primary key,
  objective_id text not null,
  parent_thread_id text,
  thread_kind text not null,
  owner_role text not null,
  title text not null,
  status text not null,
  created_at text not null,
  updated_at text not null,
  closed_at text,
  foreign key(objective_id) references agent_objectives(id),
  foreign key(parent_thread_id) references agent_threads(id)
);

create index if not exists idx_agent_threads_objective_parent
  on agent_threads(objective_id, parent_thread_id);

create table if not exists agent_thread_participants (
  id text primary key,
  objective_id text not null,
  thread_id text not null,
  participant_kind text not null,
  participant_id text not null,
  role text,
  display_label text not null,
  invited_by_participant_id text,
  joined_at text not null,
  left_at text,
  foreign key(objective_id) references agent_objectives(id),
  foreign key(thread_id) references agent_threads(id)
);

create index if not exists idx_agent_thread_participants_thread
  on agent_thread_participants(thread_id, joined_at asc);

create table if not exists agent_messages_v2 (
  id text primary key,
  objective_id text not null,
  thread_id text not null,
  from_participant_id text not null,
  to_participant_id text,
  kind text not null,
  body text not null,
  refs_json text not null default '[]',
  reply_to_message_id text,
  round integer not null,
  confidence real,
  blocking integer not null default 0,
  created_at text not null,
  foreign key(objective_id) references agent_objectives(id),
  foreign key(thread_id) references agent_threads(id),
  foreign key(reply_to_message_id) references agent_messages_v2(id)
);

create index if not exists idx_agent_messages_v2_thread_round
  on agent_messages_v2(thread_id, round asc);

create index if not exists idx_agent_messages_v2_thread_created_at
  on agent_messages_v2(thread_id, created_at asc);

create table if not exists agent_proposals (
  id text primary key,
  objective_id text not null,
  thread_id text not null,
  proposed_by text not null,
  proposal_kind text not null,
  payload_json text not null,
  owner_role text not null,
  status text not null,
  required_approvals_json text not null default '[]',
  allow_veto_by_json text not null default '[]',
  requires_operator_confirmation integer not null default 0,
  tool_policy_id text,
  budget_json text,
  derived_from_message_ids_json text not null default '[]',
  artifact_refs_json text not null default '[]',
  created_at text not null,
  updated_at text not null,
  committed_at text,
  foreign key(objective_id) references agent_objectives(id),
  foreign key(thread_id) references agent_threads(id)
);

create index if not exists idx_agent_proposals_objective_status_owner
  on agent_proposals(objective_id, status, owner_role);

create table if not exists agent_votes (
  id text primary key,
  objective_id text not null,
  thread_id text not null,
  proposal_id text not null,
  voter_role text not null,
  vote text not null,
  comment text,
  artifact_refs_json text not null default '[]',
  created_at text not null,
  foreign key(objective_id) references agent_objectives(id),
  foreign key(thread_id) references agent_threads(id),
  foreign key(proposal_id) references agent_proposals(id)
);

create index if not exists idx_agent_votes_proposal
  on agent_votes(proposal_id, created_at asc);

create table if not exists agent_tool_executions (
  id text primary key,
  objective_id text not null,
  thread_id text not null,
  proposal_id text,
  requested_by_participant_id text not null,
  tool_name text not null,
  tool_policy_id text,
  status text not null,
  input_payload_json text not null,
  output_payload_json text,
  artifact_refs_json text not null default '[]',
  created_at text not null,
  completed_at text,
  foreign key(objective_id) references agent_objectives(id),
  foreign key(thread_id) references agent_threads(id),
  foreign key(proposal_id) references agent_proposals(id)
);

create index if not exists idx_agent_tool_executions_proposal_status
  on agent_tool_executions(proposal_id, status);

create table if not exists agent_checkpoints (
  id text primary key,
  objective_id text not null,
  thread_id text not null,
  checkpoint_kind text not null,
  title text not null,
  summary text not null,
  related_message_id text,
  related_proposal_id text,
  artifact_refs_json text not null default '[]',
  created_at text not null,
  foreign key(objective_id) references agent_objectives(id),
  foreign key(thread_id) references agent_threads(id),
  foreign key(related_message_id) references agent_messages_v2(id),
  foreign key(related_proposal_id) references agent_proposals(id)
);

create index if not exists idx_agent_checkpoints_objective_created_at
  on agent_checkpoints(objective_id, created_at asc);

create table if not exists agent_role_state (
  id text primary key,
  objective_id text not null,
  thread_id text not null,
  role text not null,
  stance text,
  confidence real,
  blocker text,
  latest_challenge_message_id text,
  latest_proposal_id text,
  updated_at text not null,
  foreign key(objective_id) references agent_objectives(id),
  foreign key(thread_id) references agent_threads(id),
  foreign key(latest_challenge_message_id) references agent_messages_v2(id),
  foreign key(latest_proposal_id) references agent_proposals(id)
);

create unique index if not exists uq_agent_role_state_thread_role
  on agent_role_state(thread_id, role);

create table if not exists agent_subagents (
  id text primary key,
  objective_id text not null,
  thread_id text not null,
  parent_thread_id text not null,
  parent_agent_role text not null,
  specialization text not null,
  skill_pack_ids_json text not null default '[]',
  tool_policy_id text not null,
  budget_json text not null,
  expected_output_schema text not null,
  status text not null,
  summary text,
  created_at text not null,
  completed_at text,
  foreign key(objective_id) references agent_objectives(id),
  foreign key(thread_id) references agent_threads(id),
  foreign key(parent_thread_id) references agent_threads(id)
);

create index if not exists idx_agent_subagents_parent_thread_status
  on agent_subagents(parent_thread_id, status);
