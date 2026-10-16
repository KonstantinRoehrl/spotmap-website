-- city_spots(): the snapshot's GeoJSON shape, dataset order, gallery order, and a raise for an
-- unknown city. Passes on an empty database and on one already synced with the real spots.
begin;
select plan(8);

-- Start from empty tables whatever the database already holds (a synced local stack has the real
-- spots): the superuser bypasses row-level security, photos go by cascade, and the rollback at
-- the end puts the real rows back.
delete from public.spots;
delete from public.cities;

insert into public.cities (slug) values ('vienna'), ('graz'), ('linz');
insert into public.spots (id, city, name, status, location, sort_order, notes, sources) values
  ('b-2', 'vienna', 'Beta', 'demolished', 'SRID=4326;POINT(16.4 48.22)', 1, 'gone', '[]'),
  ('a-1', 'vienna', 'Alpha', 'active', 'SRID=4326;POINT(16.3785491 48.1840844)', 0, null, '[]');
insert into public.spot_photos (spot_id, position, object_key) values
  ('a-1', 1, 'vienna/a-1-22222222.webp'),
  ('a-1', 0, 'vienna/a-1-11111111.webp');
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
-- Shortest round-trip text (extra_float_digits 1), which is how the snapshot writes doubles. The
-- local Supabase stack defaults to 0, where a 15-digit cut hides the float8-versus-numeric
-- difference, so the session pins 1 for these two assertions.
set local extra_float_digits = 1;
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

select * from finish();
rollback;
