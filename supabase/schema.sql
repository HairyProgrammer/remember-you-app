-- Run this file in Supabase Dashboard > SQL Editor.
-- Existing projects can run the migration block below safely.

create extension if not exists pgcrypto;

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  space text not null default 'shared' check (space in ('mine', 'hers', 'shared')),
  category text not null check (category in ('想一起做', '重要日子', '礼物灵感', '需要聊聊', '生活待办')),
  status text not null default '已记下' check (status in ('已记下', '待确认', '这周处理', '已完成', '暂时做不到')),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  seen_by uuid references auth.users(id) on delete set null,
  seen_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.items
  add column if not exists space text not null default 'shared';

-- Migration for an existing items table.
update public.items
set status = case status
  when '新想法' then '已记下'
  when '本周行动' then '这周处理'
  when '先搁置' then '暂时做不到'
  else status
end
where status in ('新想法', '本周行动', '先搁置');

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.items'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table public.items drop constraint %I', constraint_name);
  end loop;

  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.items'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%space%'
  loop
    execute format('alter table public.items drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.items
  add constraint items_status_check check (status in ('已记下', '待确认', '这周处理', '已完成', '暂时做不到'));

alter table public.items
  add constraint items_space_check check (space in ('mine', 'hers', 'shared'));

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.items enable row level security;
alter table public.comments enable row level security;

drop policy if exists "couple can read items" on public.items;
drop policy if exists "couple can insert items" on public.items;
drop policy if exists "couple can update items" on public.items;
drop policy if exists "couple can delete items" on public.items;
drop policy if exists "couple can read comments" on public.comments;
drop policy if exists "couple can insert comments" on public.comments;
drop policy if exists "couple can update comments" on public.comments;
drop policy if exists "couple can delete comments" on public.comments;

create or replace function public.is_couple_member()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') in (
    '1391034695@qq.com',
    '3165778537@qq.com'
  );
$$;

create policy "couple can read items"
  on public.items for select
  to authenticated
  using (public.is_couple_member());

create policy "couple can insert items"
  on public.items for insert
  to authenticated
  with check (public.is_couple_member());

create policy "couple can update items"
  on public.items for update
  to authenticated
  using (public.is_couple_member())
  with check (public.is_couple_member());

create policy "couple can delete items"
  on public.items for delete
  to authenticated
  using (public.is_couple_member());

create policy "couple can read comments"
  on public.comments for select
  to authenticated
  using (public.is_couple_member());

create policy "couple can insert comments"
  on public.comments for insert
  to authenticated
  with check (public.is_couple_member());

create policy "couple can update comments"
  on public.comments for update
  to authenticated
  using (public.is_couple_member())
  with check (public.is_couple_member());

create policy "couple can delete comments"
  on public.comments for delete
  to authenticated
  using (public.is_couple_member());

create index if not exists idx_items_updated_at on public.items(updated_at desc);
create index if not exists idx_items_space on public.items(space);
create index if not exists idx_comments_item_id on public.comments(item_id);
