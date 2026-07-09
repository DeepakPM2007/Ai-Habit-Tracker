create table users (
  id uuid primary key,
  email text unique not null,
  display_name text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table user_profiles (
  user_id uuid primary key references users(id),
  timezone text not null default 'UTC',
  level int not null default 1,
  xp int not null default 0,
  health int not null default 100,
  streak_freezes int not null default 0,
  onboarding_completed boolean default false
);

create table goals (
  id uuid primary key,
  user_id uuid references users(id),
  title text not null,
  description text,
  category text,
  target_date date,
  status text check (status in ('active', 'paused', 'completed', 'archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table habits (
  id uuid primary key,
  user_id uuid references users(id),
  goal_id uuid references goals(id),
  title text not null,
  description text,
  habit_type text check (habit_type in ('build', 'quit')) not null,
  difficulty text check (difficulty in ('easy', 'medium', 'hard', 'heroic')),
  cadence text check (cadence in ('daily', 'weekly', 'monthly', 'custom')),
  target_count int default 1,
  target_unit text,
  coin_reward int not null default 5,
  xp_reward int not null default 10,
  health_penalty int not null default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table habit_schedules (
  id uuid primary key,
  habit_id uuid references habits(id),
  user_id uuid references users(id),
  schedule_rule jsonb not null,
  starts_on date not null,
  ends_on date,
  ai_generated boolean default false,
  created_at timestamptz default now()
);

create table habit_checkins (
  id uuid primary key,
  user_id uuid references users(id),
  habit_id uuid references habits(id),
  checkin_date date not null,
  status text check (status in ('completed', 'resisted', 'missed', 'rest_day', 'rollover', 'maintenance')),
  value_completed numeric,
  coins_delta int default 0,
  xp_delta int default 0,
  health_delta int default 0,
  note text,
  created_at timestamptz default now(),
  synced_from_device_id uuid,
  source_mutation_id uuid unique,
  unique(user_id, habit_id, checkin_date)
);

create table streak_protections (
  id uuid primary key,
  user_id uuid references users(id),
  habit_id uuid references habits(id),
  checkin_id uuid references habit_checkins(id),
  protection_type text check (protection_type in ('rest_day', 'rollover', 'maintenance_mode')),
  original_due_date date not null,
  adjusted_due_date date,
  reason text,
  ai_suggested boolean default false,
  created_at timestamptz default now()
);

create table wallets (
  user_id uuid primary key references users(id),
  coins int not null default 0,
  lifetime_coins int not null default 0,
  lifetime_xp int not null default 0,
  updated_at timestamptz default now()
);

create table wallet_transactions (
  id uuid primary key,
  user_id uuid references users(id),
  transaction_type text check (
    transaction_type in ('habit_complete', 'bad_habit_resisted', 'maintenance_reward', 'reward_purchase', 'manual_adjustment', 'sync_replay')
  ),
  coins_delta int not null default 0,
  xp_delta int not null default 0,
  source_type text,
  source_id uuid,
  idempotency_key text unique not null,
  created_at timestamptz default now()
);

create table rewards (
  id uuid primary key,
  user_id uuid references users(id),
  title text not null,
  description text,
  cost_coins int not null,
  reward_type text,
  duration_minutes int,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table reward_redemptions (
  id uuid primary key,
  user_id uuid references users(id),
  reward_id uuid references rewards(id),
  wallet_transaction_id uuid references wallet_transactions(id),
  redeemed_at timestamptz default now(),
  note text
);

create table ai_schedule_adjustments (
  id uuid primary key,
  user_id uuid references users(id),
  habit_id uuid references habits(id),
  input_context jsonb not null,
  output_json jsonb not null,
  accepted boolean,
  created_at timestamptz default now()
);

create table sync_devices (
  id uuid primary key,
  user_id uuid references users(id),
  device_name text,
  last_synced_at timestamptz,
  created_at timestamptz default now()
);

create table sync_mutations (
  id uuid primary key,
  user_id uuid references users(id),
  device_id uuid references sync_devices(id),
  entity_type text not null,
  entity_id uuid not null,
  operation text check (operation in ('create', 'update', 'delete')),
  payload jsonb not null,
  mutation_timestamp timestamptz not null,
  processed_at timestamptz,
  conflict_status text check (conflict_status in ('none', 'resolved', 'needs_review')) default 'none'
);

create index habit_checkins_user_date_idx on habit_checkins (user_id, checkin_date);
create index habits_user_active_idx on habits (user_id, is_active);
create index sync_mutations_pending_idx on sync_mutations (user_id, processed_at);
