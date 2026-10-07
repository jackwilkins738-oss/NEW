-- 042 capped a prospect's teardown at 8 KB. Since then it carries a 3-frame loading filmstrip and a
-- screenshot (052), their logo and photos (051) and their Google rating and local rivals (060) - a
-- slow site's teardown is well over 8 KB, so the import was rejected and the whole batch with it
-- ("violates check constraint prospects_teardown_check"). The app keeps every teardown under 100 KB
-- (lib/prospects.ts, TEARDOWN_MAX_CHARS); this allows 128 KB.
alter table prospects drop constraint if exists prospects_teardown_check;
alter table prospects add constraint prospects_teardown_check
  check (teardown is null or (jsonb_typeof(teardown) = 'object' and pg_column_size(teardown) < 131072));
