"use client";

import { useTransition } from "react";
import { uploadProjectDocument, deleteProjectDocument } from "@/app/dashboard/actions";

type DocumentRow = {
  id: string;
  filename: string;
  category: string;
  storage_path: string;
  created_at: string;
  url: string | null;
};

const CATEGORY_OPTIONS = [
  { value: "contract", label: "Contract" },
  { value: "drawings", label: "Drawings" },
  { value: "plans", label: "Plans" },
  { value: "rams", label: "RAMS" },
  { value: "certificate", label: "Certificate" },
  { value: "insurance", label: "Insurance" },
  { value: "purchase_order", label: "Purchase order" },
  { value: "other", label: "Other" },
];

const CATEGORY_LABEL = Object.fromEntries(CATEGORY_OPTIONS.map((c) => [c.value, c.label]));

const field =
  "mt-1 w-full rounded-lg border border-black/15 bg-surface px-2.5 py-2 text-base text-ink outline-none focus:border-brand sm:text-sm";
const label = "text-xs font-semibold text-ink-2";

function DocumentRowItem({ doc, projectId }: { doc: DocumentRow; projectId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-between gap-3 border-b border-black/8 py-2.5 last:border-none">
      <div className="min-w-0">
        {doc.url ? (
          <a href={doc.url} target="_blank" rel="noreferrer" className="truncate text-sm font-semibold text-brand hover:underline">
            {doc.filename}
          </a>
        ) : (
          <p className="truncate text-sm font-semibold text-ink">{doc.filename}</p>
        )}
        <p className="text-xs text-muted">
          {CATEGORY_LABEL[doc.category] ?? "Other"} &middot;{" "}
          {new Date(doc.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        </p>
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!confirm(`Delete ${doc.filename}?`)) return;
          startTransition(() => deleteProjectDocument(projectId, doc.id, doc.storage_path));
        }}
        className="min-h-[32px] flex-none rounded-lg border border-[rgba(208,59,59,0.3)] bg-[rgba(208,59,59,0.08)] px-2.5 py-1.5 text-xs font-semibold text-critical hover:bg-[rgba(208,59,59,0.15)]"
      >
        Delete
      </button>
    </div>
  );
}

export function DocumentsPanel({
  tenantId,
  projectId,
  documents,
}: {
  tenantId: string;
  projectId: string;
  documents: DocumentRow[];
}) {
  return (
    <div className="rounded-2xl border border-black/8 bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-bold text-ink">Documents</h2>
      <p className="text-xs text-muted">Contracts, drawings, RAMS, certificates, insurance, purchase orders.</p>

      <form action={uploadProjectDocument} className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-black/8 bg-surface-2 p-3 sm:grid-cols-3 sm:items-end">
        <input type="hidden" name="tenantId" value={tenantId} />
        <input type="hidden" name="projectId" value={projectId} />
        <label className={label}>
          Category
          <select name="category" defaultValue="other" className={field}>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className={`${label} sm:col-span-2`}>
          File
          <input name="document" type="file" required className={field} />
        </label>
        <button
          type="submit"
          className="btn-primary rounded-lg bg-brand px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-strong sm:col-span-3 sm:w-auto sm:justify-self-start sm:py-1.5"
        >
          Upload
        </button>
      </form>

      <div className="mt-4 flex flex-col">
        {documents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/15 py-8 text-center">
            <p className="text-sm font-semibold text-ink">No documents yet</p>
            <p className="mt-1 px-2 text-sm text-muted">Upload one above.</p>
          </div>
        ) : (
          documents.map((doc) => <DocumentRowItem key={doc.id} doc={doc} projectId={projectId} />)
        )}
      </div>
    </div>
  );
}
