-- city_spots(): the snapshot's GeoJSON shape, dataset order, gallery order, and a raise for an
-- unknown city.
begin;
select plan(6);

insert into public.cities (slug) values ('vienna'), ('graz');
insert into public.spots (id, city, name, status, location, sort_order, notes, sources) values
  ('b-2', 'vienna', 'Beta', 'demolished', 'SRID=4326;POINT(16.4 48.22)', 1, 'gone', '[]'),
  ('a-1', 'vienna', 'Alpha', 'active', 'SRID=4326;POINT(16.3785491 48.1840844)', 0, null, '[]');
insert into public.spot_photos (spot_id, position, object_key) values
  ('a-1', 1, 'vienna/a-1-22222222.webp'),
  ('a-1', 0, 'vienna/a-1-11111111.webp');

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
