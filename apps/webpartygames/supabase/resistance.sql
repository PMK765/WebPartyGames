create table if not exists public.resistance_rooms (
  room_id text primary key,
  host_id uuid not null references auth.users(id) on delete cascade,
  public_state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resistance_members (
  room_id text not null references public.resistance_rooms(room_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  credits integer not null default 0,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.resistance_roles (
  room_id text not null references public.resistance_rooms(room_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('resistance','spy')),
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.resistance_votes (
  room_id text not null references public.resistance_rooms(room_id) on delete cascade,
  mission_number integer not null,
  proposal_number integer not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote boolean not null,
  revealed boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (room_id, mission_number, proposal_number, user_id)
);

create table if not exists public.resistance_mission_cards (
  room_id text not null references public.resistance_rooms(room_id) on delete cascade,
  mission_number integer not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  card text not null check (card in ('success','fail')),
  created_at timestamptz not null default now(),
  primary key (room_id, mission_number, user_id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists resistance_rooms_set_updated_at on public.resistance_rooms;
create trigger resistance_rooms_set_updated_at
before update on public.resistance_rooms
for each row execute function public.set_updated_at();

create or replace function public.resistance_rooms_host_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.host_id <> old.host_id then
    raise exception 'host_id is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists resistance_rooms_host_immutable_trigger on public.resistance_rooms;
create trigger resistance_rooms_host_immutable_trigger
before update on public.resistance_rooms
for each row execute function public.resistance_rooms_host_immutable();

alter table public.resistance_rooms enable row level security;
alter table public.resistance_members enable row level security;
alter table public.resistance_roles enable row level security;
alter table public.resistance_votes enable row level security;
alter table public.resistance_mission_cards enable row level security;

create or replace function public.resistance_is_member(p_room_id text, p_user_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.resistance_members m
    where m.room_id = p_room_id
      and m.user_id = p_user_id
  );
$$;

drop policy if exists resistance_rooms_select on public.resistance_rooms;
create policy resistance_rooms_select
on public.resistance_rooms
for select
to authenticated
using (true);

drop policy if exists resistance_rooms_insert on public.resistance_rooms;
create policy resistance_rooms_insert
on public.resistance_rooms
for insert
to authenticated
with check (host_id = auth.uid());

drop policy if exists resistance_rooms_update on public.resistance_rooms;
create policy resistance_rooms_update
on public.resistance_rooms
for update
to authenticated
using (public.resistance_is_member(room_id, auth.uid()))
with check (public.resistance_is_member(room_id, auth.uid()));

drop policy if exists resistance_members_select on public.resistance_members;
create policy resistance_members_select
on public.resistance_members
for select
to authenticated
using (public.resistance_is_member(room_id, auth.uid()));

drop policy if exists resistance_members_insert on public.resistance_members;
create policy resistance_members_insert
on public.resistance_members
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists resistance_members_update on public.resistance_members;
create policy resistance_members_update
on public.resistance_members
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists resistance_roles_select on public.resistance_roles;
create policy resistance_roles_select
on public.resistance_roles
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists resistance_votes_select on public.resistance_votes;
create policy resistance_votes_select
on public.resistance_votes
for select
to authenticated
using (
  public.resistance_is_member(room_id, auth.uid())
  and (revealed = true or user_id = auth.uid())
);

drop policy if exists resistance_votes_insert on public.resistance_votes;
create policy resistance_votes_insert
on public.resistance_votes
for insert
to authenticated
with check (
  public.resistance_is_member(room_id, auth.uid())
  and user_id = auth.uid()
);

drop policy if exists resistance_votes_update on public.resistance_votes;
create policy resistance_votes_update
on public.resistance_votes
for update
to authenticated
using (public.resistance_is_member(room_id, auth.uid()))
with check (public.resistance_is_member(room_id, auth.uid()));

drop policy if exists resistance_mission_cards_select on public.resistance_mission_cards;
create policy resistance_mission_cards_select
on public.resistance_mission_cards
for select
to authenticated
using (public.resistance_is_member(room_id, auth.uid()) and user_id = auth.uid());

drop policy if exists resistance_mission_cards_insert on public.resistance_mission_cards;
create policy resistance_mission_cards_insert
on public.resistance_mission_cards
for insert
to authenticated
with check (public.resistance_is_member(room_id, auth.uid()) and user_id = auth.uid());

create or replace function public.resistance_spy_count(p_player_count integer)
returns integer
language sql
stable
as $$
  select case
    when p_player_count <= 5 then 2
    when p_player_count = 6 then 2
    when p_player_count = 7 then 3
    when p_player_count = 8 then 3
    when p_player_count = 9 then 3
    else 4
  end;
$$;

create or replace function public.resistance_deal_roles(room_id text, player_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_count integer;
  v_spies integer;
begin
  select r.host_id into v_host from public.resistance_rooms r where r.room_id = resistance_deal_roles.room_id;
  if v_host is null then
    raise exception 'room not found';
  end if;
  if auth.uid() <> v_host then
    raise exception 'only host can deal roles';
  end if;

  v_count := coalesce(array_length(player_ids, 1), 0);
  if v_count < 5 then
    raise exception 'need at least 5 players';
  end if;

  v_spies := public.resistance_spy_count(least(v_count, 10));

  delete from public.resistance_roles rr where rr.room_id = resistance_deal_roles.room_id;

  insert into public.resistance_roles(room_id, user_id, role)
  select resistance_deal_roles.room_id,
         p.user_id,
         case when p.rn <= v_spies then 'spy' else 'resistance' end
  from (
    select unnest(player_ids) as user_id,
           row_number() over (order by md5(resistance_deal_roles.room_id || ':' || unnest(player_ids)::text)) as rn
  ) p;
end;
$$;

create or replace function public.resistance_cast_vote(
  room_id text,
  mission_number integer,
  proposal_number integer,
  vote boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.resistance_is_member(room_id, auth.uid()) then
    raise exception 'not in room';
  end if;

  insert into public.resistance_votes(room_id, mission_number, proposal_number, user_id, vote, revealed)
  values (room_id, mission_number, proposal_number, auth.uid(), vote, false)
  on conflict (room_id, mission_number, proposal_number, user_id)
  do update set vote = excluded.vote;
end;
$$;

create or replace function public.resistance_finalize_vote(
  room_id text,
  mission_number integer,
  proposal_number integer
)
returns table (votes jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_player_ids uuid[];
  v_expected integer;
  v_actual integer;
begin
  select r.host_id into v_host from public.resistance_rooms r where r.room_id = resistance_finalize_vote.room_id;
  if v_host is null then
    raise exception 'room not found';
  end if;
  if auth.uid() <> v_host then
    raise exception 'only host can reveal';
  end if;

  select coalesce(array_agg((p->>'id')::uuid), '{}'::uuid[]) into v_player_ids
  from jsonb_array_elements((select public_state->'players' from public.resistance_rooms where room_id = resistance_finalize_vote.room_id)) p
  where (p->>'isSpectator')::boolean = false;

  v_expected := coalesce(array_length(v_player_ids, 1), 0);

  select count(*) into v_actual
  from public.resistance_votes v
  where v.room_id = resistance_finalize_vote.room_id
    and v.mission_number = resistance_finalize_vote.mission_number
    and v.proposal_number = resistance_finalize_vote.proposal_number
    and v.user_id = any(v_player_ids);

  if v_expected = 0 then
    raise exception 'no players';
  end if;
  if v_actual <> v_expected then
    raise exception 'waiting for votes (%/%).', v_actual, v_expected;
  end if;

  update public.resistance_votes
  set revealed = true
  where room_id = resistance_finalize_vote.room_id
    and mission_number = resistance_finalize_vote.mission_number
    and proposal_number = resistance_finalize_vote.proposal_number;

  return query
  select jsonb_object_agg(v.user_id::text, v.vote) as votes
  from public.resistance_votes v
  where v.room_id = resistance_finalize_vote.room_id
    and v.mission_number = resistance_finalize_vote.mission_number
    and v.proposal_number = resistance_finalize_vote.proposal_number;
end;
$$;

create or replace function public.resistance_submit_mission_card(
  room_id text,
  mission_number integer,
  card text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_team_ids uuid[];
begin
  if not public.resistance_is_member(room_id, auth.uid()) then
    raise exception 'not in room';
  end if;

  select rr.role into v_role
  from public.resistance_roles rr
  where rr.room_id = resistance_submit_mission_card.room_id
    and rr.user_id = auth.uid();

  if v_role is null then
    raise exception 'role not dealt';
  end if;

  select coalesce(array_agg((x)::uuid), '{}'::uuid[]) into v_team_ids
  from jsonb_array_elements_text((select public_state->'missionTeamIds' from public.resistance_rooms where room_id = resistance_submit_mission_card.room_id)) x;

  if not (auth.uid() = any(v_team_ids)) then
    raise exception 'not on mission team';
  end if;

  if v_role <> 'spy' and card <> 'success' then
    raise exception 'only spies may submit fail';
  end if;
  if card not in ('success','fail') then
    raise exception 'invalid card';
  end if;

  insert into public.resistance_mission_cards(room_id, mission_number, user_id, card)
  values (room_id, mission_number, auth.uid(), card)
  on conflict (room_id, mission_number, user_id)
  do update set card = excluded.card;
end;
$$;

create or replace function public.resistance_finalize_mission(
  room_id text,
  mission_number integer
)
returns table (fail_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_team_ids uuid[];
  v_expected integer;
  v_actual integer;
begin
  select r.host_id into v_host from public.resistance_rooms r where r.room_id = resistance_finalize_mission.room_id;
  if v_host is null then
    raise exception 'room not found';
  end if;
  if auth.uid() <> v_host then
    raise exception 'only host can reveal';
  end if;

  select coalesce(array_agg((x)::uuid), '{}'::uuid[]) into v_team_ids
  from jsonb_array_elements_text((select public_state->'missionTeamIds' from public.resistance_rooms where room_id = resistance_finalize_mission.room_id)) x;

  v_expected := coalesce(array_length(v_team_ids, 1), 0);

  select count(*) into v_actual
  from public.resistance_mission_cards c
  where c.room_id = resistance_finalize_mission.room_id
    and c.mission_number = resistance_finalize_mission.mission_number
    and c.user_id = any(v_team_ids);

  if v_expected = 0 then
    raise exception 'no mission team';
  end if;
  if v_actual <> v_expected then
    raise exception 'waiting for mission cards (%/%).', v_actual, v_expected;
  end if;

  return query
  select count(*)::integer as fail_count
  from public.resistance_mission_cards c
  where c.room_id = resistance_finalize_mission.room_id
    and c.mission_number = resistance_finalize_mission.mission_number
    and c.card = 'fail';

  delete from public.resistance_mission_cards c
  where c.room_id = resistance_finalize_mission.room_id
    and c.mission_number = resistance_finalize_mission.mission_number;
end;
$$;


