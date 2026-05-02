create extension if not exists pgcrypto;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  category text not null,
  amount numeric(12,2) not null check (amount >= 0),
  title text not null,
  transaction_at timestamptz not null,
  vault text,
  note text,
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz default null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_transactions_user_date
  on public.transactions (user_id, transaction_at desc);

create index if not exists idx_transactions_deleted_at
  on public.transactions (deleted_at)
  where deleted_at is null;

create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text not null,
  amount numeric(12,2) not null check (amount >= 0),
  start_date date not null,
  months integer not null check (months > 0),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz default null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_recurring_user_start
  on public.recurring_expenses (user_id, start_date desc);

create index if not exists idx_recurring_deleted_at
  on public.recurring_expenses (deleted_at)
  where deleted_at is null;

create table if not exists public.category_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  label text not null,
  kind text not null default 'expense',
  monthly_budget numeric(12,2) not null default 0,
  accent text not null,
  updated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, category)
);

alter table public.category_budgets
  add column if not exists kind text not null default 'expense';

update public.category_budgets
set kind = case when category = 'income' then 'income' else 'expense' end
where kind is null or kind not in ('income', 'expense');

create index if not exists idx_category_budgets_user_kind
  on public.category_budgets (user_id, kind, label);

create table if not exists public.vault_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  objective text not null,
  target numeric(12,2) not null default 0,
  accent text not null,
  display_order integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, name)
);

alter table public.transactions enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.category_budgets enable row level security;
alter table public.vault_goals enable row level security;

drop policy if exists "transactions own rows" on public.transactions;
create policy "transactions own rows"
on public.transactions
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "recurring own rows" on public.recurring_expenses;
create policy "recurring own rows"
on public.recurring_expenses
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "budgets own rows" on public.category_budgets;
create policy "budgets own rows"
on public.category_budgets
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "vaults own rows" on public.vault_goals;
create policy "vaults own rows"
on public.vault_goals
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
