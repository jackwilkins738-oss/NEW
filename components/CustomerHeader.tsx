"use client";

import { useState } from "react";
import { updateCustomer } from "@/app/dashboard/actions";
import { IconUsers } from "@/components/DashboardIcons";

type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
};

const field =
  "mt-1 w-full rounded-md border border-black/15 bg-surface px-2.5 py-2 text-base text-ink outline-none focus:border-brand sm:text-sm";
const label = "text-xs font-semibold text-ink-2";

export function CustomerHeader({ customer }: { customer: Customer }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <header className="mt-3 rounded-2xl border border-black/10 bg-surface px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-display text-xl font-extrabold text-ink sm:text-2xl">
              <IconUsers className="h-5 w-5 text-brand" />
              {customer.name}
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
              {customer.email && (
                <a href={`mailto:${customer.email}`} className="hover:text-brand hover:underline">
                  {customer.email}
                </a>
              )}
              {customer.phone && (
                <a href={`tel:${customer.phone}`} className="hover:text-brand hover:underline">
                  {customer.phone}
                </a>
              )}
              {customer.address && <span>{customer.address}</span>}
            </div>
            {customer.notes && <p className="mt-2 text-sm text-muted">{customer.notes}</p>}
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex-none rounded-md border border-black/10 bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface"
          >
            Edit
          </button>
        </div>
      </header>
    );
  }

  return (
    <form
      action={async (formData) => {
        await updateCustomer(customer.id, formData);
        setEditing(false);
      }}
      className="mt-3 grid grid-cols-1 gap-3 rounded-2xl border border-black/10 bg-surface p-5 shadow-sm sm:grid-cols-2"
    >
      <label className={label}>
        Name
        <input name="name" defaultValue={customer.name} required className={field} />
      </label>
      <label className={label}>
        Email
        <input name="email" type="email" defaultValue={customer.email ?? ""} className={field} />
      </label>
      <label className={label}>
        Phone
        <input name="phone" defaultValue={customer.phone ?? ""} className={field} />
      </label>
      <label className={label}>
        Address
        <input name="address" defaultValue={customer.address ?? ""} className={field} />
      </label>
      <label className={`${label} sm:col-span-2`}>
        Notes
        <textarea name="notes" rows={2} defaultValue={customer.notes ?? ""} className={field} />
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className="btn-primary rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-strong">
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-md border border-black/10 bg-surface-2 px-4 py-2.5 text-sm font-semibold text-ink-2"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
