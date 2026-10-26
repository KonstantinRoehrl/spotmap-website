-- The My Maps sync becomes insert-only: now that the maintainer tool edits spots in the database,
-- a sync must never overwrite, resurrect or delete anything. sync_spots(), which mirrored the whole
-- extraction, goes; tools/sync-supabase reads every id the database holds through
-- sync_existing_spots() and sends only the spots it has never seen to sync_insert_spots(). Both
-- run as the secret key's service_role, which bypasses row-level security and so sees deleted rows.

drop function public.sync_spots(jsonb);

-- Every spot the database holds, deleted ones included, as
--   [{ id, city, name, lng, lat, deleted }…]
-- ordered by city then dataset order: what the sync's insert planner compares the extraction with.
-- extra_float_digits is pinned to 1 so coordinates arrive as their shortest round-trip text.
create function public.sync_existing_spots()
returns jsonb
language sql
stable
security invoker
set search_path = ''
set extra_float_digits = 1
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'city', s.city,
      'name', s.name,
      'lng', extensions.st_x(s.location::extensions.geometry),
      'lat', extensions.st_y(s.location::extensions.geometry),
      'deleted', s.deleted_at is not null
    )
    order by s.city, s.sort_order
  ), '[]'::jsonb)
  from public.spots s;
$$;

-- Inserts spots the database has never held, in one transaction. Payload:
--   { "cities": [slug…],
--     "spots": [{ id, city, name, status, lng, lat, notes, sources, photos: [key…] }] }
-- Inserts the missing cities (never deletes one); gives each spot its city's next sort_order (after
-- the highest, deleted spots included) in payload order, and its photos positions 0…n−1. Raises,
-- rolling everything back, on a malformed payload, a duplicate spot id or photo key, a spot whose
-- city is not in "cities", an id the database already holds ('sync_insert_spots: spot <id> already
-- exists' — deleted or edited, it is never touched) or a photo key it already holds. Never updates
-- or deletes anything. Returns
--   { cities: { inserted }, spots: { inserted }, photos: { inserted } }.
create function public.sync_insert_spots(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cities_inserted int;
  spots_inserted int;
  photos_inserted int;
  culprit text;
  owner_id text;
begin
  if jsonb_typeof(payload -> 'cities') is distinct from 'array'
     or jsonb_typeof(payload -> 'spots') is distinct from 'array' then
    raise exception 'sync_insert_spots: the payload needs a "cities" array and a "spots" array';
  end if;

  if exists (
    select 1 from jsonb_array_elements(payload -> 'cities') c
    where jsonb_typeof(c) is distinct from 'string'
  ) then
    raise exception 'sync_insert_spots: every city must be a slug string';
  end if;

  select coalesce(e ->> 'id', e::text) into culprit
  from jsonb_array_elements(payload -> 'spots') e
  where jsonb_typeof(e) is distinct from 'object'
     or jsonb_typeof(e -> 'id') is distinct from 'string'
     or jsonb_typeof(e -> 'city') is distinct from 'string'
     or jsonb_typeof(e -> 'name') is distinct from 'string'
     or jsonb_typeof(e -> 'status') is distinct from 'string'
     or jsonb_typeof(e -> 'lng') is distinct from 'number'
     or jsonb_typeof(e -> 'lat') is distinct from 'number'
     or coalesce(jsonb_typeof(e -> 'notes'), 'missing') not in ('string', 'null')
     or jsonb_typeof(e -> 'sources') is distinct from 'array'
     or jsonb_typeof(e -> 'photos') is distinct from 'array'
  limit 1;
  if found then
    raise exception 'sync_insert_spots: malformed spot %', culprit;
  end if;

  -- A separate check: jsonb_array_elements raises on a non-array, and OR does not short-circuit.
  select e ->> 'id' into culprit
  from jsonb_array_elements(payload -> 'spots') e
  where exists (
    select 1 from jsonb_array_elements(e -> 'photos') p where jsonb_typeof(p) is distinct from 'string'
  )
  limit 1;
  if found then
    raise exception 'sync_insert_spots: malformed spot %', culprit;
  end if;

  select e ->> 'id' into culprit
  from jsonb_array_elements(payload -> 'spots') e
  group by e ->> 'id'
  having count(*) > 1
  limit 1;
  if found then
    raise exception 'sync_insert_spots: duplicate spot id %', culprit;
  end if;

  select e ->> 'id' into culprit
  from jsonb_array_elements(payload -> 'spots') e
  where not (payload -> 'cities') ? (e ->> 'city')
  limit 1;
  if found then
    raise exception 'sync_insert_spots: spot % names a city outside "cities"', culprit;
  end if;

  select p into culprit
  from jsonb_array_elements(payload -> 'spots') e,
       jsonb_array_elements_text(e -> 'photos') p
  group by p
  having count(*) > 1
  limit 1;
  if found then
    raise exception 'sync_insert_spots: duplicate photo key %', culprit;
  end if;

  select e.spot ->> 'id' into culprit
  from jsonb_array_elements(payload -> 'spots') with ordinality as e (spot, n)
  where exists (select 1 from public.spots s where s.id = e.spot ->> 'id')
  order by e.n
  limit 1;
  if found then
    raise exception 'sync_insert_spots: spot % already exists', culprit;
  end if;

  select p.object_key, p.spot_id into culprit, owner_id
  from jsonb_array_elements(payload -> 'spots') e,
       jsonb_array_elements_text(e -> 'photos') as k (key),
       public.spot_photos p
  where p.object_key = k.key
  limit 1;
  if found then
    raise exception 'sync_insert_spots: photo key % already belongs to spot %', culprit, owner_id;
  end if;

  with added as (
    insert into public.cities (slug)
    select jsonb_array_elements_text(payload -> 'cities')
    on conflict (slug) do nothing
    returning 1
  )
  select count(*) into cities_inserted from added;

  -- Lock the payload's cities so a concurrent admin_create_spot cannot pick the same sort_order.
  perform 1 from public.cities c
  where (payload -> 'cities') ? c.slug
  order by c.slug
  for update;

  with incoming as (
    select r.*, e.n
    from jsonb_array_elements(payload -> 'spots') with ordinality as e (spot, n),
         jsonb_to_record(e.spot) as r (
           id text, city text, name text, status public.spot_status,
           lng float8, lat float8, notes text, sources jsonb
         )
  ),
  numbered as (
    select
      i.*,
      (coalesce((select max(t.sort_order) from public.spots t where t.city = i.city), -1)
        + row_number() over (partition by i.city order by i.n))::int as sort_order
    from incoming i
  ),
  inserted as (
    insert into public.spots (id, city, name, status, location, sort_order, notes, sources)
    select
      x.id, x.city, x.name, x.status,
      extensions.st_setsrid(extensions.st_makepoint(x.lng, x.lat), 4326)::extensions.geography,
      x.sort_order, x.notes, x.sources
    from numbered x
    returning 1
  )
  select count(*) into spots_inserted from inserted;

  with added as (
    insert into public.spot_photos (spot_id, position, object_key)
    select e ->> 'id', (p.n - 1)::int, p.object_key
    from jsonb_array_elements(payload -> 'spots') e,
         jsonb_array_elements_text(e -> 'photos') with ordinality as p (object_key, n)
    returning 1
  )
  select count(*) into photos_inserted from added;

  return jsonb_build_object(
    'cities', jsonb_build_object('inserted', cities_inserted),
    'spots', jsonb_build_object('inserted', spots_inserted),
    'photos', jsonb_build_object('inserted', photos_inserted)
  );
end;
$$;

-- Supabase's default privileges grant execute on new functions to PUBLIC, anon and
-- authenticated; only the secret key may read the sync's view of the database or insert.
revoke execute on function public.sync_existing_spots() from public, anon, authenticated;
grant execute on function public.sync_existing_spots() to service_role;
revoke execute on function public.sync_insert_spots(jsonb) from public, anon, authenticated;
grant execute on function public.sync_insert_spots(jsonb) to service_role;
