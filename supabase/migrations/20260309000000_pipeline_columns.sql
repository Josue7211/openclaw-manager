-- Pipeline enforcement: add complexity, task_type, review tracking to missions
alter table missions add column if not exists complexity integer;
alter table missions add column if not exists task_type text not null default 'non-code';
alter table missions add column if not exists review_status text; -- null | pending | approved | rejected
alter table missions add column if not exists review_notes text;
alter table missions add column if not exists retry_count integer not null default 0;
alter table missions add column if not exists routed_agent text; -- agent id from routing table
alter table missions add column if not exists spawn_command text; -- the exact command to run

-- Index for deploy gate check
create index if not exists missions_review_status_idx on missions(review_status) where review_status is not null;
