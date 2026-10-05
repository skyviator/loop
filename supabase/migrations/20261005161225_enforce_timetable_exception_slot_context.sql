-- Timetable exceptions that reference a recurring slot must use the same
-- school and classroom as that slot. Abort rather than accepting or rewriting
-- any legacy mismatch.
do $$
begin
  if exists (
    select 1
    from public.timetable_exceptions exception_row
    join public.timetable_slots slot
      on slot.id = exception_row.timetable_slot_id
    where exception_row.timetable_slot_id is not null
      and (slot.school_id, slot.classroom_id)
        is distinct from (exception_row.school_id, exception_row.classroom_id)
  ) then
    raise exception 'Cannot enforce timetable exception slot context: mismatched rows exist';
  end if;
end;
$$;

alter table public.timetable_slots
  add constraint timetable_slots_id_school_id_classroom_id_key
  unique (id, school_id, classroom_id);

alter table public.timetable_exceptions
  drop constraint timetable_exceptions_timetable_slot_id_school_id_fkey;

alter table public.timetable_exceptions
  add constraint timetable_exceptions_slot_context_fkey
  foreign key (timetable_slot_id, school_id, classroom_id)
  references public.timetable_slots (id, school_id, classroom_id)
  on delete cascade;
