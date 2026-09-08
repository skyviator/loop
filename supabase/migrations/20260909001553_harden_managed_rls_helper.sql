-- New Supabase projects may install this event-trigger helper when automatic RLS
-- enforcement is enabled. It is never an application RPC, so remove inherited
-- API-role execution without interfering with the event trigger owned by postgres.
do $migration$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$migration$;
