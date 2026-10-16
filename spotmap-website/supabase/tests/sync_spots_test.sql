-- sync_spots(), run as the secret key's service_role: inserts, re-runs as a no-op, updates only
-- what changed, diffs photos, deletes what vanished, and rolls back entirely on a bad payload.
begin;
select plan(17);

set local role service_role;

create temporary table first_payload as select '{
  "cities": ["vienna", "graz"],
  "spots": [
    {"id": "a-1", "city": "vienna", "sort_order": 0, "name": "Alpha", "status": "active",
     "lng": 16.3785491, "lat": 48.1840844, "notes": null, "sources": [{"map": "vienna"}],
     "photos": ["vienna/a-1-11111111.webp", "vienna/a-1-22222222.webp"]},
    {"id": "b-2", "city": "vienna", "sort_order": 1, "name": "Beta", "status": "demolished",
     "lng": 16.4, "lat": 48.22, "notes": "gone", "sources": [{"map": "vienna", "description": "gone"}],
     "photos": []},
    {"id": "g-1", "city": "graz", "sort_order": 0, "name": "Gamma", "status": "active",
     "lng": 15.43, "lat": 47.07, "notes": null, "sources": [{"map": "graz"}],
     "photos": ["graz/g-1-33333333.webp"]}
  ]}'::jsonb as payload;

select is(
  public.sync_spots((select payload from first_payload)),
  '{"spots": {"inserted": 3, "updated": 0, "deleted": 0}, "photos": {"inserted": 3, "deleted": 0}}'::jsonb,
  'a first sync inserts every spot and photo');
select is((select count(*) from public.cities), 2::bigint, 'and both cities');

select is(
  public.sync_spots((select payload from first_payload)),
  '{"spots": {"inserted": 0, "updated": 0, "deleted": 0}, "photos": {"inserted": 0, "deleted": 0}}'::jsonb,
  'a re-run with unchanged data changes nothing');

update public.spots set updated_at = '2000-01-01' where id in ('a-1', 'b-2');

select is(
  public.sync_spots(jsonb_set(
    jsonb_set((select payload from first_payload), '{spots,0,lat}', '48.19'),
    '{spots,0,photos}', '["vienna/a-1-22222222.webp", "vienna/a-1-44444444.webp"]')),
  '{"spots": {"inserted": 0, "updated": 1, "deleted": 0}, "photos": {"inserted": 2, "deleted": 2}}'::jsonb,
  'a moved spot is one update; its reordered and replaced photos are diffed');
select is(
  (select array_agg(object_key order by position) from public.spot_photos where spot_id = 'a-1'),
  array['vienna/a-1-22222222.webp', 'vienna/a-1-44444444.webp'],
  'the gallery follows the payload order');
select ok(
  (select updated_at > '2000-01-01' from public.spots where id = 'a-1'),
  'the changed spot''s updated_at moves');
select is(
  (select updated_at from public.spots where id = 'b-2'), '2000-01-01'::timestamptz,
  'an unchanged spot keeps its updated_at');
select is(
  (select extensions.st_y(location::extensions.geometry) from public.spots where id = 'a-1'), 48.19::float8,
  'the new latitude is stored');

select is(
  public.sync_spots('{
    "cities": ["vienna"],
    "spots": [
      {"id": "b-2", "city": "vienna", "sort_order": 0, "name": "Beta", "status": "demolished",
       "lng": 16.4, "lat": 48.22, "notes": "gone", "sources": [{"map": "vienna", "description": "gone"}],
       "photos": []}
    ]}'::jsonb),
  '{"spots": {"inserted": 0, "updated": 1, "deleted": 2}, "photos": {"inserted": 0, "deleted": 3}}'::jsonb,
  'vanished spots go with their photos, and a re-sorted spot is an update');
select is((select array_agg(slug) from public.cities), array['vienna'], 'a city no longer in the payload goes');

select throws_ok(
  $$select public.sync_spots('{"cities": ["vienna"], "spots": [
      {"id": "b-2", "city": "vienna", "sort_order": 0, "name": "Beta", "status": "demolished",
       "lng": 16.4, "lat": 48.22, "notes": null, "sources": [], "photos": []},
      {"id": "b-2", "city": "vienna", "sort_order": 1, "name": "Beta", "status": "active",
       "lng": 16.4, "lat": 48.22, "notes": null, "sources": [], "photos": []}]}')$$,
  'P0001', 'sync_spots: duplicate spot id b-2', 'a duplicate spot id raises');
select throws_ok(
  $$select public.sync_spots('{"cities": ["vienna"], "spots": [
      {"id": "x-1", "city": "linz", "sort_order": 0, "name": "X", "status": "active",
       "lng": 14.3, "lat": 48.3, "notes": null, "sources": [], "photos": []}]}')$$,
  'P0001', 'sync_spots: spot x-1 names a city outside "cities"', 'a spot outside the cities raises');
select throws_ok(
  $$select public.sync_spots('{"cities": ["vienna"], "spots": [
      {"id": "x-1", "city": "vienna", "sort_order": 0, "name": "X", "status": "active",
       "lng": 16.3, "lat": 48.2, "notes": null, "sources": [], "photos": ["vienna/p.webp"]},
      {"id": "x-2", "city": "vienna", "sort_order": 1, "name": "Y", "status": "active",
       "lng": 16.3, "lat": 48.2, "notes": null, "sources": [], "photos": ["vienna/p.webp"]}]}')$$,
  'P0001', 'sync_spots: duplicate photo key vienna/p.webp', 'a duplicate photo key raises');
select throws_ok(
  $$select public.sync_spots('{"cities": ["vienna"], "spots": [{"id": "x-1", "city": "vienna"}]}')$$,
  'P0001', 'sync_spots: malformed spot x-1', 'a spot missing fields raises');
select throws_ok(
  $$select public.sync_spots('{"spots": []}')$$,
  'P0001', 'sync_spots: the payload needs a "cities" array and a "spots" array',
  'a payload without cities raises');
select throws_ok(
  $$select public.sync_spots('{"cities": ["vienna"], "spots": [
      {"id": "n-1", "city": "vienna", "sort_order": 1, "name": "New", "status": "active",
       "lng": 16.3, "lat": 48.2, "notes": null, "sources": [], "photos": []},
      {"id": "x-1", "city": "vienna", "sort_order": 2, "name": "X", "status": "unclassified",
       "lng": 16.3, "lat": 48.2, "notes": null, "sources": [], "photos": []}]}')$$,
  '22P02', null, 'an unknown status raises');
select is(
  (select array_agg(id) from public.spots), array['b-2'],
  'a failed sync leaves the previous mirror untouched');

select * from finish();
rollback;
