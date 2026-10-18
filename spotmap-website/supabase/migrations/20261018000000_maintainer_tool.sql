-- The maintainer tool: from here on the database, not Google My Maps, is where spots are edited.
-- Signed-in admins (public.admins) change spots and photos only through the admin_* functions
-- below and write the spot-photos bucket only through the is_admin()-gated Storage policies; the
-- public still reads, and nothing public writes. Spots are soft-deleted (deleted_at) so the My Maps
-- sync, which from the next migration on only inserts ids the database has never held, cannot
-- bring one back. Errors: 'admin only' is errcode 42501 (PostgREST: HTTP 401 for anon, 403 for a
-- signed-in user); a validation failure raises '<function>: <message>' (P0001, HTTP 400); an id
-- collision raises 'spot id taken: <id>' with errcode 23505 (HTTP 409).

-- Who may use the maintainer tool: one row per Supabase Auth user let in. Rows are added by hand
-- (SQL editor or psql); there is no sign-up, and deleting the Auth user removes the row.
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- Admin-only configuration the browser needs after sign-in but must never ship in a bundle, read
-- through admin_get_setting(). Holds the referrer-restricted Esri key as ('esri_api_key', '<key>').
create table public.admin_settings (
  key text primary key,
  value text not null
);

-- Row-level security with no policies: only the owner, and so the security-definer functions
-- below, reads either table.
alter table public.admins enable row level security;
alter table public.admin_settings enable row level security;

-- Supabase's default privileges grant every table to anon and authenticated; neither may touch these.
revoke all on table public.admins, public.admin_settings from anon, authenticated;

-- Whether the caller's JWT names an admin. Security definer, so it reads public.admins, which the
-- caller cannot. auth.uid() is null for anon and for the secret key, so neither is an admin.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Supabase's default privileges grant execute on new functions to PUBLIC, anon and authenticated;
-- the Storage and row policies below call is_admin() for signed-in users only.
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- The first statement of every admin_* function: raises 'admin only' (42501) for anyone who is not
-- an admin. Not callable over the API; only the admin_* functions (run as the owner) call it.
create function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.require_admin() from public, anon, authenticated;

-- Soft delete: null means live. A deleted spot keeps its row, photos and id, so the insert-only sync
-- never re-creates it and admin_restore_spot() can bring it back.
alter table public.spots add column deleted_at timestamptz;

-- The public, and a signed-in non-admin, see live spots and their photos only; admins see every
-- row (permissive policies combine with OR). In the photo policy, spot_id is spot_photos' own
-- column: spots has none of that name.
alter policy "spots are public" on public.spots using (deleted_at is null);
alter policy "spot photos are public" on public.spot_photos
  using (exists (select 1 from public.spots s where s.id = spot_id and s.deleted_at is null));
create policy "admins read every spot" on public.spots
  for select to authenticated using (public.is_admin());
create policy "admins read every spot photo" on public.spot_photos
  for select to authenticated using (public.is_admin());

-- One city's live spots as the GeoJSON FeatureCollection the frontend's SpotsService expects, in the
-- shape of the bundled public/spots/<city>.geojson snapshot: features in dataset order, notes as
-- JSON null when absent, photos as object keys in gallery order; a city without live spots has no
-- features. An unknown city raises, which PostgREST answers with HTTP 400, so the client falls back
-- to the snapshot. Soft-deleted spots are left out by the explicit deleted_at filter, not only by
-- row-level security: the secret key (snapshot:supabase) bypasses RLS and an admin's own policy
-- sees deleted rows.
-- extra_float_digits is pinned to 1 so to_jsonb prints a coordinate's shortest round-trip text, as
-- the snapshot does; at the session default 0 it would cut a 16- or 17-digit coordinate to 15.
create or replace function public.city_spots(p_city text)
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
  where s.city = p_city and s.deleted_at is null;

  return collection;
end;
$$;

-- Admins write the spot-photos bucket (full/<key> and thumb/<key>); anon and signed-in non-admins
-- still cannot. The bucket stays public, so serving a photo needs no policy; the read policy lets
-- the Storage API see an admin's own objects when it uploads without upsert, updates or deletes.
create policy "admins read spot photo objects" on storage.objects
  for select to authenticated
  using (bucket_id = 'spot-photos' and public.is_admin());
create policy "admins upload spot photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'spot-photos' and public.is_admin());
create policy "admins update spot photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'spot-photos' and public.is_admin())
  with check (bucket_id = 'spot-photos' and public.is_admin());
create policy "admins delete spot photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'spot-photos' and public.is_admin());

-- Raises '<p_caller>: lng must be within [-180, 180]' or '... lat must be within [-90, 90]'.
-- Shared by the admin writers and admin_nearby_spots; not callable over the API.
create function public.check_spot_position(p_caller text, p_lng double precision, p_lat double precision)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_lng is null or p_lng < -180 or p_lng > 180 then
    raise exception '%: lng must be within [-180, 180]', p_caller;
  end if;
  if p_lat is null or p_lat < -90 or p_lat > 90 then
    raise exception '%: lat must be within [-90, 90]', p_caller;
  end if;
end;
$$;

-- Raises '<p_caller>: name must not be blank' for a null, empty or whitespace-only name.
create function public.check_spot_name(p_caller text, p_name text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception '%: name must not be blank', p_caller;
  end if;
end;
$$;

-- Raises '<p_caller>: photo key <key> must look like <city>/<file>.webp' for the first key that is
-- not '<p_city>/' plus one path segment ending in .webp — the shape the bucket's full/ and thumb/
-- trees and photoUrl() expect. Compares the city as a prefix, not inside a regex, so a city slug is
-- never read as a pattern.
create function public.check_photo_keys(p_caller text, p_city text, p_keys text[])
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_bad text;
begin
  select k into v_bad
  from unnest(p_keys) as k
  where k is null
     or left(k, length(p_city) + 1) <> p_city || '/'
     or substr(k, length(p_city) + 2) !~ '^[^/]+\.webp$'
  limit 1;
  if found then
    raise exception '%: photo key % must look like %/<file>.webp', p_caller, coalesce(v_bad, 'null'), p_city;
  end if;
end;
$$;

revoke execute on function
  public.check_spot_position(text, double precision, double precision),
  public.check_spot_name(text, text),
  public.check_photo_keys(text, text, text[])
from public, anon, authenticated;

-- One spot as the AdminSpot JSON of src/app/models/admin/admin-spot.ts, or SQL null when the id is
-- unknown: {id, city, name, status, lng, lat, notes, photos: [key…] in gallery order, deletedAt,
-- updatedAt}, timestamps as ISO 8601 text. Internal: the admin_* functions return it.
create function public.admin_spot_json(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
set extra_float_digits = 1
as $$
  select jsonb_build_object(
    'id', s.id,
    'city', s.city,
    'name', s.name,
    'status', s.status,
    'lng', extensions.st_x(s.location::extensions.geometry),
    'lat', extensions.st_y(s.location::extensions.geometry),
    'notes', s.notes,
    'photos', coalesce(
      (select jsonb_agg(p.object_key order by p.position)
         from public.spot_photos p
        where p.spot_id = s.id),
      '[]'::jsonb
    ),
    'deletedAt', s.deleted_at,
    'updatedAt', s.updated_at
  )
  from public.spots s
  where s.id = p_id;
$$;

revoke execute on function public.admin_spot_json(text) from public, anon, authenticated;

-- Every spot of p_city, or of every city when p_city is null, deleted ones included, as an array of
-- AdminSpot ordered by city then dataset order; [] for a city without spots.
create function public.admin_list_spots(p_city text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return coalesce(
    (select jsonb_agg(public.admin_spot_json(s.id) order by s.city, s.sort_order)
       from public.spots s
      where p_city is null or s.city = p_city),
    '[]'::jsonb
  );
end;
$$;

-- One spot (deleted or not) as AdminSpot; raises 'admin_get_spot: no spot <id>' when absent.
create function public.admin_get_spot(p_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_spot jsonb;
begin
  perform public.require_admin();
  v_spot := public.admin_spot_json(p_id);
  if v_spot is null then
    raise exception 'admin_get_spot: no spot %', p_id;
  end if;
  return v_spot;
end;
$$;

-- The create-or-attach candidates for a picked position, as an array of NearbySpot ordered by
-- distance: every spot (deleted included) within 25 m matches by 'position'; otherwise, when p_name
-- is not blank, a spot whose trimmed, lower-cased name equals it within 100 m matches by 'name'.
-- The same two rules as tools/extract-spots/match.mjs (POSITION_MATCH_MAX_M, NAME_MATCH_MAX_M).
-- use_spheroid = false measures on PostGIS's sphere, whose radius is the WGS 84 mean radius
-- (≈ 6,371,008.77 m) where the haversine matchers use 6,371,000 m: 0.03 mm apart at 25 m.
create function public.admin_nearby_spots(
  p_lng double precision,
  p_lat double precision,
  p_name text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set extra_float_digits = 1
as $$
declare
  v_name text := nullif(lower(btrim(p_name)), '');
  v_point extensions.geography;
  v_spots jsonb;
begin
  perform public.require_admin();
  perform public.check_spot_position('admin_nearby_spots', p_lng, p_lat);
  v_point := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'city', c.city,
      'name', c.name,
      'status', c.status,
      'lng', extensions.st_x(c.location::extensions.geometry),
      'lat', extensions.st_y(c.location::extensions.geometry),
      'distanceM', c.distance_m,
      'photoCount', (select count(*) from public.spot_photos p where p.spot_id = c.id),
      'deleted', c.deleted_at is not null,
      'match', c.match
    )
    order by c.distance_m, c.id
  ), '[]'::jsonb)
  into v_spots
  from (
    select
      s.*,
      extensions.st_distance(s.location, v_point, false) as distance_m,
      case
        when extensions.st_dwithin(s.location, v_point, 25, false) then 'position'
        when v_name is not null
             and lower(btrim(s.name)) = v_name
             and extensions.st_dwithin(s.location, v_point, 100, false) then 'name'
      end as match
    from public.spots s
    where extensions.st_dwithin(s.location, v_point, 100, false)
  ) c
  where c.match is not null;

  return v_spots;
end;
$$;

-- Where the picker opens when no photo has GPS: {lng, lat}, the mean position of the city's live
-- spots, else of every live spot, else JSON null. A plain mean is the centroid of the points; the
-- supported cities are nowhere near the antimeridian.
create function public.admin_city_centre(p_city text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set extra_float_digits = 1
as $$
declare
  v_centre jsonb;
begin
  perform public.require_admin();

  select jsonb_build_object(
    'lng', avg(extensions.st_x(s.location::extensions.geometry)),
    'lat', avg(extensions.st_y(s.location::extensions.geometry))
  )
  into v_centre
  from public.spots s
  where s.city = p_city and s.deleted_at is null
  having count(*) > 0;

  if v_centre is null then
    select jsonb_build_object(
      'lng', avg(extensions.st_x(s.location::extensions.geometry)),
      'lat', avg(extensions.st_y(s.location::extensions.geometry))
    )
    into v_centre
    from public.spots s
    where s.deleted_at is null
    having count(*) > 0;
  end if;

  return coalesce(v_centre, 'null'::jsonb);
end;
$$;

-- The id a new spot gets: p_base when no spot (deleted included) holds it, else the first free
-- p_base-2, p_base-3, …. Called before any upload, so photo keys are built with the final id.
create function public.admin_next_spot_id(p_base text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_candidate text := p_base;
  v_suffix int := 1;
begin
  perform public.require_admin();
  if p_base is null or btrim(p_base) = '' then
    raise exception 'admin_next_spot_id: the base id must not be blank';
  end if;
  while exists (select 1 from public.spots s where s.id = v_candidate) loop
    v_suffix := v_suffix + 1;
    v_candidate := p_base || '-' || v_suffix;
  end loop;
  return v_candidate;
end;
$$;

-- Creates a spot from {id, city, name, status, lng, lat, notes, photos: [key…]} and returns it as
-- AdminSpot. The city must exist; the spot goes after the city's highest sort_order (deleted spots
-- included), or 0; sources is [] (no My Maps origin); photos take positions 0…n−1. Locks the city
-- row so two concurrent creates in one city cannot pick the same sort_order. Raises 'spot id taken:
-- <id>' (23505) when the id exists, deleted or not.
create function public.admin_create_spot(p_spot jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_id text;
  v_city text;
  v_name text;
  v_status public.spot_status;
  v_lng double precision;
  v_lat double precision;
  v_photos text[];
  v_sort_order int;
begin
  perform public.require_admin();

  if jsonb_typeof(p_spot) is distinct from 'object' then
    raise exception 'admin_create_spot: the spot must be a JSON object';
  end if;
  select k into v_key
  from jsonb_object_keys(p_spot) as k
  where k <> all (array['id', 'city', 'name', 'status', 'lng', 'lat', 'notes', 'photos'])
  limit 1;
  if found then
    raise exception 'admin_create_spot: unknown key %', v_key;
  end if;
  if jsonb_typeof(p_spot -> 'id') is distinct from 'string'
     or jsonb_typeof(p_spot -> 'city') is distinct from 'string'
     or jsonb_typeof(p_spot -> 'name') is distinct from 'string'
     or jsonb_typeof(p_spot -> 'status') is distinct from 'string'
     or jsonb_typeof(p_spot -> 'lng') is distinct from 'number'
     or jsonb_typeof(p_spot -> 'lat') is distinct from 'number'
     or coalesce(jsonb_typeof(p_spot -> 'notes'), 'null') not in ('string', 'null')
     or jsonb_typeof(p_spot -> 'photos') is distinct from 'array' then
    raise exception 'admin_create_spot: expected id, city, name and status as strings, lng and lat as numbers, notes as a string or null, photos as an array of strings';
  end if;
  -- A separate check: jsonb_array_elements raises on a non-array, and OR does not short-circuit.
  if exists (
    select 1 from jsonb_array_elements(p_spot -> 'photos') e where jsonb_typeof(e) is distinct from 'string'
  ) then
    raise exception 'admin_create_spot: expected id, city, name and status as strings, lng and lat as numbers, notes as a string or null, photos as an array of strings';
  end if;

  v_id := p_spot ->> 'id';
  if btrim(v_id) = '' then
    raise exception 'admin_create_spot: id must not be blank';
  end if;
  v_city := p_spot ->> 'city';
  perform 1 from public.cities c where c.slug = v_city for update;
  if not found then
    raise exception 'admin_create_spot: unknown city %', v_city;
  end if;
  -- An unknown status raises 22P02 from the cast.
  v_status := (p_spot ->> 'status')::public.spot_status;
  v_name := p_spot ->> 'name';
  perform public.check_spot_name('admin_create_spot', v_name);
  v_lng := (p_spot ->> 'lng')::double precision;
  v_lat := (p_spot ->> 'lat')::double precision;
  perform public.check_spot_position('admin_create_spot', v_lng, v_lat);
  v_photos := array(
    select t.key from jsonb_array_elements_text(p_spot -> 'photos') with ordinality as t (key, n) order by t.n
  );
  perform public.check_photo_keys('admin_create_spot', v_city, v_photos);

  select coalesce(max(s.sort_order) + 1, 0) into v_sort_order
  from public.spots s
  where s.city = v_city;

  begin
    insert into public.spots (id, city, name, status, location, sort_order, notes, sources)
    values (
      v_id, v_city, btrim(v_name), v_status,
      extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography,
      v_sort_order, p_spot ->> 'notes', '[]'::jsonb
    );
  exception when unique_violation then
    -- The primary key is the only immediate unique constraint here: (city, sort_order) is deferred.
    raise exception 'spot id taken: %', v_id using errcode = '23505';
  end;

  insert into public.spot_photos (spot_id, position, object_key)
  select v_id, (t.n - 1)::int, t.key
  from unnest(v_photos) with ordinality as t (key, n);

  return public.admin_spot_json(v_id);
end;
$$;

-- Applies a patch of {name?, status?, notes?, lng?, lat?} (lng and lat together) to a spot and
-- returns it as AdminSpot; any other key raises, so city, id and sort order never change here.
-- Bumps updated_at.
create function public.admin_update_spot(p_id text, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  perform public.require_admin();

  if jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception 'admin_update_spot: the patch must be a JSON object';
  end if;
  select k into v_key
  from jsonb_object_keys(p_patch) as k
  where k <> all (array['name', 'status', 'notes', 'lng', 'lat'])
  limit 1;
  if found then
    raise exception 'admin_update_spot: unknown key %', v_key;
  end if;
  if (p_patch ? 'lng') <> (p_patch ? 'lat') then
    raise exception 'admin_update_spot: lng and lat go together';
  end if;
  if (p_patch ? 'name' and jsonb_typeof(p_patch -> 'name') <> 'string')
     or (p_patch ? 'status' and jsonb_typeof(p_patch -> 'status') <> 'string')
     or (p_patch ? 'notes' and jsonb_typeof(p_patch -> 'notes') not in ('string', 'null'))
     or (p_patch ? 'lng' and jsonb_typeof(p_patch -> 'lng') <> 'number')
     or (p_patch ? 'lat' and jsonb_typeof(p_patch -> 'lat') <> 'number') then
    raise exception 'admin_update_spot: expected name and status as strings, notes as a string or null, lng and lat as numbers';
  end if;
  if p_patch ? 'name' then
    perform public.check_spot_name('admin_update_spot', p_patch ->> 'name');
  end if;
  if p_patch ? 'lng' then
    perform public.check_spot_position(
      'admin_update_spot', (p_patch ->> 'lng')::double precision, (p_patch ->> 'lat')::double precision
    );
  end if;

  -- An unknown status raises 22P02 from the cast.
  update public.spots s set
    name = case when p_patch ? 'name' then btrim(p_patch ->> 'name') else s.name end,
    status = case when p_patch ? 'status' then (p_patch ->> 'status')::public.spot_status else s.status end,
    notes = case when p_patch ? 'notes' then p_patch ->> 'notes' else s.notes end,
    location = case
      when p_patch ? 'lng' then extensions.st_setsrid(
        extensions.st_makepoint((p_patch ->> 'lng')::double precision, (p_patch ->> 'lat')::double precision),
        4326
      )::extensions.geography
      else s.location
    end,
    updated_at = now()
  where s.id = p_id;
  if not found then
    raise exception 'admin_update_spot: no spot %', p_id;
  end if;

  return public.admin_spot_json(p_id);
end;
$$;

-- Appends p_keys, in order, after the spot's last photo and returns the spot as AdminSpot. Locks
-- the spot row so concurrent photo edits of one spot run one after the other. Bumps updated_at.
create function public.admin_add_photos(p_spot_id text, p_keys text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_city text;
  v_last int;
begin
  perform public.require_admin();

  select s.city into v_city from public.spots s where s.id = p_spot_id for update;
  if not found then
    raise exception 'admin_add_photos: no spot %', p_spot_id;
  end if;
  perform public.check_photo_keys('admin_add_photos', v_city, p_keys);

  select coalesce(max(p.position), -1) into v_last from public.spot_photos p where p.spot_id = p_spot_id;
  insert into public.spot_photos (spot_id, position, object_key)
  select p_spot_id, v_last + t.n::int, t.key
  from unnest(p_keys) with ordinality as t (key, n);
  update public.spots s set updated_at = now() where s.id = p_spot_id;

  return public.admin_spot_json(p_spot_id);
end;
$$;

-- Puts the spot's photos in the order of p_keys, which must hold each of its keys exactly once,
-- and returns the spot as AdminSpot. (spot_id, position) is an immediate unique key, so the rows
-- are first parked at negative positions and then written 0…n−1. Bumps updated_at.
create function public.admin_reorder_photos(p_spot_id text, p_keys text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();

  perform 1 from public.spots s where s.id = p_spot_id for update;
  if not found then
    raise exception 'admin_reorder_photos: no spot %', p_spot_id;
  end if;
  if (select array_agg(p.object_key order by p.object_key) from public.spot_photos p where p.spot_id = p_spot_id)
     is distinct from (select array_agg(k order by k) from unnest(p_keys) as k) then
    raise exception 'admin_reorder_photos: the keys must be a permutation of the photos of spot %', p_spot_id;
  end if;

  update public.spot_photos p set position = -1 - p.position where p.spot_id = p_spot_id;
  update public.spot_photos p set position = (t.n - 1)::int
  from unnest(p_keys) with ordinality as t (key, n)
  where p.spot_id = p_spot_id and p.object_key = t.key;
  update public.spots s set updated_at = now() where s.id = p_spot_id;

  return public.admin_spot_json(p_spot_id);
end;
$$;

-- Removes one photo row and closes the gap, so positions stay 0…n−1, and returns the spot as
-- AdminSpot. The caller deletes the Storage objects afterwards. Two-step renumber as in
-- admin_reorder_photos: parked at -1 - position, so descending parked order is the old order.
-- Bumps updated_at.
create function public.admin_remove_photo(p_spot_id text, p_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();

  perform 1 from public.spots s where s.id = p_spot_id for update;
  if not found then
    raise exception 'admin_remove_photo: no spot %', p_spot_id;
  end if;
  delete from public.spot_photos p where p.spot_id = p_spot_id and p.object_key = p_key;
  if not found then
    raise exception 'admin_remove_photo: spot % has no photo %', p_spot_id, p_key;
  end if;

  update public.spot_photos p set position = -1 - p.position where p.spot_id = p_spot_id;
  update public.spot_photos p set position = r.new_position
  from (
    select q.object_key, (row_number() over (order by q.position desc) - 1)::int as new_position
    from public.spot_photos q
    where q.spot_id = p_spot_id
  ) r
  where p.object_key = r.object_key;
  update public.spots s set updated_at = now() where s.id = p_spot_id;

  return public.admin_spot_json(p_spot_id);
end;
$$;

-- Soft-deletes a spot (deleting it again keeps the first deleted_at) and returns it as AdminSpot.
-- It leaves city_spots(), the public tables and the snapshot export; its photos stay stored.
create function public.admin_delete_spot(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  update public.spots s set deleted_at = coalesce(s.deleted_at, now()), updated_at = now() where s.id = p_id;
  if not found then
    raise exception 'admin_delete_spot: no spot %', p_id;
  end if;
  return public.admin_spot_json(p_id);
end;
$$;

-- Brings a soft-deleted spot back (clears deleted_at) and returns it as AdminSpot.
create function public.admin_restore_spot(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  update public.spots s set deleted_at = null, updated_at = now() where s.id = p_id;
  if not found then
    raise exception 'admin_restore_spot: no spot %', p_id;
  end if;
  return public.admin_spot_json(p_id);
end;
$$;

-- Adds a city slug (lower-case words joined by single hyphens, e.g. 'new-town'); an existing slug
-- raises. The app's city list stays code: a new slug shows on the public map only once
-- SUPPORTED_CITIES names it.
create function public.admin_create_city(p_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'admin_create_city: slug must match ^[a-z0-9]+(-[a-z0-9]+)*$';
  end if;
  if exists (select 1 from public.cities c where c.slug = p_slug) then
    raise exception 'admin_create_city: city % already exists', p_slug;
  end if;
  insert into public.cities (slug) values (p_slug);
end;
$$;

-- One admin_settings value (e.g. 'esri_api_key'), or null when the key is not set.
create function public.admin_get_setting(p_key text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return (select s.value from public.admin_settings s where s.key = p_key);
end;
$$;

-- Supabase's default privileges grant execute on new functions to PUBLIC, anon and authenticated:
-- anon may call none of the admin RPCs; a signed-in user may call them all, and each one's
-- require_admin() turns away anyone who is not an admin.
revoke execute on function
  public.admin_list_spots(text),
  public.admin_get_spot(text),
  public.admin_nearby_spots(double precision, double precision, text),
  public.admin_city_centre(text),
  public.admin_next_spot_id(text),
  public.admin_create_spot(jsonb),
  public.admin_update_spot(text, jsonb),
  public.admin_add_photos(text, text[]),
  public.admin_reorder_photos(text, text[]),
  public.admin_remove_photo(text, text),
  public.admin_delete_spot(text),
  public.admin_restore_spot(text),
  public.admin_create_city(text),
  public.admin_get_setting(text)
from public, anon;
grant execute on function
  public.admin_list_spots(text),
  public.admin_get_spot(text),
  public.admin_nearby_spots(double precision, double precision, text),
  public.admin_city_centre(text),
  public.admin_next_spot_id(text),
  public.admin_create_spot(jsonb),
  public.admin_update_spot(text, jsonb),
  public.admin_add_photos(text, text[]),
  public.admin_reorder_photos(text, text[]),
  public.admin_remove_photo(text, text),
  public.admin_delete_spot(text),
  public.admin_restore_spot(text),
  public.admin_create_city(text),
  public.admin_get_setting(text)
to authenticated;
