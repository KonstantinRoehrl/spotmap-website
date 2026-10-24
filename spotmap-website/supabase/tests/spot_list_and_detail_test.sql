-- city_spot_list() and spot_detail(): the map page's light list shape and one spot's full
-- record. The list carries each spot's cover (its first photo by position, JSON null without
-- photos) and photo count instead of its notes and photo list, in dataset order; the detail
-- carries the city that resolves a cold /spot/<id> link. Both keep the snapshot's full-precision
-- coordinates whatever the session's extra_float_digits, both leave soft-deleted spots out even
-- for a caller that bypasses row-level security, and the detail answers SQL null — never an
-- error — for an id that is unknown or deleted. Passes on an empty database and on one already
-- synced with the real spots.
begin;
select plan(16);

-- Start from empty tables whatever the database already holds (a synced local stack has the real
-- spots): the superuser bypasses row-level security, photos go by cascade, and the rollback at
-- the end puts the real rows back.
delete from public.spots;
delete from public.cities;

insert into public.cities (slug) values ('vienna'), ('graz'), ('linz');
-- Beta is inserted first but sorts second: the list follows sort_order, not insertion.
insert into public.spots (id, city, name, status, location, sort_order, notes, sources) values
  ('b-2', 'vienna', 'Beta', 'demolished', 'SRID=4326;POINT(16.4 48.22)', 1, 'gone', '[]'),
  ('a-1', 'vienna', 'Alpha', 'active', 'SRID=4326;POINT(16.3785491 48.1840844)', 0, null, '[]');
-- Alpha's second photo is inserted first: the cover and the gallery follow position.
insert into public.spot_photos (spot_id, position, object_key) values
  ('a-1', 1, 'vienna/a-1-22222222.webp'),
  ('a-1', 0, 'vienna/a-1-11111111.webp');
-- A soft-deleted spot after the live ones, with a photo.
insert into public.spots (id, city, name, status, location, sort_order, notes, sources, deleted_at) values
  ('d-3', 'vienna', 'Deleted', 'active', 'SRID=4326;POINT(16.5 48.3)', 2, null, '[]', '2026-01-01');
insert into public.spot_photos (spot_id, position, object_key) values ('d-3', 0, 'vienna/d-3-33333333.webp');
-- Coordinates whose shortest float8 text is 16 and 17 significant digits.
insert into public.spots (id, city, name, status, location, sort_order, notes, sources) values
  ('p-1', 'linz', 'Precise', 'active', 'SRID=4326;POINT(16.378549123456789 48.184084412345678)', 0, null, '[]');

set local role anon;

select is(
  public.city_spot_list('vienna'),
  '{"type": "FeatureCollection", "features": [
     {"type": "Feature",
      "geometry": {"type": "Point", "coordinates": [16.3785491, 48.1840844]},
      "properties": {"id": "a-1", "name": "Alpha", "status": "active",
                     "cover": "vienna/a-1-11111111.webp", "photoCount": 2}},
     {"type": "Feature",
      "geometry": {"type": "Point", "coordinates": [16.4, 48.22]},
      "properties": {"id": "b-2", "name": "Beta", "status": "demolished",
                     "cover": null, "photoCount": 0}}]}'::jsonb,
  'the list shape: cover is the first photo by position, photoCount counts them, sort_order orders');
select ok(
  (public.city_spot_list('vienna') #> '{features,1,properties}') ? 'cover',
  'a spot without photos emits cover as JSON null rather than dropping the key');

-- The session is deliberately at 0 (the local stack's default, where to_jsonb cuts float8 to 15
-- digits), so these prove both functions pin their own extra_float_digits.
set local extra_float_digits = 0;
select is(
  public.city_spot_list('linz') #>> '{features,0,geometry,coordinates,0}', '16.37854912345679',
  'the list keeps a 16-digit longitude''s JSON text');
select is(
  public.spot_detail('p-1') #>> '{coordinates,1}', '48.184084412345676',
  'the detail keeps a 17-digit latitude''s JSON text');
reset extra_float_digits;

select is(
  public.city_spot_list('graz'), '{"type": "FeatureCollection", "features": []}'::jsonb,
  'a known city without spots has no features');
select throws_ok($$select public.city_spot_list('atlantis')$$, 'P0001', 'unknown city: atlantis',
  'an unknown city raises, as city_spots() does');
select is(
  (select provolatile from pg_proc where oid = 'public.city_spot_list(text)'::regprocedure), 's',
  'city_spot_list is stable, so PostgREST serves it over GET');

select is(
  public.spot_detail('a-1'),
  '{"id": "a-1", "city": "vienna", "name": "Alpha", "status": "active", "notes": null,
    "photos": ["vienna/a-1-11111111.webp", "vienna/a-1-22222222.webp"],
    "coordinates": [16.3785491, 48.1840844]}'::jsonb,
  'the detail shape: the city, the notes and every photo in position order');
select is(
  public.spot_detail('b-2'),
  '{"id": "b-2", "city": "vienna", "name": "Beta", "status": "demolished", "notes": "gone",
    "photos": [], "coordinates": [16.4, 48.22]}'::jsonb,
  'a spot without photos has an empty photo list and keeps its notes');
select is(public.spot_detail('no-such-spot'), null::jsonb, 'an unknown id answers SQL null');
select is(public.spot_detail('d-3'), null::jsonb, 'a soft-deleted id answers SQL null');
select is(
  (select provolatile from pg_proc where oid = 'public.spot_detail(text)'::regprocedure), 's',
  'spot_detail is stable, so PostgREST serves it over GET');
select lives_ok($$select public.city_spot_list('vienna')$$, 'anon calls city_spot_list');
select lives_ok($$select public.spot_detail('a-1')$$, 'anon calls spot_detail');

-- The secret key (service_role) bypasses row-level security, so only the functions' own
-- deleted_at filters keep soft-deleted spots out.
reset role;
set local role service_role;
select is(
  jsonb_path_query_array(public.city_spot_list('vienna'), '$.features[*].properties.id'), '["a-1", "b-2"]'::jsonb,
  'a soft-deleted spot is left out of the list even for a caller that bypasses row-level security');
select is(
  public.spot_detail('d-3'), null::jsonb,
  'a soft-deleted spot has no detail even for a caller that bypasses row-level security');

select * from finish();
rollback;
