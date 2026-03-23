"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Layers3,
  LoaderCircle,
  Mail,
  PenSquare,
  RefreshCcw,
  Save,
  Send,
  Sparkles,
} from "lucide-react";

import {
  ApiError,
  generateTemplate,
  getCampaignContext,
  getCompany,
  getGmailStatus,
  getLatestGenerationJob,
  getTemplate,
  regenerateTemplate,
  sendEmail,
  updateCompany,
  updateTemplate,
} from "@/lib/api";
import type {
  CompanyRecord,
  EmailTemplateRecord,
  GenerationJobRecord,
  GenerationStepRecord,
  GmailStatusResponse,
} from "@/lib/types";
import {
  formatMaybeUrl,
  formatTimestamp,
  generationTone,
  jobStatusLabel,
  markdownToHtml,
  statusTone,
} from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  FieldLabel,
  Input,
  ProgressBar,
  Textarea,
  buttonStyles,
} from "@/components/ui";

type ActiveAction =
  | "queueGenerate"
  | "queueRegenerate"
  | "saveOverride"
  | "save"
  | "send"
  | null;

type WorkspaceTab = "overview" | "research" | "draft" | "delivery";

const workspaceTabs: { id: WorkspaceTab; label: string; icon: typeof Layers3 }[] = [
  { id: "overview", label: "Overview", icon: Layers3 },
  { id: "research", label: "Research", icon: Sparkles },
  { id: "draft", label: "Draft", icon: PenSquare },
  { id: "delivery", label: "Delivery", icon: Mail },
];

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}

function TabButton({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: typeof Layers3;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition",
        active
          ? "bg-white text-slate-950"
          : "bg-white/[0.05] text-white/70 hover:bg-white/[0.1] hover:text-white",
      ].join(" ")}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function StepPanel({ step }: { step: GenerationStepRecord }) {
  return (
    <details
      className="rounded-[24px] border border-line bg-white/[0.03] p-4"
      open={step.status === "running"}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
        <div>
          <p className="font-medium text-white">{step.title}</p>
          <p className="mt-1 text-sm leading-6 text-white/55">{step.description}</p>
        </div>
        <Badge tone={generationTone(step.status)}>{step.status}</Badge>
      </summary>

      <div className="mt-4 space-y-4 text-sm text-white/72">
        {step.summary ? (
          <div className="rounded-[20px] border border-line bg-white/[0.03] p-4 leading-7">
            {step.summary}
          </div>
        ) : null}

        {step.details.length > 0 ? (
          <div className="space-y-2">
            {step.details.map((detail) => (
              <div
                key={detail}
                className="rounded-[18px] border border-line bg-white/[0.03] px-3 py-3 leading-6"
              >
                {detail}
              </div>
            ))}
          </div>
        ) : null}

        {step.sources.length > 0 ? (
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-white/45">Sources</p>
            <div className="mt-3 flex flex-col gap-2">
              {step.sources.map((source, index) => {
                const label = source.title ?? source.url ?? `Source ${index + 1}`;
                if (!source.url) {
                  return (
                    <div
                      key={`${label}-${index}`}
                      className="rounded-[18px] border border-line bg-white/[0.03] px-3 py-2 text-sm text-white/70"
                    >
                      {label}
                    </div>
                  );
                }
                return (
                  <a
                    key={`${label}-${index}`}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-[18px] border border-line bg-white/[0.03] px-3 py-2 text-sm text-white/70 transition hover:border-white/20 hover:text-white"
                  >
                    {label}
                  </a>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}

export function CompanyDetailClient({ companyId }: { companyId: string }) {
  const [company, setCompany] = useState<CompanyRecord | null>(null);
  const [template, setTemplate] = useState<EmailTemplateRecord | null>(null);
  const [latestJob, setLatestJob] = useState<GenerationJobRecord | null>(null);
  const [gmailStatus, setGmailStatus] = useState<GmailStatusResponse | null>(null);
  const [globalCampaignContext, setGlobalCampaignContext] = useState("");
  const [companyCampaignOverride, setCompanyCampaignOverride] = useState("");
  const [subject, setSubject] = useState("");
  const [previewLine, setPreviewLine] = useState("");
  const [contentMarkdown, setContentMarkdown] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [initialLoading, setInitialLoading] = useState(true);
  const previousJobStatusRef = useRef<string | null>(null);
  const initializedTabRef = useRef(false);

  const previewHtml = markdownToHtml(contentMarkdown);
  const jobStatus = latestJob?.status ?? company?.generation_status ?? null;
  const jobCurrentStep =
    latestJob?.current_step ?? company?.generation_current_step ?? null;
  const jobProgress =
    latestJob?.progress_percent ?? company?.generation_progress_percent ?? 0;
  const jobIsActive = jobStatus === "queued" || jobStatus === "running";
  const hasUnsavedOverride =
    companyCampaignOverride.trim() !== (company?.campaign_context_override ?? "").trim();
  const effectiveCampaignBrief =
    companyCampaignOverride.trim() || globalCampaignContext.trim();
  const unifiedContext = template?.generated_context?.unified_context;

  function applyTemplate(
    nextTemplate: EmailTemplateRecord,
    defaultRecipient?: string,
    options?: { preserveEditor?: boolean },
  ) {
    const editorIsDirty = template
      ? subject !== template.subject ||
        previewLine !== (template.preview_line ?? "") ||
        contentMarkdown !== template.content_markdown
      : Boolean(subject || previewLine || contentMarkdown);

    if (options?.preserveEditor && editorIsDirty) {
      return;
    }

    setTemplate(nextTemplate);
    setSubject(nextTemplate.subject);
    setPreviewLine(nextTemplate.preview_line ?? "");
    setContentMarkdown(nextTemplate.content_markdown);
    if (defaultRecipient && !recipientEmail) {
      setRecipientEmail(defaultRecipient);
    }
  }

  async function syncPage(options?: { silent?: boolean; preserveInputs?: boolean }) {
    try {
      const [companyPayload, gmailPayload, campaignPayload, jobPayload, templatePayload] =
        await Promise.all([
          getCompany(companyId),
          getGmailStatus().catch(() => ({ configured: false, connected: false })),
          getCampaignContext().catch(() => ({ owner_key: "", brief: "" })),
          getLatestGenerationJob(companyId).catch((err) => {
            if (err instanceof ApiError && err.status === 404) {
              return null;
            }
            throw err;
          }),
          getTemplate(companyId).catch((err) => {
            if (err instanceof ApiError && err.status === 404) {
              return null;
            }
            throw err;
          }),
        ]);

      setCompany(companyPayload);
      setGmailStatus(gmailPayload);
      setGlobalCampaignContext(campaignPayload.brief ?? "");
      setLatestJob(jobPayload);

      if (!options?.preserveInputs || !hasUnsavedOverride) {
        setCompanyCampaignOverride(companyPayload.campaign_context_override ?? "");
      }
      if (!options?.preserveInputs || !recipientEmail) {
        setRecipientEmail(companyPayload.contact_email ?? "");
      }
      if (templatePayload) {
        applyTemplate(templatePayload, companyPayload.contact_email ?? "", {
          preserveEditor: options?.preserveInputs,
        });
      } else if (!options?.preserveInputs) {
        setTemplate(null);
        setSubject("");
        setPreviewLine("");
        setContentMarkdown("");
      }

      setError(null);
    } catch (err) {
      if (!options?.silent) {
        setError(err instanceof ApiError ? err.message : "Could not load company detail.");
      }
    } finally {
      setInitialLoading(false);
    }
  }

  const syncPageEvent = useEffectEvent(
    async (options?: { silent?: boolean; preserveInputs?: boolean }) => {
      await syncPage(options);
    },
  );

  async function runAction(action: Exclude<ActiveAction, null>, fn: () => Promise<void>) {
    setActiveAction(action);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } finally {
      setActiveAction(null);
    }
  }

  async function persistOverrideIfNeeded() {
    if (!hasUnsavedOverride || !company) {
      return company;
    }
    const updated = await updateCompany(company.id, {
      campaign_context_override: companyCampaignOverride.trim() || null,
    });
    setCompany(updated);
    setCompanyCampaignOverride(updated.campaign_context_override ?? "");
    return updated;
  }

  async function handleQueueGenerate(mode: "generate" | "regenerate") {
    if (!company) {
      return;
    }

    await runAction(mode === "generate" ? "queueGenerate" : "queueRegenerate", async () => {
      try {
        const updatedCompany = await persistOverrideIfNeeded();
        const overrideToUse =
          updatedCompany?.campaign_context_override ??
          (companyCampaignOverride.trim() || undefined);
        const job =
          mode === "generate"
            ? await generateTemplate(company.id, overrideToUse)
            : await regenerateTemplate(company.id, overrideToUse);

        setLatestJob(job);
        setActiveTab("research");
        setCompany((currentCompany) =>
          currentCompany
            ? {
                ...currentCompany,
                generation_status: job.status,
                generation_progress_percent: job.progress_percent,
                generation_current_step: job.current_step,
                latest_generation_job_id: job.id,
                generation_error_message: null,
              }
            : currentCompany,
        );
        setNotice(
          mode === "generate"
            ? "Background generation started. You can move to another company and come back later."
            : "Background regeneration started. The current draft stays available while the refresh runs.",
        );
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : mode === "generate"
              ? "Could not start generation."
              : "Could not start regeneration.",
        );
      }
    });
  }

  async function handleSaveOverride() {
    await runAction("saveOverride", async () => {
      try {
        const updated = await updateCompany(companyId, {
          campaign_context_override: companyCampaignOverride.trim() || null,
        });
        setCompany(updated);
        setCompanyCampaignOverride(updated.campaign_context_override ?? "");
        setNotice(
          updated.campaign_context_override
            ? "Company-specific campaign brief saved."
            : "Company override cleared. This company now uses the global brief.",
        );
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Could not save the company override.",
        );
      }
    });
  }

  async function handleSaveTemplate() {
    await runAction("save", async () => {
      try {
        const saved = await updateTemplate(companyId, {
          subject,
          preview_line: previewLine,
          content_markdown: contentMarkdown,
          content_html: markdownToHtml(contentMarkdown),
        });
        applyTemplate(saved, recipientEmail);
        setNotice("Draft saved.");
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not save the draft.");
      }
    });
  }

  async function handleSend() {
    await runAction("send", async () => {
      try {
        const encodedAttachments = await Promise.all(
          attachments.map(async (file) => ({
            filename: file.name,
            content_type: file.type || "application/octet-stream",
            content_base64: await fileToBase64(file),
          })),
        );
        await sendEmail({
          company_id: companyId,
          recipient_email: recipientEmail,
          subject,
          body_markdown: contentMarkdown,
          body_html: markdownToHtml(contentMarkdown),
          attachments: encodedAttachments,
        });
        setNotice("Email sent successfully.");
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Email send failed.");
      }
    });
  }

  useEffect(() => {
    initializedTabRef.current = false;
    void syncPageEvent();
  }, [companyId]);

  useEffect(() => {
    if (!jobIsActive) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void syncPageEvent({ silent: true, preserveInputs: true });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [
    companyId,
    jobIsActive,
    companyCampaignOverride,
    recipientEmail,
    subject,
    previewLine,
    contentMarkdown,
    company?.campaign_context_override,
  ]);

  useEffect(() => {
    const currentStatus = latestJob?.status ?? null;
    const previousStatus = previousJobStatusRef.current;
    if (previousStatus && previousStatus !== currentStatus) {
      if (currentStatus === "completed") {
        setNotice("Background draft is ready.");
        setActiveTab("draft");
        void syncPageEvent({ silent: true, preserveInputs: true });
      }
      if (currentStatus === "failed") {
        setActiveTab("research");
        setError(latestJob?.error_message ?? "Background generation failed.");
      }
    }
    previousJobStatusRef.current = currentStatus;
  }, [latestJob?.status, latestJob?.error_message]);

  useEffect(() => {
    if (initialLoading || initializedTabRef.current) {
      return;
    }
    if (jobIsActive) {
      setActiveTab("research");
    } else if (template) {
      setActiveTab("draft");
    } else {
      setActiveTab("overview");
    }
    initializedTabRef.current = true;
  }, [initialLoading, jobIsActive, template]);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden bg-gradient-to-br from-white/[0.08] via-white/[0.03] to-accentSoft/12">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/" className={buttonStyles("secondary")}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
              {company?.website ? (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonStyles("ghost")}
                >
                  Visit Site
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}
            </div>

            <p className="mt-6 text-xs uppercase tracking-[0.34em] text-accent/80">
              Company Workspace
            </p>
            <h2 className="mt-3 font-display text-4xl leading-tight lg:text-5xl">
              {company?.name ?? "Loading company..."}
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/68">
              Keep profile context, research progress, drafting, and delivery in separate working zones so this page stays easy to move through.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {!template ? (
              <Button
                disabled={activeAction !== null || !company || jobIsActive}
                onClick={() => void handleQueueGenerate("generate")}
              >
                {activeAction === "queueGenerate" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {activeAction === "queueGenerate" ? "Queueing..." : "Generate"}
              </Button>
            ) : (
              <Button
                variant="secondary"
                disabled={activeAction !== null || jobIsActive}
                onClick={() => void handleQueueGenerate("regenerate")}
              >
                {activeAction === "queueRegenerate" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
                {activeAction === "queueRegenerate" ? "Queueing..." : "Regenerate"}
              </Button>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Badge tone={statusTone(company?.status)}>{company?.status ?? "Unknown"}</Badge>
          {company?.tier ? <Badge>{company.tier}</Badge> : null}
          {template ? <Badge tone="success">Draft ready</Badge> : <Badge>No draft yet</Badge>}
          {jobStatus ? (
            <Badge tone={generationTone(jobStatus)}>
              {jobStatusLabel(jobStatus, jobCurrentStep)}
            </Badge>
          ) : null}
        </div>

        {jobStatus ? (
          <div className="mt-6 rounded-[28px] border border-line bg-white/[0.03] p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm text-white/55">Latest run</p>
                <p className="mt-2 text-lg font-medium text-white">
                  {jobStatusLabel(jobStatus, jobCurrentStep)}
                </p>
              </div>
              <p className="text-sm text-white/45">{jobProgress}% complete</p>
            </div>
            <ProgressBar className="mt-4" value={jobProgress} />
          </div>
        ) : null}
      </Card>

      {error ? (
        <Card className="border-danger/30 bg-danger/10 text-sm text-danger">{error}</Card>
      ) : null}
      {notice ? (
        <Card className="border-success/30 bg-success/10 text-sm text-success">{notice}</Card>
      ) : null}
      {initialLoading ? (
        <Card className="flex items-center gap-3 text-sm text-white/70">
          <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
          Loading company profile, draft, and background job state...
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-6 xl:sticky xl:top-[104px] xl:self-start">
          <Card>
            <p className="text-xs uppercase tracking-[0.28em] text-white/45">Snapshot</p>
            <div className="mt-5 space-y-5 text-sm">
              <div>
                <p className="text-white/45">Industry</p>
                <p className="mt-1 text-white/80">{company?.industry ?? "Not specified"}</p>
              </div>
              <div>
                <p className="text-white/45">Website</p>
                <p className="mt-1 text-white/80">{formatMaybeUrl(company?.website)}</p>
              </div>
              <div>
                <p className="text-white/45">Contact</p>
                <p className="mt-1 text-white/80">
                  {company?.contact_email ?? company?.contact_details ?? "Not available"}
                </p>
              </div>
              <div>
                <p className="text-white/45">Internal notes</p>
                <p className="mt-1 whitespace-pre-wrap leading-7 text-white/75">
                  {company?.notes ?? "No internal notes captured."}
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <p className="text-xs uppercase tracking-[0.28em] text-white/45">Effective Brief</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {companyCampaignOverride.trim() ? (
                <Badge tone="warning">Using company override</Badge>
              ) : (
                <Badge>Using global brief</Badge>
              )}
            </div>
            <p className="mt-4 text-sm leading-7 text-white/68">
              {effectiveCampaignBrief
                ? `${effectiveCampaignBrief.slice(0, 240)}${effectiveCampaignBrief.length > 240 ? "..." : ""}`
                : "No campaign brief has been saved yet."}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => setActiveTab("draft")}>
                Open Draft Tab
              </Button>
              <Button variant="ghost" onClick={() => setActiveTab("research")}>
                View Research
              </Button>
            </div>
          </Card>

          <Card>
            <p className="text-xs uppercase tracking-[0.28em] text-white/45">Run Status</p>
            <div className="mt-4 flex items-center gap-2">
              <Badge tone={generationTone(jobStatus)}>{jobStatus ?? "Idle"}</Badge>
            </div>
            <p className="mt-4 text-sm leading-7 text-white/68">
              {latestJob?.updated_at
                ? `Last updated ${formatTimestamp(latestJob.updated_at)}`
                : "No background run has started for this company yet."}
            </p>
            {jobStatus ? <ProgressBar className="mt-4" value={jobProgress} /> : null}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-white/[0.04]">
            <div className="flex flex-wrap gap-2">
              {workspaceTabs.map((tab) => (
                <TabButton
                  key={tab.id}
                  active={activeTab === tab.id}
                  label={tab.label}
                  icon={tab.icon}
                  onClick={() => setActiveTab(tab.id)}
                />
              ))}
            </div>
          </Card>

          {activeTab === "overview" ? (
            <div className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr]">
              <Card>
                <p className="text-xs uppercase tracking-[0.28em] text-white/45">Company Profile</p>
                <div className="mt-5 space-y-5 text-sm">
                  <div>
                    <p className="text-white/45">Reach strategy</p>
                    <p className="mt-1 whitespace-pre-wrap leading-7 text-white/78">
                      {company?.reach_channel ?? "No specific route noted."}
                    </p>
                  </div>
                  <div>
                    <p className="text-white/45">Campaign brief source</p>
                    <p className="mt-1 leading-7 text-white/78">
                      {companyCampaignOverride.trim()
                        ? "This company has its own campaign brief override."
                        : "This company currently inherits the global dashboard brief."}
                    </p>
                  </div>
                  <div>
                    <p className="text-white/45">Recommended next move</p>
                    <p className="mt-1 leading-7 text-white/78">
                      {template
                        ? "Open the Draft tab to refine the message or the Delivery tab to send it."
                        : "Queue a generation run to start building the first tailored draft."}
                    </p>
                  </div>
                </div>
              </Card>

              <Card>
                <p className="text-xs uppercase tracking-[0.28em] text-white/45">AI Alignment</p>
                {unifiedContext ? (
                  <>
                    <p className="mt-4 text-sm leading-7 text-white/78">
                      {unifiedContext.executive_summary}
                    </p>
                    <div className="mt-5 space-y-3">
                      {unifiedContext.alignment_points.map((point) => (
                        <div
                          key={point}
                          className="rounded-[20px] border border-line bg-white/[0.03] px-4 py-3 text-sm leading-6 text-white/70"
                        >
                          {point}
                        </div>
                      ))}
                    </div>
                    {unifiedContext.personalization_angles?.length ? (
                      <div className="mt-5 rounded-[22px] border border-line bg-white/[0.03] p-4">
                        <p className="text-sm font-medium text-white">Personalization angles</p>
                        <p className="mt-2 text-sm leading-7 text-white/68">
                          {unifiedContext.personalization_angles.join(", ")}
                        </p>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="mt-4 rounded-[22px] border border-dashed border-line bg-white/[0.03] p-5 text-sm leading-7 text-white/60">
                    AI alignment appears here after a generation run completes.
                  </div>
                )}
              </Card>
            </div>
          ) : null}

          {activeTab === "research" ? (
            <Card>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-white/45">Research Pipeline</p>
                  <h3 className="mt-2 font-display text-3xl">Background progress and step detail</h3>
                </div>
                {latestJob?.updated_at ? (
                  <p className="text-sm text-white/50">
                    Updated {formatTimestamp(latestJob.updated_at)}
                  </p>
                ) : null}
              </div>

              {latestJob ? (
                <div className="mt-6 space-y-4">
                  <div className="rounded-[26px] border border-line bg-white/[0.03] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-white/55">Current status</p>
                        <p className="mt-2 font-display text-2xl">
                          {jobStatusLabel(latestJob.status, latestJob.current_step)}
                        </p>
                      </div>
                      <Badge tone={generationTone(latestJob.status)}>{latestJob.status}</Badge>
                    </div>
                    <ProgressBar className="mt-5" value={latestJob.progress_percent} />
                    <p className="mt-3 text-sm text-white/55">
                      {latestJob.progress_percent}% complete
                    </p>
                    {latestJob.error_message ? (
                      <p className="mt-4 text-sm text-danger">{latestJob.error_message}</p>
                    ) : null}
                  </div>

                  <div className="rounded-[24px] border border-line bg-white/[0.03] p-4 text-sm leading-7 text-white/62">
                    These panels show high-level step summaries, surfaced findings, and source traces. They are designed to make the process understandable without exposing hidden raw reasoning.
                  </div>

                  <div className="space-y-3">
                    {latestJob.steps.map((step) => (
                      <StepPanel key={step.key} step={step} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-[24px] border border-dashed border-line bg-white/[0.03] p-6 text-sm leading-7 text-white/60">
                  No background run has been started yet. Use Generate or Regenerate from the header when you are ready.
                </div>
              )}
            </Card>
          ) : null}

          {activeTab === "draft" ? (
            <div className="space-y-6">
              <Card>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-white/45">Campaign Context</p>
                    <h3 className="mt-2 font-display text-3xl">Global brief and company override</h3>
                  </div>
                  <Button
                    variant={hasUnsavedOverride ? "primary" : "secondary"}
                    disabled={activeAction !== null}
                    onClick={() => void handleSaveOverride()}
                  >
                    {activeAction === "saveOverride" ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {activeAction === "saveOverride" ? "Saving..." : "Save Override"}
                  </Button>
                </div>

                <div className="mt-6 grid gap-6 xl:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="global-context">Global brief</FieldLabel>
                    <Textarea
                      id="global-context"
                      className="min-h-[180px]"
                      readOnly
                      value={
                        globalCampaignContext ||
                        "No global brief has been saved on the dashboard yet."
                      }
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="company-override">Company override</FieldLabel>
                    <Textarea
                      id="company-override"
                      className="min-h-[180px]"
                      placeholder="Leave blank to inherit the global brief. Add company-specific context only when this sponsor needs a different angle."
                      value={companyCampaignOverride}
                      onChange={(event) => setCompanyCampaignOverride(event.target.value)}
                    />
                  </div>
                </div>
              </Card>

              <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                <Card>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.28em] text-white/45">Draft Editor</p>
                      <h3 className="mt-2 font-display text-3xl">
                        {template ? "Refine the saved draft" : "Queue a draft first"}
                      </h3>
                    </div>
                    <Button
                      variant="secondary"
                      disabled={activeAction !== null || !template}
                      onClick={() => void handleSaveTemplate()}
                    >
                      {activeAction === "save" ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      {activeAction === "save" ? "Saving..." : "Save Draft"}
                    </Button>
                  </div>

                  {!template ? (
                    <div className="mt-6 rounded-[24px] border border-dashed border-line bg-white/[0.03] p-6 text-sm leading-7 text-white/60">
                      There is no completed draft yet. Queue generation from the header, or wait for the current background job to finish.
                    </div>
                  ) : null}

                  <div className="mt-6 grid gap-5">
                    <div>
                      <FieldLabel htmlFor="subject">Subject</FieldLabel>
                      <Input
                        id="subject"
                        placeholder="Your subject line"
                        value={subject}
                        onChange={(event) => setSubject(event.target.value)}
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="preview-line">Preview line</FieldLabel>
                      <Input
                        id="preview-line"
                        placeholder="Short preview line"
                        value={previewLine}
                        onChange={(event) => setPreviewLine(event.target.value)}
                      />
                    </div>

                    <div>
                      <FieldLabel htmlFor="email-body">Email body</FieldLabel>
                      <Textarea
                        id="email-body"
                        placeholder="The generated draft will appear here."
                        value={contentMarkdown}
                        onChange={(event) => setContentMarkdown(event.target.value)}
                      />
                    </div>
                  </div>
                </Card>

                <Card>
                  <p className="text-xs uppercase tracking-[0.28em] text-white/45">Live Preview</p>
                  <h4 className="mt-3 font-display text-2xl">{subject || "Untitled subject"}</h4>
                  {previewLine ? <p className="mt-2 text-sm text-white/55">{previewLine}</p> : null}
                  <div className="mt-4 rounded-[20px] border border-line bg-white/[0.03] px-4 py-3 text-sm leading-6 text-white/62">
                    Generated emails are configured to avoid em dashes and stay closer to a direct human tone.
                  </div>
                  <div
                    className="prose prose-invert mt-6 max-w-none text-sm leading-7"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                </Card>
              </div>
            </div>
          ) : null}

          {activeTab === "delivery" ? (
            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <Card>
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-accent" />
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-white/45">Gmail Delivery</p>
                    <h3 className="mt-2 font-display text-3xl">Send the outreach</h3>
                  </div>
                </div>

                <div className="mt-6 rounded-[24px] border border-line bg-white/[0.03] p-4 text-sm leading-7 text-white/68">
                  {gmailStatus?.connected
                    ? `Connected as ${gmailStatus.email}.`
                    : "Gmail is not connected yet. Visit Gmail settings before sending."}
                </div>

                <div className="mt-6 grid gap-5">
                  <div>
                    <FieldLabel htmlFor="recipient">Recipient email</FieldLabel>
                    <Input
                      id="recipient"
                      value={recipientEmail}
                      onChange={(event) => setRecipientEmail(event.target.value)}
                      placeholder="partnerships@company.com"
                    />
                  </div>

                  <div>
                    <FieldLabel htmlFor="attachments">Attachments</FieldLabel>
                    <Input
                      id="attachments"
                      type="file"
                      multiple
                      onChange={(event) =>
                        setAttachments(Array.from(event.target.files ?? []))
                      }
                    />
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Button
                    disabled={
                      activeAction !== null ||
                      !gmailStatus?.connected ||
                      !recipientEmail ||
                      !subject ||
                      !contentMarkdown
                    }
                    onClick={() => void handleSend()}
                  >
                    {activeAction === "send" ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {activeAction === "send" ? "Sending..." : "Send via Gmail"}
                  </Button>
                  <Link href="/settings/gmail" className={buttonStyles("secondary")}>
                    Manage Gmail
                  </Link>
                </div>
              </Card>

              <Card>
                <p className="text-xs uppercase tracking-[0.28em] text-white/45">Final Draft Snapshot</p>
                <h4 className="mt-3 font-display text-2xl">{subject || "Untitled subject"}</h4>
                {previewLine ? <p className="mt-2 text-sm text-white/55">{previewLine}</p> : null}
                <div
                  className="prose prose-invert mt-6 max-w-none text-sm leading-7"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </Card>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
