-- Phase 12, the map page's two public reads. The pins and the list of the spots in view need
-- only each spot's id, name, status, first photo and photo count for a whole city
-- (city_spot_list); a spot's notes and full photo list are fetched when it is opened
-- (spot_detail), which is also what resolves a cold /spot/<id> link to its city. They sit beside
-- city_spots(), which stays exactly as it is: the snapshot export (npm run snapshot:supabase)
-- reads it, and the bundled snapshots keep the full shape the app derives both of these shapes
-- from when the backend is down. The hosted project is given this migration by hand
-- (npx supabase db push) before the merge to main; until then the app's live requests fail and it
-- serves the snapshots, so the live site works before and after.

-- One city's spots in the list shape: city_spots()' features with each one's notes and photo
-- list replaced by its cover (the first photo's key by position, JSON null without photos) and its
-- photo count. Same order, same own soft-delete filter and same unknown-city raise (HTTP 400
-- through PostgREST, so the client falls back to the snapshot) as city_spots().
-- extra_float_digits is pinned to 1 so to_jsonb prints a coordinate's shortest round-trip text, as
-- the snapshot does.
create function public.city_spot_list(p_city text)
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
          'cover', (select p.object_key
                      from public.spot_photos p
                     where p.spot_id = s.id
                     order by p.position
                     limit 1),
          'photoCount', (select count(*) from public.spot_photos p where p.spot_id = s.id)
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

grant execute on function public.city_spot_list(text) to anon, authenticated;

-- One live spot's full record: its city, name, status, notes, every photo key in gallery order
-- and its coordinates. An unknown or soft-deleted id answers SQL null (PostgREST: 200 with body
-- null), never an error, so the client can tell "no such spot" — which is final — from an outage,
-- which falls back to the snapshot. Filters deleted_at itself because the secret key bypasses
-- row-level security.
create function public.spot_detail(p_id text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
set extra_float_digits = 1
as $$
  select jsonb_build_object(
    'id', s.id,
    'city', s.city,
    'name', s.name,
    'status', s.status,
    'notes', s.notes,
    'photos', coalesce(
      (select jsonb_agg(p.object_key order by p.position)
         from public.spot_photos p
        where p.spot_id = s.id),
      '[]'::jsonb
    ),
    'coordinates', jsonb_build_array(
      to_jsonb(extensions.st_x(s.location::extensions.geometry)),
      to_jsonb(extensions.st_y(s.location::extensions.geometry))
    )
  )
  from public.spots s
  where s.id = p_id and s.deleted_at is null;
$$;

grant execute on function public.spot_detail(text) to anon, authenticated;
