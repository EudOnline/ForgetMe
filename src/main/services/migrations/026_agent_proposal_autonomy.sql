alter table agent_proposals add column proposal_risk_level text not null default 'medium';
alter table agent_proposals add column autonomy_decision text not null default 'await_operator';
alter table agent_proposals add column risk_reasons_json text not null default '[]';
alter table agent_proposals add column confidence_score real;
