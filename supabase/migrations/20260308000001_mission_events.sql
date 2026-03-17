create table if not exists mission_events (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null,
  event_type text not null check (event_type in ('write','edit','bash','read','think','result')),
  content text not null,
  file_path text,
  seq int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists mission_events_mission_id_seq on mission_events(mission_id, seq);
