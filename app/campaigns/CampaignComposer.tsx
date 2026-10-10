"use client";

import { useState, useTransition } from "react";
import { draftCampaign, sendCampaign, sendCampaignTest } from "@/app/campaigns/actions";

const field = "w-full rounded-lg border border-black/15 bg-surface px-3 py-2 text-sm text-ink";

export function CampaignComposer({ ideas, audience }: { ideas: string[]; audience: number | null }) {
  const [idea, setIdea] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [tested, setTested] = useState(false);
  const [pending, start] = useTransition();
  const ready = subject.trim() && body.trim().length >= 20;

  return (
    <div className="grid gap-4">
      <div>
        <label className="text-xs font-semibold text-muted">
          What&apos;s it about? Add an offer or date only if it&apos;s real.
          <input value={idea} onChange={(e) => setIdea(e.target.value)} maxLength={400} className={`mt-1 ${field}`} placeholder="e.g. Gutter clears before winter, booking now for November" />
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {ideas.map((i) => (
            <button key={i} type="button" onClick={() => setIdea(i)} className="rounded-full border border-black/10 bg-surface-2 px-3 py-1 text-xs text-ink-2">
              {i}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={pending || idea.trim().length < 4}
          onClick={() =>
            start(async () => {
              const r = await draftCampaign(idea);
              if ("error" in r) setMsg({ text: r.error, bad: true });
              else {
                setSubject(r.subject);
                setBody(r.body);
                setTested(false);
                setMsg(null);
              }
            })
          }
          className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Writing..." : "Write it for me"}
        </button>
      </div>
      <label className="text-xs font-semibold text-muted">
        Subject
        <input value={subject} onChange={(e) => { setSubject(e.target.value); setTested(false); }} maxLength={120} className={`mt-1 ${field}`} />
      </label>
      <label className="text-xs font-semibold text-muted">
        The email (&ldquo;Hi [their first name],&rdquo; and your business name are added for you)
        <textarea value={body} onChange={(e) => { setBody(e.target.value); setTested(false); }} rows={8} maxLength={4000} className={`mt-1 ${field}`} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !ready}
          onClick={() =>
            start(async () => {
              const r = await sendCampaignTest({ subject, body });
              if ("error" in r) setMsg({ text: r.error, bad: true });
              else {
                setTested(true);
                setMsg({ text: `Test sent to ${r.to} - check how it looks.` });
              }
            })
          }
          className="rounded-lg border border-black/10 bg-surface-2 px-4 py-2 text-sm font-semibold text-ink-2 disabled:opacity-50"
        >
          Send a test to me
        </button>
        <button
          type="button"
          disabled={pending || !ready || !tested || !audience}
          onClick={() => {
            if (!window.confirm(`Send "${subject}" to ${audience} past customer(s) now?`)) return;
            start(async () => {
              const r = await sendCampaign({ subject, body });
              if ("error" in r) setMsg({ text: r.error, bad: true });
              else {
                setMsg({ text: `Sent to ${r.sent} past customer(s). Replies come to your email.` });
                setSubject("");
                setBody("");
                setIdea("");
                setTested(false);
              }
            });
          }}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Send to {audience ?? 0} past customer{audience === 1 ? "" : "s"}
        </button>
        {!tested && ready && <span className="text-xs text-muted">Send yourself a test first.</span>}
      </div>
      {msg && <p className={`text-sm font-semibold ${msg.bad ? "text-critical" : "text-good"}`}>{msg.text}</p>}
    </div>
  );
}
