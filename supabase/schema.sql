-- Additive CramMate schema. No existing application tables are changed.
begin;
create table if not exists public.crammate_courses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  unique(id,owner_id)
);
create table if not exists public.crammate_materials (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null,
  course_id uuid not null, name text not null, storage_path text not null,
  sha256 text not null, size_bytes bigint not null check(size_bytes between 1024 and 52428800),
  pages jsonb not null, page_count integer not null, created_at timestamptz not null default now(),
  foreign key(course_id,owner_id) references public.crammate_courses(id,owner_id) on delete cascade,
  unique(course_id,sha256), unique(storage_path)
);
create table if not exists public.crammate_questions (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null,
  course_id uuid not null, status text not null default 'pending' check(status in ('pending','approved','rejected','deleted')),
  data jsonb not null check(jsonb_typeof(data)='object'), created_at timestamptz not null default now(),
  foreign key(course_id,owner_id) references public.crammate_courses(id,owner_id) on delete cascade
);
create unique index if not exists crammate_unique_approved_prompt on public.crammate_questions(course_id,lower(btrim(data->>'prompt'))) where status='approved';
create table if not exists public.crammate_attempts (
  id uuid primary key, owner_id uuid not null, course_id uuid not null,
  data jsonb not null, created_at timestamptz not null default now(),
  foreign key(course_id,owner_id) references public.crammate_courses(id,owner_id) on delete cascade
);
create table if not exists public.crammate_mcp_tokens (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null, token_hash text not null unique, created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '30 days', revoked_at timestamptz
);
create table if not exists public.crammate_ai_runs (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now()
);
create index if not exists crammate_ai_runs_owner_time on public.crammate_ai_runs(owner_id,created_at);
do $$ declare t text; begin
  foreach t in array array['crammate_courses','crammate_materials','crammate_questions','crammate_attempts','crammate_mcp_tokens'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create index if not exists %I on public.%I(owner_id)',t||'_owner_idx',t);
    if not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname='owner_access') then
      execute format('create policy owner_access on public.%I for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id)',t);
    end if;
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  end loop;
end $$;
alter table public.crammate_ai_runs enable row level security;
revoke all on public.crammate_ai_runs from anon, authenticated;

-- Atomic rate limit. A definer function is necessary because clients must not be
-- able to delete/reset their own quota. Fixed search_path; identity from auth.uid.
create or replace function public.crammate_claim_ai_run() returns void
language plpgsql security definer set search_path='' as $$
declare u uuid := auth.uid(); n integer; latest timestamptz;
begin
  if u is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,17));
  select count(*),max(created_at) into n,latest from public.crammate_ai_runs where owner_id=u and created_at>now()-interval '24 hours';
  if n>=20 or latest>now()-interval '1 minute' then raise exception 'RATE_LIMIT'; end if;
  insert into public.crammate_ai_runs(owner_id) values(u);
end $$;
revoke all on function public.crammate_claim_ai_run() from public,anon;
grant execute on function public.crammate_claim_ai_run() to authenticated;

-- Compare-and-swap + transaction prevents lost mastery updates and duplicate attempts.
create or replace function public.crammate_save_attempt(p_owner uuid,p_course uuid,p_version integer,p_id uuid,p_result jsonb,p_course_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare existing jsonb;
begin
  if auth.uid() is distinct from p_owner and auth.role()<>'service_role' then raise exception 'AUTH_REQUIRED'; end if;
  perform 1 from public.crammate_courses where id=p_course and owner_id=p_owner for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select data into existing from public.crammate_attempts where id=p_id and owner_id=p_owner and course_id=p_course;
  if found then return existing; end if;
  update public.crammate_courses set data=p_course_data, version=version+1 where id=p_course and owner_id=p_owner and version=p_version;
  if not found then raise exception 'CONFLICT'; end if;
  insert into public.crammate_attempts(id,owner_id,course_id,data) values(p_id,p_owner,p_course,p_result);
  return p_result;
end $$;
revoke all on function public.crammate_save_attempt(uuid,uuid,integer,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.crammate_save_attempt(uuid,uuid,integer,uuid,jsonb,jsonb) to authenticated,service_role;

create or replace function public.crammate_submit_questions(p_owner uuid,p_course uuid,p_version integer,p_course_data jsonb,p_questions jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare q jsonb;
begin
  if auth.uid() is distinct from p_owner and auth.role()<>'service_role' then raise exception 'AUTH_REQUIRED'; end if;
  if jsonb_array_length(p_questions) not between 5 and 12 then raise exception 'INVALID_QUESTIONS'; end if;
  update public.crammate_courses set data=p_course_data,version=version+1 where id=p_course and owner_id=p_owner and version=p_version;
  if not found then raise exception 'CONFLICT'; end if;
  for q in select * from jsonb_array_elements(p_questions) loop
    insert into public.crammate_questions(owner_id,course_id,data,status) values(p_owner,p_course,q,'pending');
  end loop;
end $$;
revoke all on function public.crammate_submit_questions(uuid,uuid,integer,jsonb,jsonb) from public,anon;
grant execute on function public.crammate_submit_questions(uuid,uuid,integer,jsonb,jsonb) to authenticated,service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('crammate-materials','crammate-materials',false,52428800,array['application/pdf']) on conflict(id) do nothing;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='crammate_private_pdf') then
    create policy crammate_private_pdf on storage.objects for all to authenticated
    using(bucket_id='crammate-materials' and (storage.foldername(name))[1]=(select auth.uid())::text)
    with check(bucket_id='crammate-materials' and (storage.foldername(name))[1]=(select auth.uid())::text
      and exists(select 1 from public.crammate_courses c where c.id::text=(storage.foldername(name))[2] and c.owner_id=(select auth.uid())));
  end if;
end $$;
commit;
