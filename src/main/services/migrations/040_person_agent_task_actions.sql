alter table person_agent_tasks add column task_key text;
alter table person_agent_tasks add column status_changed_at text;
alter table person_agent_tasks add column status_source text;
alter table person_agent_tasks add column status_reason text;

update person_agent_tasks
set task_key = coalesce(task_key, task_kind || ':' || id)
where task_key is null;

update person_agent_tasks
set status_changed_at = coalesce(status_changed_at, updated_at)
where status_changed_at is null;

create unique index if not exists uq_person_agent_tasks_person_agent_task_key
  on person_agent_tasks(person_agent_id, task_key);
