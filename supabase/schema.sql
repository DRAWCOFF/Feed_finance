create extension if not exists pgcrypto;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('income', 'expense')),
  category text not null,
  amount numeric(12,2) not null check (amount >= 0),
  title text not null,
  transaction_at timestamptz not null,
  vault text,
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  amount numeric(12,2) not null check (amount >= 0),
  start_date date not null,
  months integer not null check (months > 0),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.category_budgets (
  category text primary key,
  label text not null,
  monthly_budget numeric(12,2) not null default 0,
  accent text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.vault_goals (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  objective text not null,
  target numeric(12,2) not null default 0,
  accent text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.transactions enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.category_budgets enable row level security;
alter table public.vault_goals enable row level security;

drop policy if exists "anon full access transactions" on public.transactions;
create policy "anon full access transactions"
on public.transactions
for all
to anon
using (true)
with check (true);

drop policy if exists "anon full access recurring_expenses" on public.recurring_expenses;
create policy "anon full access recurring_expenses"
on public.recurring_expenses
for all
to anon
using (true)
with check (true);

drop policy if exists "anon full access category_budgets" on public.category_budgets;
create policy "anon full access category_budgets"
on public.category_budgets
for all
to anon
using (true)
with check (true);

drop policy if exists "anon full access vault_goals" on public.vault_goals;
create policy "anon full access vault_goals"
on public.vault_goals
for all
to anon
using (true)
with check (true);

insert into public.category_budgets (category, label, monthly_budget, accent)
values
  ('housing', 'Moradia', 2200, '#5ea6ff'),
  ('food', 'Alimentacao', 1400, '#ffc670'),
  ('transport', 'Transporte', 750, '#b7a7ff'),
  ('health', 'Saude', 680, '#7ef0c9'),
  ('leisure', 'Lazer', 900, '#ff8875'),
  ('education', 'Educacao', 600, '#93b6ff'),
  ('income', 'Renda', 0, '#7ef0c9')
on conflict (category) do update
set
  label = excluded.label,
  monthly_budget = excluded.monthly_budget,
  accent = excluded.accent;

insert into public.vault_goals (name, objective, target, accent, display_order)
values
  ('Reserva de liquidez', 'Protecao', 25000, '#7ef0c9', 1),
  ('Quitacao de divida', 'Reducao de passivo', 12000, '#ff8875', 2),
  ('Cofre de crescimento', 'Acumular riqueza', 18000, '#5ea6ff', 3)
on conflict (name) do update
set
  objective = excluded.objective,
  target = excluded.target,
  accent = excluded.accent,
  display_order = excluded.display_order;
