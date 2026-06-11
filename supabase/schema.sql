-- Run this file in Supabase Dashboard > SQL Editor.
-- Before running it, replace the two emails in public.is_couple_member().

create extension if not exists pgcrypto;

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in ('想一起做', '重要日子', '礼物灵感', '需要聊聊', '生活待办')),
  status text not null default '新想法' check (status in ('新想法', '待确认', '本周行动', '已完成', '先搁置')),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  seen_by uuid references auth.users(id) on delete set null,
  seen_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
create index if not exists idx_comments_item_id on public.comments(item_id);
