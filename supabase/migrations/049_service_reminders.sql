-- Service reminders (lib/serviceReminders.ts): "remind this customer in 12
-- months about their boiler service". On the due date the customer is emailed
-- to book in; a repeating reminder books its own next one. Set per job, so
-- nothing is sent that the business didn't ask for.
create table if not exists service_reminders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  due_on date not null,
  repeat_months int check (repeat_months is null or repeat_months between 1 and 120),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists service_reminders_due_idx on service_reminders(due_on) where sent_at is null;
create index if not exists service_reminders_project_idx on service_reminders(project_id);

alter table service_reminders enable row level security;

drop policy if exists "member can manage own service reminders" on service_reminders;
create policy "member can manage own service reminders" on service_reminders
  for all using (
    exists (select 1 from memberships m where m.tenant_id = service_reminders.tenant_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from memberships m where m.tenant_id = service_reminders.tenant_id and m.user_id = auth.uid())
  );
