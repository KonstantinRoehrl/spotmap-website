-- The maintainer tool's access rules and admin_* functions: anon and a signed-in non-admin can call
-- none of them, read neither admin table and cannot write the spot-photos bucket; an admin can, and
-- each function's effect holds — soft delete, nearby matching on both sides of 25 m and 100 m, the
-- city centre and its fallbacks, id suffixing, sort order, photo positions, patch, key and slug
-- validation, and settings. Passes on an empty database and on one already synced with the real
-- spots.
begin;
select plan(129);

-- Start from empty tables whatever the database already holds (a synced local stack has the real
-- spots, and a maintainer's own admin row and Esri key): the superuser bypasses row-level
-- security, photos go by cascade, and the rollback at the end puts every real row back.
delete from public.spots;
delete from public.cities;
delete from public.admins;
delete from public.admin_settings;

-- Two Auth users, an admin and a signed-in non-admin ("member"). id and email are all this test
-- needs; the other auth.users columns are nullable or have defaults (the same minimal insert
-- supabase-test-helpers' create_supabase_user makes).
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'admin@spotmap.test'),
  ('b0000000-0000-4000-8000-000000000002', 'member@spotmap.test');
insert into public.admins (user_id) values ('a0000000-0000-4000-8000-000000000001');
insert into public.admin_settings (key, value) values ('esri_api_key', 'test-esri-key');

insert into public.cities (slug) values ('vienna'), ('graz'), ('linz'), ('salzburg');
-- graz holds the nearby fixtures: due north (n-del due south) of (15, 47) at 10, 24.9, 25.1, 99.9
-- and 100.1 m on PostGIS's sphere (radius (2a + b) / 3 of WGS 84 ≈ 6,371,008.77 m), so each sits
-- 0.1 m inside or outside the 25 m and 100 m rules under either sphere radius.
insert into public.spots (id, city, name, status, location, sort_order, notes, sources, updated_at, deleted_at) values
  ('v-live', 'vienna', 'Live Ledge', 'active', 'SRID=4326;POINT(16.3 48.2)', 0, null, '[]', '2000-01-01', null),
  ('v-mid', 'vienna', 'Mid Rail', 'demolished', 'SRID=4326;POINT(16.4 48.22)', 1, 'gone', '[]', '2000-01-01', null),
  ('v-dead', 'vienna', 'Dead Gap', 'active', 'SRID=4326;POINT(17 49)', 5, null, '[]', '2000-01-01', '2026-01-01'),
  ('dup', 'linz', 'Dup', 'active', 'SRID=4326;POINT(14.29 48.3)', 0, null, '[]', '2000-01-01', null),
  ('dup-2', 'linz', 'Dup', 'active', 'SRID=4326;POINT(14.3 48.31)', 1, null, '[]', '2000-01-01', '2026-01-01'),
  ('n-del', 'graz', 'Old Ledge', 'active', 'SRID=4326;POINT(15 46.999910068)', 0, null, '[]', '2000-01-01', '2026-01-01'),
  ('n-24', 'graz', 'Other', 'active', 'SRID=4326;POINT(15 47.0002239308)', 1, null, '[]', '2000-01-01', null),
  ('n-26', 'graz', 'Ledge Line', 'active', 'SRID=4326;POINT(15 47.0002257294)', 2, null, '[]', '2000-01-01', null),
  ('n-99', 'graz', 'LEDGE line ', 'active', 'SRID=4326;POINT(15 47.000898421)', 3, null, '[]', '2000-01-01', null),
  ('n-101', 'graz', 'Ledge Line', 'active', 'SRID=4326;POINT(15 47.0009002197)', 4, null, '[]', '2000-01-01', null);
insert into public.spot_photos (spot_id, position, object_key) values
  ('v-live', 0, 'vienna/v-live-00000001.webp'),
  ('v-live', 1, 'vienna/v-live-00000002.webp'),
  ('v-live', 2, 'vienna/v-live-00000003.webp'),
  ('v-dead', 0, 'vienna/v-dead-00000009.webp'),
  ('n-24', 0, 'graz/n-24-00000001.webp'),
  ('n-24', 1, 'graz/n-24-00000002.webp');

-- Shape: who may execute what, and the four Storage policies.
select ok(
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.admins'::regclass, 'public.admin_settings'::regclass)),
  'row-level security is on for admins and admin_settings');
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'admin\_%'
      and p.prosecdef
      and exists (select 1 from unnest(p.proconfig) c where c in ('search_path=""', 'search_path='))),
  15::bigint,
  'all fifteen admin_* functions (fourteen RPCs and admin_spot_json) are security definer with an empty search_path');
select is(
  (select array_agg(p.proname::text order by p.proname collate "C")
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'admin\_%'
           or p.proname in ('is_admin', 'require_admin', 'check_spot_position', 'check_spot_name', 'check_photo_keys'))
      and has_function_privilege('authenticated', p.oid, 'execute')),
  array['admin_add_photos', 'admin_city_centre', 'admin_create_city', 'admin_create_spot', 'admin_delete_spot',
        'admin_get_setting', 'admin_get_spot', 'admin_list_spots', 'admin_nearby_spots', 'admin_next_spot_id',
        'admin_remove_photo', 'admin_reorder_photos', 'admin_restore_spot', 'admin_update_spot', 'is_admin'],
  'a signed-in user may execute exactly the fourteen RPCs and is_admin (not require_admin, admin_spot_json or the checks)');
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'admin\_%'
           or p.proname in ('is_admin', 'require_admin', 'check_spot_position', 'check_spot_name', 'check_photo_keys'))
      and has_function_privilege('anon', p.oid, 'execute')),
  0::bigint,
  'anon may execute none of the admin functions');
select is(
  (select array_agg(policyname::text || ':' || cmd order by policyname collate "C") from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and roles = array['authenticated']::name[]
      and policyname in ('admins read spot photo objects', 'admins upload spot photos',
                         'admins update spot photos', 'admins delete spot photos')),
  array['admins delete spot photos:DELETE', 'admins read spot photo objects:SELECT',
        'admins update spot photos:UPDATE', 'admins upload spot photos:INSERT'],
  'the four admin Storage policies exist, one per command, for signed-in users');

-- As anon: no JWT claims, so auth.uid() is null.
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
set local role anon;

select throws_ok($$select public.admin_list_spots()$$, '42501', null, 'anon cannot call admin_list_spots');
select throws_ok($$select public.admin_get_spot('v-live')$$, '42501', null, 'anon cannot call admin_get_spot');
select throws_ok($$select public.admin_nearby_spots(15, 47)$$, '42501', null, 'anon cannot call admin_nearby_spots');
select throws_ok($$select public.admin_city_centre('vienna')$$, '42501', null, 'anon cannot call admin_city_centre');
select throws_ok($$select public.admin_next_spot_id('x')$$, '42501', null, 'anon cannot call admin_next_spot_id');
select throws_ok($$select public.admin_create_spot('{}')$$, '42501', null, 'anon cannot call admin_create_spot');
select throws_ok($$select public.admin_update_spot('v-live', '{}')$$, '42501', null, 'anon cannot call admin_update_spot');
select throws_ok(
  $$select public.admin_add_photos('v-live', array['vienna/x.webp'])$$, '42501', null, 'anon cannot call admin_add_photos');
select throws_ok(
  $$select public.admin_reorder_photos('v-live', array[]::text[])$$, '42501', null, 'anon cannot call admin_reorder_photos');
select throws_ok(
  $$select public.admin_remove_photo('v-live', 'vienna/v-live-00000001.webp')$$, '42501', null,
  'anon cannot call admin_remove_photo');
select throws_ok($$select public.admin_delete_spot('v-live')$$, '42501', null, 'anon cannot call admin_delete_spot');
select throws_ok($$select public.admin_restore_spot('v-dead')$$, '42501', null, 'anon cannot call admin_restore_spot');
select throws_ok($$select public.admin_create_city('x')$$, '42501', null, 'anon cannot call admin_create_city');
select throws_ok($$select public.admin_get_setting('esri_api_key')$$, '42501', null, 'anon cannot call admin_get_setting');
select throws_ok($$select public.is_admin()$$, '42501', null, 'anon cannot call is_admin');
select throws_ok($$select count(*) from public.admins$$, '42501', null, 'anon cannot read admins');
select is(
  (select array_agg(id order by id collate "C") from public.spots),
  array['dup', 'n-101', 'n-24', 'n-26', 'n-99', 'v-live', 'v-mid'],
  'anon reads the live spots only');
select is(
  (select count(*) from public.spot_photos where spot_id = 'v-dead'), 0::bigint,
  'anon reads no photo of a deleted spot');

-- As the signed-in non-admin: auth.uid() reads the sub claim of request.jwt.claims.
reset role;
do $$ begin
  perform set_config('request.jwt.claims', '{"sub": "b0000000-0000-4000-8000-000000000002", "role": "authenticated"}', true);
end $$;
set local role authenticated;

select is(public.is_admin(), false, 'a signed-in non-admin is not an admin');
select throws_ok($$select public.admin_list_spots()$$, '42501', 'admin only', 'a non-admin cannot call admin_list_spots');
select throws_ok($$select public.admin_get_spot('v-live')$$, '42501', 'admin only', 'a non-admin cannot call admin_get_spot');
select throws_ok(
  $$select public.admin_nearby_spots(15, 47)$$, '42501', 'admin only', 'a non-admin cannot call admin_nearby_spots');
select throws_ok(
  $$select public.admin_city_centre('vienna')$$, '42501', 'admin only', 'a non-admin cannot call admin_city_centre');
select throws_ok(
  $$select public.admin_next_spot_id('x')$$, '42501', 'admin only', 'a non-admin cannot call admin_next_spot_id');
select throws_ok(
  $$select public.admin_create_spot('{}')$$, '42501', 'admin only',
  'a non-admin cannot call admin_create_spot (the admin check runs before any validation)');
select throws_ok(
  $$select public.admin_update_spot('v-live', '{}')$$, '42501', 'admin only', 'a non-admin cannot call admin_update_spot');
select throws_ok(
  $$select public.admin_add_photos('v-live', array['vienna/x.webp'])$$, '42501', 'admin only',
  'a non-admin cannot call admin_add_photos');
select throws_ok(
  $$select public.admin_reorder_photos('v-live', array[]::text[])$$, '42501', 'admin only',
  'a non-admin cannot call admin_reorder_photos');
select throws_ok(
  $$select public.admin_remove_photo('v-live', 'vienna/v-live-00000001.webp')$$, '42501', 'admin only',
  'a non-admin cannot call admin_remove_photo');
select throws_ok(
  $$select public.admin_delete_spot('v-live')$$, '42501', 'admin only', 'a non-admin cannot call admin_delete_spot');
select throws_ok(
  $$select public.admin_restore_spot('v-dead')$$, '42501', 'admin only', 'a non-admin cannot call admin_restore_spot');
select throws_ok(
  $$select public.admin_create_city('x')$$, '42501', 'admin only', 'a non-admin cannot call admin_create_city');
select throws_ok(
  $$select public.admin_get_setting('esri_api_key')$$, '42501', 'admin only', 'a non-admin cannot call admin_get_setting');
select throws_ok($$select public.require_admin()$$, '42501', null, 'a signed-in user cannot call require_admin directly');
select throws_ok(
  $$select public.admin_spot_json('v-live')$$, '42501', null, 'a signed-in user cannot call admin_spot_json directly');
select throws_ok($$select count(*) from public.admins$$, '42501', null, 'a non-admin cannot read admins');
select throws_ok($$select count(*) from public.admin_settings$$, '42501', null, 'a non-admin cannot read admin_settings');
select is(
  (select count(*) from public.spots where deleted_at is not null), 0::bigint,
  'a non-admin reads no deleted spot');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('spot-photos', 'full/vienna/x-00000000.webp')$$,
  '42501', null, 'a signed-in non-admin cannot write the spot-photos bucket');

-- As the admin.
reset role;
do $$ begin
  perform set_config('request.jwt.claims', '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
end $$;
set local role authenticated;

select is(public.is_admin(), true, 'the admin is an admin');
select is((select count(*) from public.spots), 10::bigint, 'an admin reads every spot, deleted ones included');
select is(
  (select count(*) from public.spot_photos where spot_id = 'v-dead'), 1::bigint,
  'an admin reads the photos of a deleted spot');
select throws_ok(
  $$select count(*) from public.admin_settings$$, '42501', null,
  'not even an admin reads admin_settings directly: the key leaves only through admin_get_setting');
select is(
  jsonb_path_query_array(public.city_spots('vienna'), '$.features[*].properties.id'), '["v-live", "v-mid"]'::jsonb,
  'city_spots leaves a deleted spot out even for an admin, whose policy can see it');

-- Reads.
select is(public.admin_get_setting('esri_api_key'), 'test-esri-key', 'admin_get_setting returns a stored value');
select is(public.admin_get_setting('missing'), null::text,'admin_get_setting returns null for an unset key');
select is(
  public.admin_get_spot('v-live') - 'updatedAt',
  '{"id": "v-live", "city": "vienna", "name": "Live Ledge", "status": "active", "lng": 16.3, "lat": 48.2,
    "notes": null, "deletedAt": null,
    "photos": ["vienna/v-live-00000001.webp", "vienna/v-live-00000002.webp", "vienna/v-live-00000003.webp"]}'::jsonb,
  'admin_get_spot returns the AdminSpot JSON, photos in gallery order');
select is(
  (select array_agg(k order by k collate "C") from jsonb_object_keys(public.admin_get_spot('v-live')) as k),
  array['city', 'deletedAt', 'id', 'lat', 'lng', 'name', 'notes', 'photos', 'status', 'updatedAt'],
  'AdminSpot has exactly the keys of the TypeScript interface');
select is(
  (public.admin_get_spot('v-live') ->> 'updatedAt')::timestamptz, '2000-01-01'::timestamptz,
  'updatedAt is the row''s updated_at as timestamp text');
select is(
  (public.admin_get_spot('v-dead') ->> 'deletedAt')::timestamptz, '2026-01-01'::timestamptz,
  'a deleted spot carries its deletedAt');
select throws_ok($$select public.admin_get_spot('nope')$$, 'P0001', 'admin_get_spot: no spot nope', 'an unknown id raises');
select is(
  jsonb_path_query_array(public.admin_list_spots(), '$[*].id'),
  '["n-del", "n-24", "n-26", "n-99", "n-101", "dup", "dup-2", "v-live", "v-mid", "v-dead"]'::jsonb,
  'admin_list_spots lists every spot, deleted included, by city then sort order');
select is(
  jsonb_path_query_array(public.admin_list_spots('vienna'), '$[*].id'), '["v-live", "v-mid", "v-dead"]'::jsonb,
  'admin_list_spots narrows to one city');
select is(public.admin_list_spots('salzburg'), '[]'::jsonb, 'a city without spots lists []');

-- Nearby: 25 m by position, 100 m by name.
select is(
  jsonb_path_query_array(public.admin_nearby_spots(15, 47), '$[*].id'), '["n-del", "n-24"]'::jsonb,
  'without a name only spots within 25 m match: 10 m (deleted) and 24.9 m in, 25.1 m out');
select is(
  public.admin_nearby_spots(15, 47) -> 0 -> 'deleted', 'true'::jsonb,
  'a deleted spot within 25 m is a candidate, flagged deleted');
select is(
  (public.admin_nearby_spots(15, 47) -> 1) - 'distanceM' - 'lat',
  '{"id": "n-24", "city": "graz", "name": "Other", "status": "active", "lng": 15, "photoCount": 2,
    "deleted": false, "match": "position"}'::jsonb,
  'a position match carries its spot, photo count and match kind');
select ok(
  (public.admin_nearby_spots(15, 47) -> 1 ->> 'distanceM')::float8 between 24.89 and 24.91,
  'distanceM is the distance in metres');
select is(
  (select array_agg(k order by k collate "C") from jsonb_object_keys(public.admin_nearby_spots(15, 47) -> 0) as k),
  array['city', 'deleted', 'distanceM', 'id', 'lat', 'lng', 'match', 'name', 'photoCount', 'status'],
  'NearbySpot has exactly the keys of the TypeScript interface');
select is(
  jsonb_path_query_array(public.admin_nearby_spots(15, 47, '  ledge LINE '), '$[*].id'),
  '["n-del", "n-24", "n-26", "n-99"]'::jsonb,
  'with a name, same-named spots within 100 m match too (99.9 m in, 100.1 m out)');
select is(
  jsonb_path_query_array(public.admin_nearby_spots(15, 47, '  ledge LINE '), '$[*] ? (@.match == "name").id'),
  '["n-26", "n-99"]'::jsonb,
  'the name rule ignores case and surrounding whitespace on both sides, and applies beyond 25 m');
select is(
  jsonb_path_query_array(public.admin_nearby_spots(15, 47, '   '), '$[*].id'), '["n-del", "n-24"]'::jsonb,
  'a blank name is no name');
select throws_ok(
  $$select public.admin_nearby_spots(15, 91)$$, 'P0001', 'admin_nearby_spots: lat must be within [-90, 90]',
  'an impossible position raises');

-- City centre: live spots of the city, else all live spots.
select ok(
  (select abs((c ->> 'lng')::float8 - 16.35) < 1e-9 and abs((c ->> 'lat')::float8 - 48.21) < 1e-9
     from (select public.admin_city_centre('vienna') as c) t),
  'admin_city_centre is the mean of the city''s live spots (the deleted one at 17, 49 ignored)');
select ok(
  (select abs((c ->> 'lng')::float8 - 15.284285714285716) < 1e-9
      and abs((c ->> 'lat')::float8 - 47.531749757214286) < 1e-9
     from (select public.admin_city_centre('salzburg') as c) t),
  'a city without live spots falls back to the mean of every live spot');

-- Next id.
select is(public.admin_next_spot_id('fresh-spot-abc123'), 'fresh-spot-abc123', 'a free id is used as it is');
select is(public.admin_next_spot_id('v-live'), 'v-live-2', 'a taken id gets -2');
select is(public.admin_next_spot_id('dup'), 'dup-3', 'a deleted spot still holds its id, so dup-2 taken gives dup-3');
select throws_ok(
  $$select public.admin_next_spot_id(' ')$$, 'P0001', 'admin_next_spot_id: the base id must not be blank',
  'a blank base raises');

-- Create.
select is(
  public.admin_create_spot('{"id": "new-spot", "city": "vienna", "name": "  New Spot ", "status": "active",
    "lng": 16.5, "lat": 48.25, "notes": null,
    "photos": ["vienna/new-spot-aaaaaaaa.webp", "vienna/new-spot-bbbbbbbb.webp"]}') - 'updatedAt',
  '{"id": "new-spot", "city": "vienna", "name": "New Spot", "status": "active", "lng": 16.5, "lat": 48.25,
    "notes": null, "deletedAt": null,
    "photos": ["vienna/new-spot-aaaaaaaa.webp", "vienna/new-spot-bbbbbbbb.webp"]}'::jsonb,
  'admin_create_spot stores the spot (name trimmed) and returns it');
select is(
  (select sort_order from public.spots where id = 'new-spot'), 6,
  'a new spot goes after the city''s highest sort_order, the deleted spot''s 5 included');
select is((select sources from public.spots where id = 'new-spot'), '[]'::jsonb, 'a created spot has no My Maps sources');
select is(
  (select array_agg(position order by position) from public.spot_photos where spot_id = 'new-spot'), array[0, 1],
  'its photos take positions 0 and 1');
select is(
  (public.admin_create_spot('{"id": "salz-1", "city": "salzburg", "name": "First", "status": "demolished",
    "lng": 13.04, "lat": 47.8, "notes": "only one", "photos": []}') -> 'photos'),
  '[]'::jsonb,
  'a spot without photos is created');
select is((select sort_order from public.spots where id = 'salz-1'), 0, 'the first spot of a city gets sort_order 0');
select throws_ok(
  $$select public.admin_create_spot('{"id": "v-dead", "city": "vienna", "name": "X", "status": "active",
      "lng": 16.6, "lat": 48.3, "notes": null, "photos": []}')$$,
  '23505', 'spot id taken: v-dead', 'an id held by any spot, a deleted one included, raises 23505');
select throws_ok(
  $$select public.admin_create_spot('{"id": "x-new", "city": "atlantis", "name": "X", "status": "active",
      "lng": 16.6, "lat": 48.3, "notes": null, "photos": []}')$$,
  'P0001', 'admin_create_spot: unknown city atlantis', 'an unknown city raises');
select throws_ok(
  $$select public.admin_create_spot('{"id": "x-new", "city": "vienna", "name": "  ", "status": "active",
      "lng": 16.6, "lat": 48.3, "notes": null, "photos": []}')$$,
  'P0001', 'admin_create_spot: name must not be blank', 'a blank name raises');
select throws_ok(
  $$select public.admin_create_spot('{"id": "x-new", "city": "vienna", "name": "X", "status": "active",
      "lng": 180.5, "lat": 48.3, "notes": null, "photos": []}')$$,
  'P0001', 'admin_create_spot: lng must be within [-180, 180]', 'a longitude past 180 raises');
select throws_ok(
  $$select public.admin_create_spot('{"id": "x-new", "city": "vienna", "name": "X", "status": "active",
      "lng": 16.6, "lat": -90.5, "notes": null, "photos": []}')$$,
  'P0001', 'admin_create_spot: lat must be within [-90, 90]', 'a latitude past -90 raises');
select throws_ok(
  $$select public.admin_create_spot('{"id": "x-new", "city": "vienna", "name": "X", "status": "unclassified",
      "lng": 16.6, "lat": 48.3, "notes": null, "photos": []}')$$,
  '22P02', null, 'an unknown status raises');
select throws_ok(
  $$select public.admin_create_spot('{"id": "x-new", "city": "vienna", "name": "X", "status": "active",
      "lng": 16.6, "lat": 48.3, "notes": null, "photos": ["graz/x-new-00000000.webp"]}')$$,
  'P0001', 'admin_create_spot: photo key graz/x-new-00000000.webp must look like vienna/<file>.webp',
  'a photo key of another city raises');
select throws_ok(
  $$select public.admin_create_spot('{"id": "x-new", "city": "vienna", "name": "X", "status": "active",
      "lng": 16.6, "lat": 48.3, "notes": null, "photos": ["vienna/sub/x-new-00000000.webp"]}')$$,
  'P0001', 'admin_create_spot: photo key vienna/sub/x-new-00000000.webp must look like vienna/<file>.webp',
  'a photo key with a nested path raises');
select throws_ok(
  $$select public.admin_create_spot('{"id": "x-new", "city": "vienna", "name": "X", "status": "active",
      "lng": 16.6, "lat": 48.3, "notes": null, "photos": ["vienna/x-new-00000000.jpg"]}')$$,
  'P0001', 'admin_create_spot: photo key vienna/x-new-00000000.jpg must look like vienna/<file>.webp',
  'a photo key that is not .webp raises');
select throws_ok(
  $$select public.admin_create_spot('{"id": "x-new", "city": "vienna", "name": "X", "status": "active",
      "lng": 16.6, "lat": 48.3, "notes": null, "photos": [], "sort_order": 0}')$$,
  'P0001', 'admin_create_spot: unknown key sort_order', 'an unknown key raises');
select throws_ok(
  $$select public.admin_create_spot('{"id": "x-new", "city": "vienna", "name": "X", "status": "active",
      "lng": 16.6, "notes": null, "photos": []}')$$,
  'P0001',
  'admin_create_spot: expected id, city, name and status as strings, lng and lat as numbers, notes as a string or null, photos as an array of strings',
  'a missing field raises');

-- Update.
select is(
  (select jsonb_build_array(s -> 'name', s -> 'status', s -> 'notes')
     from (select public.admin_update_spot('v-mid', '{"name": " Mid Rail Renamed ", "status": "active", "notes": null}') as s) t),
  '["Mid Rail Renamed", "active", null]'::jsonb,
  'admin_update_spot changes name (trimmed), status and notes (null clears)');
select ok(
  (select updated_at > '2000-01-01' from public.spots where id = 'v-mid'), 'and moves updated_at');
select is(
  (select jsonb_build_array(s -> 'lng', s -> 'lat')
     from (select public.admin_update_spot('v-mid', '{"lng": 16.41, "lat": 48.23}') as s) t),
  '[16.41, 48.23]'::jsonb,
  'lng and lat move the spot together');
select throws_ok(
  $$select public.admin_update_spot('v-mid', '{"lng": 16.42}')$$, 'P0001', 'admin_update_spot: lng and lat go together',
  'lng without lat raises');
select throws_ok(
  $$select public.admin_update_spot('v-mid', '{"name": "Y", "city": "graz"}')$$, 'P0001',
  'admin_update_spot: unknown key city', 'the city cannot be patched');
select throws_ok(
  $$select public.admin_update_spot('v-mid', '{"sort_order": 0}')$$, 'P0001',
  'admin_update_spot: unknown key sort_order', 'the sort order cannot be patched');
select throws_ok(
  $$select public.admin_update_spot('v-mid', '{"name": 5}')$$, 'P0001',
  'admin_update_spot: expected name and status as strings, notes as a string or null, lng and lat as numbers',
  'a mistyped field raises');
select throws_ok(
  $$select public.admin_update_spot('v-mid', '{"name": "  "}')$$, 'P0001', 'admin_update_spot: name must not be blank',
  'a blank name raises');
select throws_ok(
  $$select public.admin_update_spot('v-mid', '{"lng": 16.4, "lat": 90.5}')$$, 'P0001',
  'admin_update_spot: lat must be within [-90, 90]', 'an impossible position raises');
select throws_ok(
  $$select public.admin_update_spot('v-mid', '{"status": "unclassified"}')$$, '22P02', null, 'an unknown status raises');
select throws_ok(
  $$select public.admin_update_spot('nope', '{"name": "Y"}')$$, 'P0001', 'admin_update_spot: no spot nope',
  'an unknown id raises');

-- Photos: append, reorder, remove — positions stay 0…n−1.
select is(
  public.admin_add_photos('v-live', array['vienna/v-live-00000004.webp']) -> 'photos',
  '["vienna/v-live-00000001.webp", "vienna/v-live-00000002.webp", "vienna/v-live-00000003.webp",
    "vienna/v-live-00000004.webp"]'::jsonb,
  'admin_add_photos appends after the last photo');
select is(
  (select array_agg(position order by position) from public.spot_photos where spot_id = 'v-live'), array[0, 1, 2, 3],
  'and the positions stay contiguous');
select ok((select updated_at > '2000-01-01' from public.spots where id = 'v-live'), 'and moves updated_at');
select throws_ok(
  $$select public.admin_add_photos('v-live', array['graz/v-live-00000005.webp'])$$, 'P0001',
  'admin_add_photos: photo key graz/v-live-00000005.webp must look like vienna/<file>.webp',
  'a photo key of another city raises');
select throws_ok(
  $$select public.admin_add_photos('nope', array['vienna/nope-00000001.webp'])$$, 'P0001',
  'admin_add_photos: no spot nope', 'adding to an unknown spot raises');
select is(
  public.admin_reorder_photos('v-live', array['vienna/v-live-00000004.webp', 'vienna/v-live-00000001.webp',
                                              'vienna/v-live-00000003.webp', 'vienna/v-live-00000002.webp']) -> 'photos',
  '["vienna/v-live-00000004.webp", "vienna/v-live-00000001.webp", "vienna/v-live-00000003.webp",
    "vienna/v-live-00000002.webp"]'::jsonb,
  'admin_reorder_photos stores the new order');
select is(
  (select array_agg(position order by position) from public.spot_photos where spot_id = 'v-live'), array[0, 1, 2, 3],
  'and the positions stay contiguous');
select throws_ok(
  $$select public.admin_reorder_photos('v-live', array['vienna/v-live-00000004.webp', 'vienna/v-live-00000001.webp',
                                                       'vienna/v-live-00000003.webp'])$$,
  'P0001', 'admin_reorder_photos: the keys must be a permutation of the photos of spot v-live',
  'a reorder missing a photo raises');
select throws_ok(
  $$select public.admin_reorder_photos('v-live', array['vienna/v-live-00000004.webp', 'vienna/v-live-00000004.webp',
                                                       'vienna/v-live-00000003.webp', 'vienna/v-live-00000002.webp'])$$,
  'P0001', 'admin_reorder_photos: the keys must be a permutation of the photos of spot v-live',
  'a reorder repeating a photo raises');
select is(
  public.admin_remove_photo('v-live', 'vienna/v-live-00000001.webp') -> 'photos',
  '["vienna/v-live-00000004.webp", "vienna/v-live-00000003.webp", "vienna/v-live-00000002.webp"]'::jsonb,
  'admin_remove_photo drops one photo and keeps the order of the rest');
select is(
  (select array_agg(position order by position) from public.spot_photos where spot_id = 'v-live'), array[0, 1, 2],
  'and closes the gap');
select throws_ok(
  $$select public.admin_remove_photo('v-live', 'vienna/nope.webp')$$, 'P0001',
  'admin_remove_photo: spot v-live has no photo vienna/nope.webp', 'removing a photo the spot does not have raises');

-- Soft delete and restore.
select isnt(
  public.admin_delete_spot('v-live') -> 'deletedAt', 'null'::jsonb, 'admin_delete_spot sets deletedAt');
select is(
  jsonb_path_query_array(public.city_spots('vienna'), '$.features[*].properties.id'), '["v-mid", "new-spot"]'::jsonb,
  'a deleted spot leaves city_spots');
select is(
  (select count(*) from public.spot_photos where spot_id = 'v-live'), 3::bigint, 'its photo rows stay for a restore');
select is(public.admin_restore_spot('v-live') -> 'deletedAt', 'null'::jsonb, 'admin_restore_spot clears deletedAt');
select is(
  jsonb_path_query_array(public.city_spots('vienna'), '$.features[*].properties.id'),
  '["v-live", "v-mid", "new-spot"]'::jsonb,
  'a restored spot is back in city_spots at its old place');
select throws_ok($$select public.admin_delete_spot('nope')$$, 'P0001', 'admin_delete_spot: no spot nope', 'deleting an unknown id raises');
select throws_ok($$select public.admin_restore_spot('nope')$$, 'P0001', 'admin_restore_spot: no spot nope', 'restoring an unknown id raises');

-- Cities.
select lives_ok($$select public.admin_create_city('new-town')$$, 'admin_create_city adds a slug');
select is((select count(*) from public.cities where slug = 'new-town'), 1::bigint, 'and the city exists');
select throws_ok(
  $$select public.admin_create_city('New Town')$$, 'P0001', 'admin_create_city: slug must match ^[a-z0-9]+(-[a-z0-9]+)*$',
  'a slug with capitals or spaces raises');
select throws_ok(
  $$select public.admin_create_city('new--town')$$, 'P0001', 'admin_create_city: slug must match ^[a-z0-9]+(-[a-z0-9]+)*$',
  'a slug with a doubled hyphen raises');
select throws_ok(
  $$select public.admin_create_city('vienna')$$, 'P0001', 'admin_create_city: city vienna already exists',
  'an existing slug raises');

-- The bucket accepts an admin's upload, and the admin can see it.
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('spot-photos', 'full/vienna/v-live-00000004.webp')$$,
  'an admin uploads to the spot-photos bucket');
select is(
  (select count(*) from storage.objects where bucket_id = 'spot-photos' and name = 'full/vienna/v-live-00000004.webp'),
  1::bigint, 'and reads the object back');

-- No live spot anywhere: the centre is JSON null.
reset role;
update public.spots set deleted_at = now() where deleted_at is null;
set local role authenticated;
select is(public.admin_city_centre('vienna'), 'null'::jsonb, 'with no live spot anywhere the centre is JSON null');

select * from finish();
rollback;
