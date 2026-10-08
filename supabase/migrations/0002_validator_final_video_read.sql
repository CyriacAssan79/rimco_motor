-- Validators preview the composed file once it is ready for review.
drop policy if exists rimco_storage_read on storage.objects;
create policy rimco_storage_read on storage.objects for select to authenticated using(
  public.is_admin() or
  (bucket_id='brand' and (storage.foldername(name))[1]=auth.uid()::text) or
  (bucket_id='brand' and exists(select 1 from public.assets a join public.profiles p on p.id=auth.uid() and p.brand_id=a.brand_id and p.is_active where a.path=name and a.kind='logo' and a.status='validée')) or
  (bucket_id in ('assets','audio') and (storage.foldername(name))[1]=auth.uid()::text) or
  (bucket_id='assets' and exists(select 1 from public.assets a where a.path=name and a.status='validée')) or
  (bucket_id='audio' and exists(select 1 from public.assets a where a.path=name and a.kind='audio' and a.status='validée')) or
  (bucket_id='videos' and exists(select 1 from public.videos v join public.video_versions vv on vv.video_id=v.id where v.user_id=auth.uid() and v.status='approved' and vv.final_path=name)) or
  (bucket_id='videos' and exists(select 1 from public.profiles p join public.videos v on v.brand_id=p.brand_id and v.department=p.department and v.status='review' join public.video_versions vv on vv.video_id=v.id where p.id=auth.uid() and p.role='valideur' and p.is_active and vv.final_path=name))
);
