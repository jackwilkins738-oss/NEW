"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createTenant, inviteTeammate, updateTenantDomain } from "@/app/admin/actions";

type Tenant = {
  id: string;
  business_name: string;
  slug: string;
  domain: string | null;
  site_key: string;
  created_at: string;
};

const field =
  "mt-1 w-full rounded-md border border-black/15 bg-surface px-2.5 py-2 text-base text-ink outline-none focus:border-brand sm:text-sm";
const label = "text-xs font-semibold text-ink-2";

function CreateTenantForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ error?: string; tenant?: Tenant } | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const formData = new FormData(e.currentTarget);
    const res = await createTenant(formData);
    setResult(res);
    setPending(false);
    if (res.tenant) {
      e.currentTarget.reset();
      router.refresh();
    }
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-bold text-ink">Add a new customer</h2>
      <form onSubmit={handleSubmit} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className={label}>
          Business name
          <input name="businessName" required className={field} placeholder="Elmswood Lofts & Extensions" />
        </label>
        <label className={label}>
          Slug
          <input name="slug" required className={field} placeholder="elmswood" />
        </label>
        <label className={label}>
          Domain (once DNS is set up)
          <input name="domain" className={field} placeholder="dashboard.elmswoodlofts.co.uk" />
        </label>
        <div className="sm:col-span-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-strong disabled:opacity-60"
          >
            {pending ? "Creating…" : "Create customer"}
          </button>
        </div>
      </form>

      {result?.error && <p className="mt-3 text-sm font-semibold text-critical">{result.error}</p>}
      {result?.tenant && (
        <div className="mt-3 rounded-lg border border-[rgba(12,163,12,0.3)] bg-[rgba(12,163,12,0.08)] p-3 text-sm">
          <p className="font-semibold text-good">
            {result.tenant.business_name} created. Site key: <span className="font-mono">{result.tenant.site_key}</span>
          </p>
          <p className="mt-1 text-xs text-ink-2">
            Next: point their DNS at this app, add the domain in Vercel, then embed{" "}
            <code className="rounded bg-surface-2 px-1">/track.js</code> with{" "}
            <code className="rounded bg-surface-2 px-1">data-tenant=&quot;{result.tenant.id}&quot;</code> and{" "}
            <code className="rounded bg-surface-2 px-1">data-site-key=&quot;{result.tenant.site_key}&quot;</code> on their site,
            then invite yourself or them below.
          </p>
        </div>
      )}
    </div>
  );
}

function InviteForm({ tenants }: { tenants: Tenant[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ error?: string; link?: string; email?: string } | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const formData = new FormData(e.currentTarget);
    const res = await inviteTeammate(formData);
    setResult(res);
    setPending(false);
    if (res.link) router.refresh();
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-bold text-ink">Invite a login</h2>
      <p className="text-xs text-muted">Generates a one-time link - copy it and send it yourself (email, text, WhatsApp).</p>
      <form onSubmit={handleSubmit} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className={label}>
          Business
          <select name="tenantId" required className={field} disabled={tenants.length === 0}>
            <option value="">Choose…</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.business_name}
              </option>
            ))}
          </select>
        </label>
        <label className={`${label} sm:col-span-2`}>
          Email
          <input name="email" type="email" required className={field} placeholder="owner@theirbusiness.co.uk" />
        </label>
        <div className="sm:col-span-3">
          <button
            type="submit"
            disabled={pending || tenants.length === 0}
            className="rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-strong disabled:opacity-60"
          >
            {pending ? "Generating…" : "Generate invite link"}
          </button>
        </div>
      </form>

      {result?.error && <p className="mt-3 text-sm font-semibold text-critical">{result.error}</p>}
      {result?.link && (
        <div className="mt-3 rounded-lg border border-[rgba(12,163,12,0.3)] bg-[rgba(12,163,12,0.08)] p-3 text-sm">
          <p className="font-semibold text-good">Link ready for {result.email}:</p>
          <p className="mt-1 break-all font-mono text-xs text-ink-2">{result.link}</p>
          <p className="mt-1 text-xs text-muted">One-time use - send it to them directly. It signs them in and lets them set their own password.</p>
        </div>
      )}
    </div>
  );
}

function DomainEditor({ tenant }: { tenant: Tenant }) {
  const router = useRouter();
  const [domain, setDomain] = useState(tenant.domain ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    const formData = new FormData();
    formData.set("tenantId", tenant.id);
    formData.set("domain", domain);
    const res = await updateTenantDomain(formData);
    setPending(false);
    if (res.error) {
      setError(res.error);
    } else {
      setSaved(true);
      router.refresh();
    }
  }

  const changed = domain !== (tenant.domain ?? "");

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-wrap items-center gap-2">
      <input
        value={domain}
        onChange={(e) => {
          setDomain(e.target.value);
          setSaved(false);
        }}
        placeholder="dashboard.theirdomain.co.uk"
        className="w-full max-w-[260px] rounded-md border border-black/15 bg-page px-2 py-1.5 font-mono text-xs text-ink outline-none focus:border-brand"
      />
      <button
        type="submit"
        disabled={pending || !changed}
        className="rounded-md border border-black/10 bg-surface-2 px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:bg-brand-tint disabled:cursor-default disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {saved && !changed && <span className="text-xs font-semibold text-good">Saved</span>}
      {error && <span className="text-xs font-semibold text-critical">{error}</span>}
    </form>
  );
}

function TenantList({ tenants }: { tenants: Tenant[] }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-bold text-ink">Customers ({tenants.length})</h2>
      <div className="mt-3 flex flex-col gap-4">
        {tenants.length === 0 && <p className="text-sm text-muted">No customers yet.</p>}
        {tenants.map((t) => (
          <div key={t.id} className="border-b border-black/10 pb-4 text-sm last:border-none last:pb-0">
            <p className="font-semibold text-ink">{t.business_name}</p>
            <p className="text-xs text-muted">
              slug: <span className="font-mono">{t.slug}</span>
            </p>
            <p className="mt-0.5 text-xs text-muted">
              id: <span className="font-mono">{t.id}</span>
            </p>
            <p className="mt-2 text-xs font-semibold text-ink-2">Domain</p>
            <DomainEditor tenant={t} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminPanel({ tenants }: { tenants: Tenant[] }) {
  return (
    <div className="flex flex-col gap-5">
      <CreateTenantForm />
      <InviteForm tenants={tenants} />
      <TenantList tenants={tenants} />
    </div>
  );
}
