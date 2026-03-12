-- Habits table
create table if not exists habits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text not null default '✅',
  color text not null default '#9b84ec',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Habit entries table (one row per habit per day)
create table if not exists habit_entries (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references habits(id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  unique(habit_id, date)
);

-- Index for fast lookups
create index if not exists habit_entries_habit_id_date_idx on habit_entries(habit_id, date);
