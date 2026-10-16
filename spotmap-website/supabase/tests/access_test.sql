-- Who may read and write the spot data: the public reads every table and calls city_spots();
-- nothing public writes a table, calls sync_spots() or writes the spot-photos bucket.
begin;
select plan(19);

select is(
  (select public from storage.buckets where id = 'spot-photos'), true,
  'the spot-photos bucket is public');
select is(
  (select allowed_mime_types from storage.buckets where id = 'spot-photos'), array['image/webp'],
  'the spot-photos bucket accepts WebP only');
select is(
  (select file_size_limit from storage.buckets where id = 'spot-photos'), 2097152::bigint,
  'the spot-photos bucket caps a file at 2 MB');
select ok(
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.cities'::regclass, 'public.spots'::regclass, 'public.spot_photos'::regclass)),
  'row-level security is on for every spot table');

insert into public.cities (slug) values ('vienna');
insert into public.spots (id, city, name, status, location, sort_order, notes, sources)
values ('a-1', 'vienna', 'A', 'active', 'SRID=4326;POINT(16.37 48.2)', 0, null, '[]');
insert into public.spot_photos (spot_id, position, object_key) values ('a-1', 0, 'vienna/a-1-00000000.webp');

set local role anon;

select is((select count(*) from public.cities), 1::bigint, 'anon reads cities');
select is((select count(*) from public.spots), 1::bigint, 'anon reads spots');
select is((select count(*) from public.spot_photos), 1::bigint, 'anon reads spot photos');
select lives_ok($$select public.city_spots('vienna')$$, 'anon calls city_spots');

select throws_ok($$insert into public.cities (slug) values ('x')$$, '42501', null, 'anon cannot insert a city');
select throws_ok($$update public.spots set name = 'x'$$, '42501', null, 'anon cannot update a spot');
select throws_ok($$delete from public.spots$$, '42501', null, 'anon cannot delete a spot');
select throws_ok(
  $$insert into public.spot_photos (spot_id, position, object_key) values ('a-1', 1, 'vienna/x.webp')$$,
  '42501', null, 'anon cannot insert a spot photo');
select throws_ok($$delete from public.spot_photos$$, '42501', null, 'anon cannot delete a spot photo');
select throws_ok($$delete from public.cities$$, '42501', null, 'anon cannot delete a city');
select throws_ok(
  $$select public.sync_spots('{"cities": [], "spots": []}')$$,
  '42501', null, 'anon cannot call sync_spots');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('spot-photos', 'thumb/vienna/x.webp')$$,
  '42501', null, 'anon cannot write the spot-photos bucket');

reset role;
set local role authenticated;

select throws_ok($$insert into public.cities (slug) values ('x')$$, '42501', null, 'a signed-in user cannot insert a city');
select throws_ok(
  $$select public.sync_spots('{"cities": [], "spots": []}')$$,
  '42501', null, 'a signed-in user cannot call sync_spots');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('spot-photos', 'thumb/vienna/x.webp')$$,
  '42501', null, 'a signed-in user cannot write the spot-photos bucket');

select * from finish();
rollback;
