-- sync_existing_spots() and sync_insert_spots(), run as the secret key's service_role: the sync
-- sees every spot (deleted included), inserts only what is new — missing cities, spots at their
-- city's next sort_order in payload order, photos at 0…n−1 — returns counts, never deletes a city,
-- and raises on an id the database already holds, leaving everything as it was.
-- Passes on an empty database and on one already synced with the real spots.
begin;
select plan(19);

-- Start from empty tables whatever the database already holds; the rollback puts them back.
delete from public.spots;
delete from public.cities;

-- e-1 stands for a spot the maintainer tool renamed; d-1 for one it deleted (highest sort_order).
insert into public.cities (slug) values ('vienna');
insert into public.spots (id, city, name, status, location, sort_order, notes, sources, updated_at, deleted_at) values
  ('e-1', 'vienna', 'Edited Name', 'active', 'SRID=4326;POINT(16.3 48.2)', 0, null, '[]', '2000-01-01', null),
  ('d-1', 'vienna', 'Deleted', 'active', 'SRID=4326;POINT(16.4 48.22)', 3, null, '[]', '2000-01-01', '2026-01-01');
insert into public.spot_photos (spot_id, position, object_key) values ('e-1', 0, 'vienna/e-1-00000001.webp');

set local role service_role;

select is(
  public.sync_existing_spots(),
  '[{"id": "e-1", "city": "vienna", "name": "Edited Name", "lng": 16.3, "lat": 48.2, "deleted": false},
    {"id": "d-1", "city": "vienna", "name": "Deleted", "lng": 16.4, "lat": 48.22, "deleted": true}]'::jsonb,
  'sync_existing_spots lists every spot, deleted included');
select is(
  public.sync_insert_spots('{"cities": ["vienna", "graz"], "spots": [
    {"id": "n-1", "city": "vienna", "name": "New One", "status": "active", "lng": 16.5, "lat": 48.25,
     "notes": null, "sources": [{"map": "vienna"}],
     "photos": ["vienna/n-1-11111111.webp", "vienna/n-1-22222222.webp"]},
    {"id": "n-2", "city": "graz", "name": "New Two", "status": "demolished", "lng": 15.43, "lat": 47.07,
     "notes": "gone", "sources": [{"map": "graz"}], "photos": []},
    {"id": "n-3", "city": "vienna", "name": "New Three", "status": "active", "lng": 16.6, "lat": 48.26,
     "notes": null, "sources": [{"map": "vienna"}], "photos": ["vienna/n-3-33333333.webp"]}]}'),
  '{"cities": {"inserted": 1}, "spots": {"inserted": 3}, "photos": {"inserted": 3}}'::jsonb,
  'a sync inserts the missing city, the new spots and their photos, and counts them');
select is(
  (select array_agg(id || ':' || sort_order order by city collate "C", sort_order) from public.spots),
  array['n-2:0', 'e-1:0', 'd-1:3', 'n-1:4', 'n-3:5'],
  'new spots take their city''s next sort_order in payload order, after the deleted spot''s 3');
select is(
  (select array_agg(object_key order by position) from public.spot_photos where spot_id = 'n-1'),
  array['vienna/n-1-11111111.webp', 'vienna/n-1-22222222.webp'],
  'photos keep the payload order');
select is(
  (select array_agg(position order by position) from public.spot_photos where spot_id = 'n-1'), array[0, 1],
  'at positions 0…n−1');
select is(
  (select jsonb_build_array(name, status, notes, sources,
            extensions.st_x(location::extensions.geometry), extensions.st_y(location::extensions.geometry))
     from public.spots where id = 'n-2'),
  '["New Two", "demolished", "gone", [{"map": "graz"}], 15.43, 47.07]'::jsonb,
  'every field of a new spot is stored');
select is(jsonb_array_length(public.sync_existing_spots()), 5, 'and sync_existing_spots sees the new spots');
select is(
  public.sync_insert_spots('{"cities": ["graz"], "spots": []}'),
  '{"cities": {"inserted": 0}, "spots": {"inserted": 0}, "photos": {"inserted": 0}}'::jsonb,
  'a sync with nothing new inserts nothing');
select is(
  (select array_agg(slug order by slug collate "C") from public.cities), array['graz', 'vienna'],
  'and never deletes a city the payload leaves out');
select throws_ok(
  $$select public.sync_insert_spots('{"cities": ["vienna"], "spots": [
      {"id": "n-4", "city": "vienna", "name": "Four", "status": "active", "lng": 16.7, "lat": 48.27,
       "notes": null, "sources": [], "photos": []},
      {"id": "e-1", "city": "vienna", "name": "Original Name", "status": "active", "lng": 16.3, "lat": 48.2,
       "notes": null, "sources": [], "photos": []}]}')$$,
  'P0001', 'sync_insert_spots: spot e-1 already exists', 'an id the database holds raises');
select is(
  (select jsonb_build_array(
     (select name from public.spots where id = 'e-1'),
     (select updated_at = '2000-01-01' from public.spots where id = 'e-1'),
     (select count(*) from public.spots where id = 'n-4'))),
  '["Edited Name", true, 0]'::jsonb,
  'and leaves the database unchanged: the edited spot keeps its edit and nothing was inserted');
select throws_ok(
  $$select public.sync_insert_spots('{"cities": ["vienna"], "spots": [
      {"id": "d-1", "city": "vienna", "name": "Deleted", "status": "active", "lng": 16.4, "lat": 48.22,
       "notes": null, "sources": [], "photos": []}]}')$$,
  'P0001', 'sync_insert_spots: spot d-1 already exists', 'a deleted spot is never resurrected');
select is(
  (select deleted_at from public.spots where id = 'd-1'), '2026-01-01'::timestamptz, 'it stays deleted');
select throws_ok(
  $$select public.sync_insert_spots('{"cities": ["vienna"], "spots": [
      {"id": "x-1", "city": "vienna", "name": "X", "status": "active", "lng": 16.3, "lat": 48.2,
       "notes": null, "sources": [], "photos": ["vienna/e-1-00000001.webp"]}]}')$$,
  'P0001', 'sync_insert_spots: photo key vienna/e-1-00000001.webp already belongs to spot e-1',
  'a photo key the database holds raises');
select throws_ok(
  $$select public.sync_insert_spots('{"spots": []}')$$,
  'P0001', 'sync_insert_spots: the payload needs a "cities" array and a "spots" array', 'a payload without cities raises');
select throws_ok(
  $$select public.sync_insert_spots('{"cities": ["vienna"], "spots": [{"id": "x-1", "city": "vienna"}]}')$$,
  'P0001', 'sync_insert_spots: malformed spot x-1', 'a spot missing fields raises');
select throws_ok(
  $$select public.sync_insert_spots('{"cities": ["vienna"], "spots": [
      {"id": "x-1", "city": "vienna", "name": "X", "status": "active", "lng": 16.3, "lat": 48.2,
       "notes": null, "sources": [], "photos": []},
      {"id": "x-1", "city": "vienna", "name": "Y", "status": "active", "lng": 16.3, "lat": 48.2,
       "notes": null, "sources": [], "photos": []}]}')$$,
  'P0001', 'sync_insert_spots: duplicate spot id x-1', 'a duplicate spot id raises');
select throws_ok(
  $$select public.sync_insert_spots('{"cities": ["vienna"], "spots": [
      {"id": "x-1", "city": "linz", "name": "X", "status": "active", "lng": 14.3, "lat": 48.3,
       "notes": null, "sources": [], "photos": []}]}')$$,
  'P0001', 'sync_insert_spots: spot x-1 names a city outside "cities"', 'a spot outside the cities raises');
select throws_ok(
  $$select public.sync_insert_spots('{"cities": ["vienna"], "spots": [
      {"id": "x-1", "city": "vienna", "name": "X", "status": "unclassified", "lng": 16.3, "lat": 48.2,
       "notes": null, "sources": [], "photos": []}]}')$$,
  '22P02', null, 'an unknown status raises');

select * from finish();
rollback;
