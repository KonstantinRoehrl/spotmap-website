-- city_spots(): the snapshot's GeoJSON shape, dataset order, gallery order, full-precision
-- coordinates whatever the session's extra_float_digits, soft-deleted spots left out even for a
-- caller that bypasses row-level security, and a raise for an unknown city. Passes on an empty
-- database and on one already synced with the real spots.
begin;
select plan(10);

-- Start from empty tables whatever the database already holds (a synced local stack has the real
-- spots): the superuser bypasses row-level security, photos go by cascade, and the rollback at
-- the end puts the real rows back.
delete from public.spots;
delete from public.cities;

insert into public.cities (slug) values ('vienna'), ('graz'), ('linz'), ('salzburg');
insert into public.spots (id, city, name, status, location, sort_order, notes, sources) values
  ('b-2', 'vienna', 'Beta', 'demolished', 'SRID=4326;POINT(16.4 48.22)', 1, 'gone', '[]'),
  ('a-1', 'vienna', 'Alpha', 'active', 'SRID=4326;POINT(16.3785491 48.1840844)', 0, null, '[]');
insert into public.spot_photos (spot_id, position, object_key) values
  ('a-1', 1, 'vienna/a-1-22222222.webp'),
  ('a-1', 0, 'vienna/a-1-11111111.webp');
-- Soft-deleted spots: one in vienna after the live ones (with a photo), and salzburg's only spot.
insert into public.spots (id, city, name, status, location, sort_order, notes, sources, deleted_at) values
  ('d-3', 'vienna', 'Deleted', 'active', 'SRID=4326;POINT(16.5 48.3)', 2, null, '[]', '2026-01-01'),
  ('s-1', 'salzburg', 'Gone Too', 'active', 'SRID=4326;POINT(13.04 47.8)', 0, null, '[]', '2026-01-01');
insert into public.spot_photos (spot_id, position, object_key) values ('d-3', 0, 'vienna/d-3-33333333.webp');
-- Coordinates whose shortest float8 text is 16 and 17 significant digits: the only fixture where
-- a ::numeric cast in city_spots would print differently (numeric keeps 15 digits).
insert into public.spots (id, city, name, status, location, sort_order, notes, sources) values
  ('p-1', 'linz', 'Precise', 'active', 'SRID=4326;POINT(16.378549123456789 48.184084412345678)', 0, null, '[]');

set local role anon;

select is(
  public.city_spots('vienna'),
  '{"type": "FeatureCollection", "features": [
     {"type": "Feature",
      "geometry": {"type": "Point", "coordinates": [16.3785491, 48.1840844]},
      "properties": {"id": "a-1", "name": "Alpha", "status": "active", "notes": null,
                     "photos": ["vienna/a-1-11111111.webp", "vienna/a-1-22222222.webp"]}},
     {"type": "Feature",
      "geometry": {"type": "Point", "coordinates": [16.4, 48.22]},
      "properties": {"id": "b-2", "name": "Beta", "status": "demolished", "notes": "gone",
                     "photos": []}}]}'::jsonb,
  'returns the snapshot shape, ordered by sort_order and position');
select is(
  public.city_spots('vienna') #>> '{features,0,geometry,coordinates,0}', '16.3785491',
  'keeps the coordinate''s JSON text');
-- The shortest round-trip text, which is how the snapshot writes doubles, whatever the caller's
-- session setting: the session is deliberately at 0 (the local Supabase stack's default, where
-- to_jsonb cuts float8 to 15 digits), so these two assertions prove city_spots pins its own
-- extra_float_digits, and still fail should a ::numeric cast come back.
set local extra_float_digits = 0;
select is(
  public.city_spots('linz') #>> '{features,0,geometry,coordinates,0}', '16.37854912345679',
  'keeps a 16-digit longitude''s JSON text (a numeric cast would print 16.3785491234568)');
select is(
  public.city_spots('linz') #>> '{features,0,geometry,coordinates,1}', '48.184084412345676',
  'keeps a 17-digit latitude''s JSON text (a numeric cast would print 48.1840844123457)');
reset extra_float_digits;

select ok(
  (public.city_spots('vienna') #> '{features,0,properties}') ? 'notes',
  'emits notes as JSON null rather than dropping the key');
select is(
  public.city_spots('graz'), '{"type": "FeatureCollection", "features": []}'::jsonb,
  'a known city without spots has no features');
select throws_ok($$select public.city_spots('atlantis')$$, 'P0001', 'unknown city: atlantis',
  'an unknown city raises');
select is(
  (select provolatile from pg_proc where oid = 'public.city_spots(text)'::regprocedure), 's',
  'city_spots is stable, so PostgREST serves it over GET');

-- The secret key (service_role) bypasses row-level security, so only city_spots' own deleted_at
-- filter keeps soft-deleted spots out of the snapshot export.
reset role;
set local role service_role;
select is(
  jsonb_path_query_array(public.city_spots('vienna'), '$.features[*].properties.id'), '["a-1", "b-2"]'::jsonb,
  'a soft-deleted spot is left out even for a caller that bypasses row-level security');
select is(
  public.city_spots('salzburg'), '{"type": "FeatureCollection", "features": []}'::jsonb,
  'a city whose only spot is deleted has no features (Task 6''s snapshot export relies on this shape)');

select * from finish();
rollback;
