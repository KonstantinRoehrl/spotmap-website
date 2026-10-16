-- Spots and their photos, mirrored from tools/extract-spots by tools/sync-supabase (npm run
-- sync:supabase). The public reads through city_spots(); only the secret key (service_role)
-- writes, through sync_spots(). Until the maintainer tool replaces Google My Maps as the editing
-- surface, every row here is a copy of data/spots/ and a sync may rewrite or delete any of it.

create extension if not exists postgis with schema extensions;

-- The foreign-key target for spots.city. Display names and countries live in the frontend's
-- SUPPORTED_CITIES; bounds arrive with the continuous map, when something needs them.
create table public.cities (
  slug text primary key
);

-- Decision 1: the three blue pins (and the former green marker) are active, orange is demolished.
create type public.spot_status as enum ('active', 'demolished');

create table public.spots (
  -- The extraction's re-extraction-stable id: name slug plus a hash, e.g. hbf-curb-99f6e5.
  id text primary key,
  city text not null references public.cities (slug),
  name text not null,
  status public.spot_status not null,
  location extensions.geography (point, 4326) not null,
  -- The feature's index in its city's dataset, so city_spots() reproduces the snapshot's order.
  -- Deferred: a sync that reorders spots swaps positions within one statement. sync_spots
  -- rejects a payload that repeats a pair up front, so the check at commit is the backstop only.
  sort_order int not null,
  -- The first non-empty description across the spot's sources, shown verbatim.
  notes text,
  -- The lossless per-map SpotSource records of data/spots/<city>.geojson.
  sources jsonb not null,
  updated_at timestamptz not null default now(),
  constraint spots_city_sort_order_key unique (city, sort_order) deferrable initially deferred
);

create index spots_location_gix on public.spots using gist (location);
create index spots_city_idx on public.spots (city);

create table public.spot_photos (
  spot_id text not null references public.spots (id) on delete cascade,
  -- 0-based gallery order.
  position int not null,
  -- <city>/<file>.webp, served under full/ and thumb/ in the spot-photos bucket.
  object_key text not null unique,
  primary key (spot_id, position)
);

alter table public.cities enable row level security;
alter table public.spots enable row level security;
alter table public.spot_photos enable row level security;

create policy "cities are public" on public.cities for select to anon, authenticated using (true);
create policy "spots are public" on public.spots for select to anon, authenticated using (true);
create policy "spot photos are public" on public.spot_photos for select to anon, authenticated using (true);

-- Supabase's default privileges grant every table to anon and authenticated; the public reads only.
revoke all on table public.cities, public.spots, public.spot_photos from anon, authenticated;
grant select on table public.cities, public.spots, public.spot_photos to anon, authenticated;

-- One city's spots as the GeoJSON FeatureCollection the frontend's SpotsService expects, in the
-- shape of the bundled public/spots/<city>.geojson snapshot: features in dataset order, notes as
-- JSON null when absent, photos as object keys in gallery order. An unknown city raises, which
-- PostgREST answers with HTTP 400, so the client falls back to the snapshot.
-- extra_float_digits is pinned to 1 so to_jsonb prints a coordinate's shortest round-trip text, as
-- the snapshot does; at the session default 0 it would cut a 16- or 17-digit coordinate to 15.
create function public.city_spots(p_city text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set extra_float_digits = 1
as $$
declare
  collection jsonb;
begin
  if not exists (select 1 from public.cities c where c.slug = p_city) then
    raise exception 'unknown city: %', p_city;
  end if;

  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'geometry', jsonb_build_object(
          'type', 'Point',
          -- float8 through to_jsonb (with the pinned extra_float_digits) keeps the snapshot's JSON text;
          -- ::numeric would not.
          'coordinates', jsonb_build_array(
            to_jsonb(extensions.st_x(s.location::extensions.geometry)),
            to_jsonb(extensions.st_y(s.location::extensions.geometry))
          )
        ),
        'properties', jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'status', s.status,
          'notes', s.notes,
          'photos', coalesce(
            (select jsonb_agg(p.object_key order by p.position)
               from public.spot_photos p
              where p.spot_id = s.id),
            '[]'::jsonb
          )
        )
      )
      order by s.sort_order
    ), '[]'::jsonb)
  )
  into collection
  from public.spots s
  where s.city = p_city;

  return collection;
end;
$$;

grant execute on function public.city_spots(text) to anon, authenticated;

-- Mirrors the whole extraction in one transaction: upserts cities and spots, diffs each spot's
-- photo rows, deletes spots and cities the payload no longer holds. Payload:
--   { "cities": [slug…],
--     "spots": [{ id, city, sort_order, name, status, lng, lat, notes, sources, photos: [key…] }] }
-- Raises, rolling everything back, on a malformed payload, a duplicate spot id, a duplicate
-- (city, sort_order) pair, a spot whose city is not in "cities", or a duplicate photo key. Returns
--   { spots: { inserted, updated, deleted }, photos: { inserted, deleted } },
-- all zero on a re-run with unchanged data.
create function public.sync_spots(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  spots_inserted int;
  spots_updated int;
  spots_deleted int;
  photos_inserted int;
  photos_deleted int;
  culprit text;
  culprit_sort_order jsonb;
begin
  if jsonb_typeof(payload -> 'cities') is distinct from 'array'
     or jsonb_typeof(payload -> 'spots') is distinct from 'array' then
    raise exception 'sync_spots: the payload needs a "cities" array and a "spots" array';
  end if;

  if exists (
    select 1 from jsonb_array_elements(payload -> 'cities') c
    where jsonb_typeof(c) is distinct from 'string'
  ) then
    raise exception 'sync_spots: every city must be a slug string';
  end if;

  select coalesce(e ->> 'id', e::text) into culprit
  from jsonb_array_elements(payload -> 'spots') e
  where jsonb_typeof(e) is distinct from 'object'
     or jsonb_typeof(e -> 'id') is distinct from 'string'
     or jsonb_typeof(e -> 'city') is distinct from 'string'
     or jsonb_typeof(e -> 'name') is distinct from 'string'
     or jsonb_typeof(e -> 'status') is distinct from 'string'
     or jsonb_typeof(e -> 'sort_order') is distinct from 'number'
     or jsonb_typeof(e -> 'lng') is distinct from 'number'
     or jsonb_typeof(e -> 'lat') is distinct from 'number'
     or coalesce(jsonb_typeof(e -> 'notes'), 'missing') not in ('string', 'null')
     or jsonb_typeof(e -> 'sources') is distinct from 'array'
     or jsonb_typeof(e -> 'photos') is distinct from 'array'
     or exists (
       select 1 from jsonb_array_elements(e -> 'photos') p
       where jsonb_typeof(p) is distinct from 'string'
     )
  limit 1;
  if found then
    raise exception 'sync_spots: malformed spot %', culprit;
  end if;

  select e ->> 'id' into culprit
  from jsonb_array_elements(payload -> 'spots') e
  group by e ->> 'id'
  having count(*) > 1
  limit 1;
  if found then
    raise exception 'sync_spots: duplicate spot id %', culprit;
  end if;

  -- The unique (city, sort_order) constraint is deferred, so without this check a repeated pair
  -- would only fail at commit, after the whole body ran and reported counts.
  select e ->> 'city', e -> 'sort_order' into culprit, culprit_sort_order
  from jsonb_array_elements(payload -> 'spots') e
  group by e ->> 'city', e -> 'sort_order'
  having count(*) > 1
  limit 1;
  if found then
    raise exception 'sync_spots: duplicate sort_order % in city %', culprit_sort_order, culprit;
  end if;

  select e ->> 'id' into culprit
  from jsonb_array_elements(payload -> 'spots') e
  where not (payload -> 'cities') ? (e ->> 'city')
  limit 1;
  if found then
    raise exception 'sync_spots: spot % names a city outside "cities"', culprit;
  end if;

  select p into culprit
  from jsonb_array_elements(payload -> 'spots') e,
       jsonb_array_elements_text(e -> 'photos') p
  group by p
  having count(*) > 1
  limit 1;
  if found then
    raise exception 'sync_spots: duplicate photo key %', culprit;
  end if;

  insert into public.cities (slug)
  select jsonb_array_elements_text(payload -> 'cities')
  on conflict (slug) do nothing;

  -- Photos first: rows of vanished spots count as deleted photos, and clearing moved keys
  -- before the insert below keeps object_key and (spot_id, position) unique.
  with wanted as (
    select e ->> 'id' as spot_id, (p.ordinality - 1)::int as position, p.object_key
    from jsonb_array_elements(payload -> 'spots') e,
         jsonb_array_elements_text(e -> 'photos') with ordinality as p (object_key, ordinality)
  ),
  removed as (
    delete from public.spot_photos t
    where not exists (
      select 1 from wanted w
      where w.spot_id = t.spot_id and w.position = t.position and w.object_key = t.object_key
    )
    returning 1
  )
  select count(*) into photos_deleted from removed;

  with removed as (
    delete from public.spots t
    where not exists (
      select 1 from jsonb_array_elements(payload -> 'spots') e where e ->> 'id' = t.id
    )
    returning 1
  )
  select count(*) into spots_deleted from removed;

  with incoming as (
    select *
    from jsonb_to_recordset(payload -> 'spots') as s (
      id text, city text, sort_order int, name text, status public.spot_status,
      lng float8, lat float8, notes text, sources jsonb
    )
  ),
  upserted as (
    insert into public.spots as t (id, city, name, status, location, sort_order, notes, sources)
    select
      i.id, i.city, i.name, i.status,
      extensions.st_setsrid(extensions.st_makepoint(i.lng, i.lat), 4326)::extensions.geography,
      i.sort_order, i.notes, i.sources
    from incoming i
    on conflict (id) do update set
      city = excluded.city,
      name = excluded.name,
      status = excluded.status,
      location = excluded.location,
      sort_order = excluded.sort_order,
      notes = excluded.notes,
      sources = excluded.sources,
      updated_at = now()
    -- Coordinates compare as doubles: geography has no exact equality operator.
    where t.city is distinct from excluded.city
       or t.name is distinct from excluded.name
       or t.status is distinct from excluded.status
       or extensions.st_x(t.location::extensions.geometry)
          is distinct from extensions.st_x(excluded.location::extensions.geometry)
       or extensions.st_y(t.location::extensions.geometry)
          is distinct from extensions.st_y(excluded.location::extensions.geometry)
       or t.sort_order is distinct from excluded.sort_order
       or t.notes is distinct from excluded.notes
       or t.sources is distinct from excluded.sources
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
  into spots_inserted, spots_updated
  from upserted;

  with wanted as (
    select e ->> 'id' as spot_id, (p.ordinality - 1)::int as position, p.object_key
    from jsonb_array_elements(payload -> 'spots') e,
         jsonb_array_elements_text(e -> 'photos') with ordinality as p (object_key, ordinality)
  ),
  added as (
    insert into public.spot_photos (spot_id, position, object_key)
    select w.spot_id, w.position, w.object_key
    from wanted w
    where not exists (
      select 1 from public.spot_photos t
      where t.spot_id = w.spot_id and t.position = w.position and t.object_key = w.object_key
    )
    returning 1
  )
  select count(*) into photos_inserted from added;

  delete from public.cities c
  where not (payload -> 'cities') ? c.slug
    and not exists (select 1 from public.spots s where s.city = c.slug);

  return jsonb_build_object(
    'spots', jsonb_build_object(
      'inserted', spots_inserted, 'updated', spots_updated, 'deleted', spots_deleted
    ),
    'photos', jsonb_build_object('inserted', photos_inserted, 'deleted', photos_deleted)
  );
end;
$$;

-- Supabase's default privileges grant execute on new functions to PUBLIC, anon and
-- authenticated; only the secret key may sync.
revoke execute on function public.sync_spots(jsonb) from public, anon, authenticated;
grant execute on function public.sync_spots(jsonb) to service_role;

-- Public bucket: anyone can read an object by URL; nothing public may write (storage.objects has
-- no insert, update or delete policy for anon or authenticated). Thumbnails and full-size WebPs
-- from the extraction only.
insert into storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
values ('spot-photos', 'spot-photos', true, array['image/webp'], 2097152)
on conflict (id) do update set
  public = excluded.public,
  allowed_mime_types = excluded.allowed_mime_types,
  file_size_limit = excluded.file_size_limit;
