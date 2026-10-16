-- Who may read and write the spot data: the public reads every table and calls city_spots();
-- nothing public writes a table, calls sync_spots() or writes the spot-photos bucket. Passes on
-- an empty database and on one already synced with the real spots.
begin;
select plan(20);

-- Start from empty tables whatever the database already holds (a synced local stack has the real
-- spots): the superuser bypasses row-level security, photos go by cascade, and the rollback at
-- the end puts the real rows back.
delete from public.spots;
delete from public.cities;

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
select is(
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and roles && array['anon', 'authenticated', 'public']::name[]
      -- A write policy reaches the bucket when it names it or names no bucket at all.
      and ((coalesce(qual, '') || coalesce(with_check, '')) like '%spot-photos%'
           or (coalesce(qual, '') || coalesce(with_check, '')) not like '%bucket_id%')),
  0::bigint,
  'no public write policy on storage.objects reaches the spot-photos bucket (covers update and delete, which a denied role sees only as zero rows)');

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
