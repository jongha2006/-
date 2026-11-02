begin;
alter table public.tm_items drop constraint tm_items_kind_check;
alter table public.tm_items add constraint tm_items_kind_check check(kind in ('task','resource','slide','feedback','topic'));
alter table public.tm_items add column asset_type text not null default '자료' check(asset_type in ('자료','대본','PPT','발표 · 대본','기타'));
alter table public.tm_items add column thumbnail_path text check(thumbnail_path is null or (length(thumbnail_path)<500 and thumbnail_path like project_id::text||'/%'));
update public.tm_items set asset_type='발표 · 대본' where kind='slide';
commit;
