-- Private image attachments for Remember You.
-- Run this in Supabase Dashboard > SQL Editor before deploying the frontend.

create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'remember-images',
  'remember-images',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.item_attachments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  bucket text not null default 'remember-images' check (bucket = 'remember-images'),
  path text not null unique,
  file_name text,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 2097152),
  width integer,
  height integer,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.item_attachments enable row level security;

create or replace function public.enforce_max_item_attachments()
returns trigger
language plpgsql
as $$
begin
  if (
    select count(*)
    from public.item_attachments
    where item_id = new.item_id
  ) >= 3 then
    raise exception 'Each item can have at most 3 image attachments.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_max_item_attachments on public.item_attachments;
create trigger trg_enforce_max_item_attachments
before insert on public.item_attachments
for each row execute function public.enforce_max_item_attachments();

drop policy if exists "couple can read item attachments" on public.item_attachments;
drop policy if exists "couple can insert item attachments" on public.item_attachments;
drop policy if exists "couple can delete item attachments" on public.item_attachments;

create policy "couple can read item attachments"
  on public.item_attachments for select
  to authenticated
  using (public.is_couple_member());

create policy "couple can insert item attachments"
  on public.item_attachments for insert
  to authenticated
  with check (public.is_couple_member());

create policy "couple can delete item attachments"
  on public.item_attachments for delete
  to authenticated
  using (public.is_couple_member());

drop policy if exists "couple can read remember images" on storage.objects;
drop policy if exists "couple can insert remember images" on storage.objects;
drop policy if exists "couple can delete remember images" on storage.objects;

create policy "couple can read remember images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'remember-images'
    and public.is_couple_member()
  );

create policy "couple can insert remember images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'remember-images'
    and public.is_couple_member()
  );

create policy "couple can delete remember images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'remember-images'
    and public.is_couple_member()
  );

create index if not exists idx_item_attachments_item_id on public.item_attachments(item_id);
create index if not exists idx_item_attachments_created_at on public.item_attachments(created_at);
