"use client";

import { useState } from "react";
import { updateProject } from "@/app/dashboard/actions";
import { formatGBP } from "@/lib/format";

type Project = {
  id: string;
  ref: string | null;
  client_name: string;
  location: string | null;
  project_type: string | null;
  stage: string | null;
  value_pence: number | null;
  pm: string | null;
  start_date: string | null;
  target_date: string | null;
  next_visit_at: string | null;
  payment_type: string | null;
  notes: string | null;
  status: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  on_track: "On track",
  at_risk: "At risk",
  delayed: "Delayed",
  awaiting_decision: "Awaiting decision",
};

const STATUS_CLASS: Record<string, string> = {
  on_track: "bg-[rgba(12,163,12,0.15)] text-good",
  at_risk: "bg-[rgba(250,178,25,0.25)] text-[#8a5a00]",
  delayed: "bg-[rgba(208,59,59,0.15)] text-critical",
  awaiting_decision: "bg-surface-2 text-ink-2",
};

const PAYMENT_TYPES = ["Fixed price", "Staged payments", "Deposit + balance", "Day rate"];

function localDateInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localTimeInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// text-base (not text-sm) on the inputs: 16px is the threshold below which
// iOS Safari auto-zooms into the field on focus - a 14px input on a phone
// form is a real usability problem there, not just a style nit.
const field =
  "mt-1 w-full rounded-md border border-black/15 bg-surface px-2.5 py-2 text-base text-ink outline-none focus:border-brand sm:text-sm";
const label = "text-xs font-semibold text-ink-2";

function ProjectCard({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-black/10 first:border-none">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-md px-1 py-3 text-left hover:bg-surface-2"
      >
        <div className="min-w-0">
          <div className="font-mono text-xs text-muted">{project.ref}</div>
          <div className="font-semibold text-ink">{project.client_name}</div>
          <div className="text-xs text-muted">
            {project.location}
            {project.stage ? ` · ${project.stage}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-ink">
            {project.value_pence != null ? formatGBP(project.value_pence) : "—"}
          </span>
          <span
            className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${
              STATUS_CLASS[project.status ?? ""] ?? "bg-surface-2 text-ink-2"
            }`}
          >
            {STATUS_LABEL[project.status ?? ""] ?? project.status}
          </span>
          <span className="text-xs text-muted">{open ? "▾" : "▸"}</span>
        </div>
      </button>

      {open && (
        <div className="rounded-xl bg-surface-2/60 p-4">
          <form
            action={async (formData) => {
              await updateProject(project.id, formData);
              setOpen(false);
            }}
            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          >
            <label className={label}>
              Client
              <input name="clientName" defaultValue={project.client_name} required className={field} />
            </label>
            <label className={label}>
              Location
              <input name="location" defaultValue={project.location ?? ""} className={field} />
            </label>
            <label className={label}>
              Project type
              <input name="projectType" defaultValue={project.project_type ?? ""} className={field} />
            </label>

            <label className={label}>
              Stage
              <input name="stage" defaultValue={project.stage ?? ""} className={field} placeholder="e.g. On site - first fix" />
            </label>
            <label className={label}>
              Value (&pound;)
              <input
                name="value"
                type="number"
                min="0"
                step="0.01"
                defaultValue={project.value_pence != null ? project.value_pence / 100 : ""}
                className={field}
              />
            </label>
            <label className={label}>
              Project manager
              <input name="pm" defaultValue={project.pm ?? ""} className={field} />
            </label>

            <label className={label}>
              Start date
              <input name="startDate" type="date" defaultValue={localDateInput(project.start_date)} className={field} />
            </label>
            <label className={label}>
              Target completion
              <input name="targetDate" type="date" defaultValue={localDateInput(project.target_date)} className={field} />
            </label>
            <label className={label}>
              Status
              <select name="status" defaultValue={project.status ?? "on_track"} className={field}>
                {Object.entries(STATUS_LABEL).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </label>

            <label className={label}>
              Next visit &mdash; date
              <input name="nextVisitDate" type="date" defaultValue={localDateInput(project.next_visit_at)} className={field} />
            </label>
            <label className={label}>
              Next visit &mdash; time
              <input name="nextVisitTime" type="time" defaultValue={localTimeInput(project.next_visit_at)} className={field} />
            </label>
            <label className={label}>
              Payment type
              <select name="paymentType" defaultValue={project.payment_type ?? ""} className={field}>
                <option value="">Not set</option>
                {PAYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <label className={`${label} sm:col-span-3`}>
              Project details / notes
              <textarea name="notes" defaultValue={project.notes ?? ""} rows={3} className={field} />
            </label>

            <div className="flex gap-2 sm:col-span-3">
              <button
                type="submit"
                className="flex-1 rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-strong sm:flex-none"
              >
                Save changes
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-md border border-black/10 bg-surface px-4 py-2.5 text-sm font-semibold text-ink-2 sm:flex-none"
              >
                Close
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function ProjectsPanel({ projects }: { projects: Project[] }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-bold text-ink">Active projects</h2>
      <p className="text-xs text-muted">Tap a project to add details or update its status</p>
      <div className="mt-2">
        {projects.length === 0 && <p className="py-6 text-center text-sm text-muted">No projects yet.</p>}
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>
    </div>
  );
}
