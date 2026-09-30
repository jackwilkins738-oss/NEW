// Client onboarding (migration 043): the questions a new website client
// answers once, and the rules their answers and uploads must pass. Pure, so
// the page, the server actions and the service API all share one tested set.
//
// The questions are the ones every build needs and that otherwise take a
// week of emails to collect. Nothing is required: a half-filled form saved
// today beats a perfect one never sent.

export type OnboardingQuestion = {
  id: string;
  label: string;
  hint?: string;
  kind: "text" | "long" | "choice";
  options?: readonly string[];
  max: number;
};

export const ONBOARDING_SECTIONS: { title: string; questions: OnboardingQuestion[] }[] = [
  {
    title: "What you do",
    questions: [
      { id: "services", label: "The services to show on your site", hint: "One per line, with a few words on each if you like, e.g. Flat roofs - GRP and EPDM, 20-year guarantee", kind: "long", max: 1500 },
      { id: "main_service", label: "The job you'd most like more of", kind: "text", max: 200 },
      { id: "areas", label: "Towns and areas you cover", hint: "One per line - only places you genuinely work", kind: "long", max: 1500 },
      { id: "years_trading", label: "How long you've been trading", hint: "e.g. Since 2009", kind: "text", max: 100 },
      { id: "about", label: "Anything customers should know about you", hint: "Family run, how you work, what makes you different", kind: "long", max: 2000 },
    ],
  },
  {
    title: "Why customers can trust you",
    questions: [
      { id: "guarantee", label: "The guarantee you give", hint: "e.g. 10 years on new roofs - leave blank if none", kind: "text", max: 300 },
      { id: "insurance", label: "Public liability insurance", kind: "choice", options: ["Yes", "No", "Not sure"], max: 20 },
      { id: "insurance_amount", label: "Cover amount (if insured)", hint: "e.g. £5 million", kind: "text", max: 100 },
      { id: "memberships", label: "Memberships you currently hold", hint: "e.g. Checkatrade, TrustMark, NFRC - only current ones", kind: "text", max: 500 },
      { id: "reviews_link", label: "Link to your reviews", hint: "Google, Checkatrade, Trustpilot...", kind: "text", max: 500 },
      { id: "review_quotes", label: "3-5 reviews you'd like on your site", hint: "Copy them in, with the customer's first name and town, e.g. \"Brilliant job, tidy and on time\" - Sue, Guildford", kind: "long", max: 3000 },
    ],
  },
  {
    title: "Questions your customers ask",
    questions: [
      { id: "free_quotes", label: "Do you give free quotes?", kind: "choice", options: ["Yes", "No"], max: 20 },
      { id: "lead_time", label: "How soon can you usually visit, and start?", hint: "e.g. Visit within a week, usually start within 3-4 weeks", kind: "text", max: 300 },
      { id: "call_outs", label: "Do you do emergency call-outs? When?", hint: "e.g. Yes, 7 days a week for leaks - or No", kind: "text", max: 300 },
      { id: "planning", label: "Do you handle planning permission and building control?", hint: "Skip if it doesn't apply to your work", kind: "text", max: 300 },
    ],
  },
  {
    title: "How customers reach you",
    questions: [
      { id: "phone", label: "Phone number to show", kind: "text", max: 40 },
      { id: "whatsapp", label: "WhatsApp number (if different)", kind: "text", max: 40 },
      { id: "enquiry_email", label: "Email enquiries should go to", kind: "text", max: 200 },
      { id: "show_address", label: "Address to show on the site", hint: "Leave blank to show only the areas you cover", kind: "text", max: 300 },
      { id: "hours", label: "Opening hours / when you answer the phone", kind: "text", max: 200 },
    ],
  },
  {
    title: "Your current website and email",
    questions: [
      { id: "domain", label: "Your website address, if you have one", hint: "e.g. kerrroofing.co.uk - or the one you'd like", kind: "text", max: 200 },
      { id: "domain_registrar", label: "Where your domain name is registered", hint: "e.g. GoDaddy, 123-reg, IONOS - or 'my old web designer'", kind: "text", max: 200 },
      { id: "domain_login", label: "Do you have the login for it?", kind: "choice", options: ["Yes", "No", "Not sure"], max: 20 },
      { id: "email_host", label: "Where your email is hosted", hint: "e.g. Gmail / Google Workspace, Microsoft 365, with your domain company - so nothing breaks at switch-over", kind: "text", max: 200 },
      { id: "google_profile", label: "Do you have a Google Business Profile?", kind: "choice", options: ["Yes", "No", "Not sure"], max: 20 },
      { id: "anything_else", label: "Anything else we should know", kind: "long", max: 2000 },
    ],
  },
];

const QUESTIONS = new Map(ONBOARDING_SECTIONS.flatMap((s) => s.questions).map((q) => [q.id, q]));

export type OnboardingAnswers = Record<string, string>;

/** Only known questions, trimmed, capped, choices checked. Unknown keys are dropped. */
export function normaliseAnswers(input: unknown): OnboardingAnswers {
  const out: OnboardingAnswers = {};
  if (!input || typeof input !== "object") return out;
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    const q = QUESTIONS.get(key);
    if (!q || typeof raw !== "string") continue;
    const value = (q.kind === "long" ? raw.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n") : raw.replace(/\s+/g, " ")).trim();
    if (!value) continue;
    if (q.kind === "choice" && !q.options?.includes(value)) continue;
    out[key] = value.slice(0, q.max);
  }
  return out;
}

/** How many questions have an answer, for "12 of 20 answered". */
export function answeredCount(answers: OnboardingAnswers): number {
  return Object.keys(answers).filter((k) => QUESTIONS.has(k) && answers[k]).length;
}

export const ONBOARDING_QUESTION_COUNT = QUESTIONS.size;

// ---------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------

export const UPLOAD_KINDS = ["logo", "photo", "other"] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // matches the bucket's own limit (migration 043)
export const MAX_FILES = 60;
export const UPLOAD_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

/** A safe storage name for an upload: letters, digits, dot, dash, underscore - nothing that can climb folders. */
export function safeFilename(name: string, type: string): string {
  const base = name
    .replace(/\.[^.]*$/, "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "file"}.${UPLOAD_TYPES[type] ?? "bin"}`;
}

/** Why this upload is refused, or null. */
export function uploadProblem(file: { name: string; type: string; size: number }, kind: string, existing: number): string | null {
  if (!UPLOAD_KINDS.includes(kind as UploadKind)) return "Unknown upload type.";
  if (!UPLOAD_TYPES[file.type]) return `${file.name}: only photos (JPG, PNG, WebP, HEIC) and PDFs can be uploaded.`;
  if (!(file.size > 0) || file.size > MAX_UPLOAD_BYTES) return `${file.name}: files must be under 15 MB.`;
  if (existing >= MAX_FILES) return `That's the limit of ${MAX_FILES} files - email any more over.`;
  return null;
}
