// Template Library categories — shared between the library list, its filter,
// and the editor's category picker so the set and its colors can't drift.

export type TemplateCategory =
  | "client_recruiting"
  | "candidate_recruiting"
  | "follow_up"
  | "candidate_presentation"
  | "job_opportunity"
  | "general";

export const TEMPLATE_CATEGORIES: { value: TemplateCategory; label: string; color: string; bg: string }[] = [
  { value: "client_recruiting", label: "Client Recruiting", color: "#7dd3fc", bg: "rgba(2,132,199,0.15)" },
  { value: "candidate_recruiting", label: "Candidate Recruiting", color: "#4ade80", bg: "rgba(22,163,74,0.15)" },
  { value: "follow_up", label: "Follow-Up", color: "#fbbf24", bg: "rgba(217,119,6,0.15)" },
  { value: "candidate_presentation", label: "Candidate Presentation", color: "#c4b5fd", bg: "rgba(124,58,237,0.15)" },
  { value: "job_opportunity", label: "Job Opportunity", color: "#f87171", bg: "rgba(230,57,70,0.12)" },
  { value: "general", label: "General", color: "rgba(255,255,255,0.55)", bg: "rgba(255,255,255,0.07)" },
];

export function categoryMeta(value: string | null | undefined) {
  return TEMPLATE_CATEGORIES.find((c) => c.value === value) ?? TEMPLATE_CATEGORIES[TEMPLATE_CATEGORIES.length - 1];
}
