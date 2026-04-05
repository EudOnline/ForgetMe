create table if not exists agent_runtime_scorecard_projection_state (
  projection_key text primary key,
  last_event_rowid integer not null default 0,
  updated_at text not null
);

create table if not exists agent_runtime_proposal_stats (
  proposal_id text primary key,
  risk_level text,
  created integer not null default 0,
  auto_committed integer not null default 0,
  awaiting_operator integer not null default 0,
  vetoed integer not null default 0,
  blocked integer not null default 0,
  budget_exhausted integer not null default 0,
  tool_timeout integer not null default 0
);

create table if not exists agent_runtime_objective_stats (
  objective_id text primary key,
  stalled integer not null default 0,
  completed integer not null default 0,
  completed_round_count integer
);

create index if not exists idx_agent_runtime_proposal_stats_risk
  on agent_runtime_proposal_stats(risk_level, created);
