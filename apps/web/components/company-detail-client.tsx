"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Layers3,
  LoaderCircle,
  Mail,
  PenSquare,
  RefreshCcw,
  RotateCcw,
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
  Drawer,
  FieldLabel,
  Input,
  Modal,
  ProgressBar,
  Skeleton,
  SkeletonText,
  TabsBar,
  Textarea,
  TruncatedText,
  buttonStyles,
} from "@/components/ui";

type ActiveAction =
  | "queueGenerate"
  | "queueRegenerate"
  | "saveOverride"
  | "save"
  | "send"
  | null;

type WorkspaceTab = "overview" | "research" | "draft";

const workspaceTabs = [
  { id: "overview", label: "Overview", icon: <Layers3 className="h-4 w-4" /> },
  { id: "research", label: "Research", icon: <Sparkles className="h-4 w-4" /> },
  { id: "draft", label: "Draft", icon: <PenSquare className="h-4 w-4" /> },
] as const;

function CompanyDetailSkeleton() {
  return (
    <div className="space-y-5">
      <Card className="overflow-hidden bg-gradient-to-br from-white/[0.08] via-white/[0.04] to-accentSoft/10">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 max-w-4xl">
            <div className="flex flex-wrap gap-3">
              <Skeleton className="h-11 w-28 rounded-full" />
              <Skeleton className="h-11 w-28 rounded-full" />
            </div>
            <Skeleton className="mt-5 h-3 w-36" />
            <Skeleton className="mt-4 h-12 w-[420px] max-w-full" />
            <div className="mt-4 flex flex-wrap gap-2">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-32 rounded-full" />
            </div>
          </div>
          <div className="flex flex-wrap gap-3 xl:justify-end">
            <Skeleton className="h-11 w-24 rounded-full" />
            <Skeleton className="h-11 w-24 rounded-full" />
            <Skeleton className="h-11 w-32 rounded-full" />
          </div>
        </div>

        <div className="mt-6 rounded-[26px] border border-line bg-white/[0.03] p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-6 w-56 max-w-full" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="mt-4 h-2.5 w-full rounded-full" />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={`metric-${index}`} className="p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-6 w-28" />
            <SkeletonText className="mt-4" lines={2} />
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-2 rounded-[24px] border border-line bg-white/[0.03] p-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={`tab-${index}`} className="h-11 w-28 rounded-full" />
          ))}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
        <Card>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-8 w-52 max-w-full" />
          <div className="mt-5 overflow-hidden rounded-[24px] border border-line p-5">
            <Skeleton className="h-4 w-full" />
            <SkeletonText className="mt-4" lines={7} />
          </div>
        </Card>
        <div className="space-y-5">
          <Card>
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-4 h-8 w-64 max-w-full" />
            <SkeletonText className="mt-5" lines={4} />
          </Card>
          <Card>
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-4 h-8 w-56 max-w-full" />
            <SkeletonText className="mt-5" lines={4} />
          </Card>
        </div>
      </div>
    </div>
  );
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}

function MetricCard({
  label,
  value,
  hint,
  tone = "muted",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "muted" | "success" | "warning" | "danger";
}) {
  const toneClasses = {
    muted: "bg-white/8 text-white/75",
    success: "bg-success/15 text-success",
    danger: "bg-danger/15 text-danger",
    warning: "bg-warning/15 text-warning",
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.26em] text-white/45">{label}</p>
        <div
          className={`max-w-[65%] rounded-full px-3 py-1 text-xs font-semibold ${toneClasses[tone]}`}
        >
          <TruncatedText text={value} />
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/62">{hint}</p>
    </Card>
  );
}

function SnapshotRow({
  label,
  value,
  lines = 1,
}: {
  label: string;
  value: string;
  lines?: 1 | 2 | 3;
}) {
  return (
    <tr className="border-b border-line/70 align-top last:border-b-0">
      <td className="w-[34%] px-0 py-3 pr-4 text-xs uppercase tracking-[0.22em] text-white/40">
        {label}
      </td>
      <td className="px-0 py-3">
        <TruncatedText text={value} lines={lines} className="text-sm leading-6 text-white/78" />
      </td>
    </tr>
  );
}

function InsightAccordion({
  title,
  items,
  emptyLabel,
  defaultOpen = false,
}: {
  title: string;
  items: string[];
  emptyLabel: string;
  defaultOpen?: boolean;
}) {
  return (
    <details className="rounded-[22px] border border-line bg-white/[0.03] p-4" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-white">{title}</p>
          <p className="mt-1 text-sm text-white/45">
            {items.length ? `${items.length} item${items.length === 1 ? "" : "s"}` : emptyLabel}
          </p>
        </div>
        <Badge>{items.length}</Badge>
      </summary>

      <div className="mt-4 space-y-3">
        {items.length ? (
          items.map((item) => (
            <div
              key={item}
              className="rounded-[18px] border border-line bg-white/[0.03] px-4 py-3 text-sm leading-6 text-white/72 break-words"
            >
              {item}
            </div>
          ))
        ) : (
          <div className="rounded-[18px] border border-dashed border-line bg-white/[0.03] px-4 py-3 text-sm leading-6 text-white/55">
            {emptyLabel}
          </div>
        )}
      </div>
    </details>
  );
}

function StepPanel({ step }: { step: GenerationStepRecord }) {
  return (
    <details
      className="rounded-[24px] border border-line bg-white/[0.03] p-4"
      open={step.status === "running"}
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-white">{step.title}</p>
          {step.description ? (
            <TruncatedText
              text={step.description}
              lines={2}
              className="mt-2 text-sm leading-6 text-white/55"
            />
          ) : null}
        </div>
        <Badge tone={generationTone(step.status)}>{step.status}</Badge>
      </summary>

      <div className="mt-4 space-y-4 text-sm text-white/72">
        {step.summary ? (
          <div className="rounded-[20px] border border-line bg-white/[0.03] p-4 leading-7 break-words">
            {step.summary}
          </div>
        ) : null}

        {step.details.length > 0 ? (
          <div className="space-y-2">
            {step.details.map((detail) => (
              <div
                key={detail}
                className="rounded-[18px] border border-line bg-white/[0.03] px-3 py-3 leading-6 break-words"
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
                      <TruncatedText text={label} />
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
                    <TruncatedText text={label} />
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
  const [briefModalOpen, setBriefModalOpen] = useState(false);
  const [sendDrawerOpen, setSendDrawerOpen] = useState(false);
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
  const hasUnsavedDraft =
    subject !== (template?.subject ?? "") ||
    previewLine !== (template?.preview_line ?? "") ||
    contentMarkdown !== (template?.content_markdown ?? "");
  const effectiveCampaignBrief =
    companyCampaignOverride.trim() || globalCampaignContext.trim();
  const unifiedContext = template?.generated_context?.unified_context;
  const completedSteps =
    latestJob?.steps.filter((step) => step.status === "completed").length ?? 0;
  const totalSteps = latestJob?.steps.length ?? 0;
  const siteLabel = formatMaybeUrl(company?.website);

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

    setTemplate(nextTemplate);
    if (!options?.preserveEditor || !editorIsDirty) {
      setSubject(nextTemplate.subject);
      setPreviewLine(nextTemplate.preview_line ?? "");
      setContentMarkdown(nextTemplate.content_markdown);
    }
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
            ? "Background generation started. You can leave this page and come back later."
            : "Background regeneration started. The current saved draft stays available while the refresh runs.",
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
            ? "Company-specific brief saved."
            : "Company override cleared. This company now uses the global brief.",
        );
        setBriefModalOpen(false);
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

  function handleResetDraft() {
    if (!template) {
      return;
    }
    setSubject(template.subject);
    setPreviewLine(template.preview_line ?? "");
    setContentMarkdown(template.content_markdown);
    setNotice("Draft reset to the last saved version.");
    setError(null);
  }

  function handleResetOverride() {
    setCompanyCampaignOverride("");
    setNotice("Company override cleared locally. Save the brief to make the global brief active again.");
    setError(null);
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
        setAttachments([]);
        setSendDrawerOpen(false);
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

  if (initialLoading && !company) {
    return <CompanyDetailSkeleton />;
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden bg-gradient-to-br from-white/[0.08] via-white/[0.04] to-accentSoft/10">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 max-w-4xl">
            <div className="flex flex-wrap gap-3">
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

            <p className="mt-5 text-xs uppercase tracking-[0.34em] text-accent/80">
              Sponsor Record
            </p>
            <h2 className="mt-3 font-display text-4xl leading-tight lg:text-5xl">
              {company?.name ?? "Loading company..."}
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone={statusTone(company?.status)}>{company?.status ?? "Unknown"}</Badge>
              {company?.tier ? <Badge>{company.tier}</Badge> : null}
              <Badge tone={template ? "success" : "muted"}>
                {template ? "Draft ready" : "No draft"}
              </Badge>
              {jobStatus ? (
                <Badge tone={generationTone(jobStatus)} className="max-w-full">
                  <TruncatedText
                    text={jobStatusLabel(jobStatus, jobCurrentStep)}
                    className="max-w-[220px]"
                  />
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 xl:justify-end">
            <Button variant="secondary" onClick={() => setBriefModalOpen(true)}>
              <FileText className="h-4 w-4" />
              Context
            </Button>
            <Button
              variant="ghost"
              disabled={!template}
              onClick={() => setSendDrawerOpen(true)}
            >
              <Mail className="h-4 w-4" />
              Send
            </Button>
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

        {jobStatus ? (
          <div className="mt-6 rounded-[26px] border border-line bg-white/[0.03] p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-white/50">Latest run</p>
                <TruncatedText
                  text={jobStatusLabel(jobStatus, jobCurrentStep)}
                  className="mt-2 text-lg font-medium text-white"
                />
              </div>
              <p className="text-sm text-white/50">{jobProgress}% complete</p>
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
          Loading company profile, draft, and queue state...
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <MetricCard
          label="Queue"
          value={jobStatusLabel(jobStatus, jobCurrentStep)}
          hint={
            latestJob?.updated_at
              ? `Updated ${formatTimestamp(latestJob.updated_at)}`
              : "No background run has started yet."
          }
          tone={generationTone(jobStatus)}
        />
        <MetricCard
          label="Steps"
          value={totalSteps ? `${completedSteps}/${totalSteps}` : "0/0"}
          hint={
            totalSteps
              ? "Completed research and drafting stages in the latest run."
              : "Step tracking appears after the first queued run."
          }
          tone={jobIsActive ? "warning" : totalSteps ? "success" : "muted"}
        />
        <MetricCard
          label="Context"
          value={companyCampaignOverride.trim() ? "Override" : "Global"}
          hint={
            companyCampaignOverride.trim()
              ? "This company uses a dedicated angle instead of the shared dashboard brief."
              : "This company inherits the shared campaign brief."
          }
          tone={companyCampaignOverride.trim() ? "warning" : "muted"}
        />
        <MetricCard
          label="Delivery"
          value={gmailStatus?.connected ? "Ready" : "Setup"}
          hint={
            gmailStatus?.connected
              ? `Connected as ${gmailStatus.email ?? "your Gmail account"}.`
              : "Connect Gmail before sending from this sponsor record."
          }
          tone={gmailStatus?.connected ? "success" : "warning"}
        />
      </div>

      <Card className="p-4">
        <TabsBar
          items={workspaceTabs.map((tab) => ({
            id: tab.id,
            label: tab.label,
            icon: tab.icon,
          }))}
          value={activeTab}
          onChange={(nextValue) => setActiveTab(nextValue as WorkspaceTab)}
        />
      </Card>

      {activeTab === "overview" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
          <Card>
            <div className="flex items-center justify-between gap-3">
                <div>
                <p className="text-xs uppercase tracking-[0.28em] text-white/45">Sponsor Profile</p>
                <h3 className="mt-2 font-display text-3xl">Company profile</h3>
              </div>
              {siteLabel ? <Badge>{siteLabel}</Badge> : null}
            </div>

            <div className="mt-5 overflow-hidden rounded-[24px] border border-line">
              <div className="max-h-[420px] overflow-auto px-5">
                <table className="min-w-full table-fixed">
                  <tbody>
                    <SnapshotRow label="Industry" value={company?.industry ?? "Not specified"} />
                    <SnapshotRow label="Website" value={siteLabel ?? company?.website ?? "None"} />
                    <SnapshotRow
                      label="Contact"
                      value={
                        company?.contact_email ??
                        company?.contact_details ??
                        "No contact details captured"
                      }
                      lines={2}
                    />
                    <SnapshotRow
                      label="Channel"
                      value={company?.reach_channel ?? "No channel guidance yet"}
                      lines={2}
                    />
                    <SnapshotRow
                      label="Phone / Address"
                      value={company?.phone_or_address ?? "No phone or address captured"}
                      lines={2}
                    />
                    <SnapshotRow
                      label="Notes"
                      value={company?.notes ?? "No internal notes captured"}
                      lines={3}
                    />
                  </tbody>
                </table>
              </div>
            </div>
          </Card>

          <div className="space-y-5">
            <Card>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.28em] text-white/45">Campaign Context</p>
                  <h3 className="mt-2 font-display text-3xl">Global brief with company override</h3>
                </div>
                <Button variant="secondary" onClick={() => setBriefModalOpen(true)}>
                  Edit Context
                </Button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-[22px] border border-line bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-white/45">Global brief</p>
                  <TruncatedText
                    text={
                      globalCampaignContext ||
                      "No shared campaign brief has been saved on the dashboard yet."
                    }
                    lines={3}
                    className="mt-3 text-sm leading-6 text-white/68"
                  />
                </div>
                <div className="rounded-[22px] border border-line bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-white/45">
                    Company override
                  </p>
                  <TruncatedText
                    text={
                      companyCampaignOverride.trim() ||
                      "Blank, which means this company currently inherits the shared dashboard brief."
                    }
                    lines={3}
                    className="mt-3 text-sm leading-6 text-white/68"
                  />
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.28em] text-white/45">Strategic Fit</p>
                  <h3 className="mt-2 font-display text-3xl">Why this sponsor is a strong match</h3>
                </div>
                <Badge tone={template ? "success" : "muted"}>
                  {template ? "Ready" : "Waiting"}
                </Badge>
              </div>

              {unifiedContext ? (
                <div className="mt-5 space-y-4">
                  <div className="rounded-[22px] border border-line bg-white/[0.03] p-4">
                    <TruncatedText
                      text={unifiedContext.executive_summary}
                      lines={3}
                      className="text-sm leading-7 text-white/72"
                    />
                  </div>
                  <div className="rounded-[22px] border border-line bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-white/45">
                      Recommended ask
                    </p>
                    <TruncatedText
                      text={unifiedContext.recommended_ask}
                      lines={3}
                      className="mt-3 text-sm leading-6 text-white/72"
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-[22px] border border-dashed border-line bg-white/[0.03] p-5 text-sm leading-7 text-white/60">
                  Queue generation to populate the fit summary, recommended ask, and structured research notes.
                </div>
              )}
            </Card>
          </div>

          <Card>
            <p className="text-xs uppercase tracking-[0.28em] text-white/45">Research Highlights</p>
            <h3 className="mt-2 font-display text-3xl">Key alignment signals</h3>
            <div className="mt-5 space-y-3">
              <InsightAccordion
                title="Alignment points"
                items={unifiedContext?.alignment_points ?? []}
                emptyLabel="No alignment points yet."
                defaultOpen
              />
              <InsightAccordion
                title="Personalization angles"
                items={unifiedContext?.personalization_angles ?? []}
                emptyLabel="No personalization angles yet."
              />
              <InsightAccordion
                title="Risk flags"
                items={unifiedContext?.risk_flags ?? []}
                emptyLabel="No risk flags yet."
              />
            </div>
          </Card>

          <Card>
            <p className="text-xs uppercase tracking-[0.28em] text-white/45">Recommended Action</p>
            <h3 className="mt-2 font-display text-3xl">Keep the next step clear</h3>
            <div className="mt-5 grid gap-3">
              <div className="rounded-[20px] border border-line bg-white/[0.03] px-4 py-4 text-sm leading-6 text-white/68">
                {template
                  ? "Open the draft tab to tighten the wording, then use the send drawer when the message is ready."
                  : "Start with Generate so the research pipeline can build a first draft in the background."}
              </div>
              <div className="rounded-[20px] border border-line bg-white/[0.03] px-4 py-4 text-sm leading-6 text-white/68">
                {jobIsActive
                  ? "The research tab will keep updating every few seconds while the current run is active."
                  : "The research tab stores the last run, so you can leave and come back later without losing context."}
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === "research" ? (
        <div className="space-y-5">
          <Card>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.28em] text-white/45">Research Progress</p>
                <h3 className="mt-2 font-display text-3xl">Track research and draft generation</h3>
              </div>
              {latestJob?.updated_at ? (
                <p className="text-sm text-white/50">
                  Updated {formatTimestamp(latestJob.updated_at)}
                </p>
              ) : null}
            </div>

            {latestJob ? (
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div className="rounded-[22px] border border-line bg-white/[0.03] p-4 md:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-white/50">Current step</p>
                      <TruncatedText
                        text={jobStatusLabel(latestJob.status, latestJob.current_step)}
                        className="mt-2 text-lg font-medium text-white"
                      />
                    </div>
                    <Badge tone={generationTone(latestJob.status)}>{latestJob.status}</Badge>
                  </div>
                  <ProgressBar className="mt-4" value={latestJob.progress_percent} />
                  <p className="mt-3 text-sm text-white/55">{latestJob.progress_percent}% complete</p>
                  {latestJob.error_message ? (
                    <div className="mt-4 rounded-[18px] border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger break-words">
                      {latestJob.error_message}
                    </div>
                  ) : null}
                </div>
                <div className="rounded-[22px] border border-line bg-white/[0.03] p-4">
                  <p className="text-sm text-white/50">Progress detail</p>
                  <p className="mt-3 text-2xl font-semibold text-white">
                    {completedSteps}/{totalSteps || 0}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/58">
                    Completed stages in the last queued run.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-[24px] border border-dashed border-line bg-white/[0.03] p-6 text-sm leading-7 text-white/60">
                No background run has started yet. Use Generate or Regenerate from the header when you are ready.
              </div>
            )}
          </Card>

          {latestJob ? (
            <Card>
              <p className="text-xs uppercase tracking-[0.28em] text-white/45">Stage Detail</p>
              <h3 className="mt-2 font-display text-3xl">Detailed stage log</h3>
              <p className="mt-3 text-sm leading-6 text-white/58">
                Each panel gives a short explanation, surfaced findings, and source links without exposing hidden reasoning.
              </p>
              <div className="mt-5 space-y-3">
                {latestJob.steps.map((step) => (
                  <StepPanel key={step.key} step={step} />
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {activeTab === "draft" ? (
        <div className="space-y-5">
          <Card>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.28em] text-white/45">Outreach Draft</p>
                <h3 className="mt-2 font-display text-3xl">Edit, review, and prepare delivery</h3>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={() => setBriefModalOpen(true)}>
                  <FileText className="h-4 w-4" />
                  Context
                </Button>
                <Button
                  variant="ghost"
                  disabled={!template || !hasUnsavedDraft}
                  onClick={handleResetDraft}
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
                <Button
                  variant={hasUnsavedDraft ? "primary" : "secondary"}
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
                <Button disabled={!template} onClick={() => setSendDrawerOpen(true)}>
                  <Send className="h-4 w-4" />
                  Send
                </Button>
              </div>
            </div>

            {!template ? (
              <div className="mt-5 rounded-[24px] border border-dashed border-line bg-white/[0.03] p-6 text-sm leading-7 text-white/60">
                There is no completed draft yet. Queue generation from the header, or wait for the current background job to finish.
              </div>
            ) : null}
          </Card>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)]">
            <Card>
              <p className="text-xs uppercase tracking-[0.28em] text-white/45">Editor</p>
              <div className="mt-5 grid gap-5">
                <div>
                  <FieldLabel htmlFor="subject">Subject</FieldLabel>
                  <Input
                    id="subject"
                    placeholder="Subject line"
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
                    className="min-h-[480px]"
                    placeholder="The generated draft will appear here."
                    value={contentMarkdown}
                    onChange={(event) => setContentMarkdown(event.target.value)}
                  />
                </div>
              </div>
            </Card>

            <div className="space-y-5">
              <Card>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.28em] text-white/45">Preview</p>
                  <Badge tone={hasUnsavedDraft ? "warning" : "success"}>
                    {hasUnsavedDraft ? "Unsaved edits" : "Saved"}
                  </Badge>
                </div>
                <h4 className="mt-3 font-display text-2xl">{subject || "Untitled subject"}</h4>
                {previewLine ? (
                  <TruncatedText
                    text={previewLine}
                    lines={2}
                    className="mt-2 text-sm leading-6 text-white/55"
                  />
                ) : null}
                <div className="mt-4 rounded-[20px] border border-line bg-white/[0.03] px-4 py-3 text-sm leading-6 text-white/62">
                  The pipeline now applies a final humanizer step, pushes for a stronger cold-email hook, keeps the draft shorter, and strips em dashes from the finished version.
                </div>
                <div className="mt-5 max-h-[560px] overflow-y-auto rounded-[22px] border border-line bg-white/[0.03] p-5">
                  <div
                    className="prose prose-invert max-w-none text-sm leading-7"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                </div>
              </Card>

              <Card>
                <p className="text-xs uppercase tracking-[0.28em] text-white/45">Campaign Context</p>
                <div className="mt-4 rounded-[22px] border border-line bg-white/[0.03] p-4">
                  <p className="text-sm font-medium text-white">
                    {companyCampaignOverride.trim()
                      ? "This draft is using the company override."
                      : "This draft is using the shared dashboard brief."}
                  </p>
                  <TruncatedText
                    text={
                      effectiveCampaignBrief ||
                      "No campaign brief is saved yet. Open the brief modal to add one."
                    }
                    lines={3}
                    className="mt-3 text-sm leading-6 text-white/65"
                  />
                </div>
                <div className="mt-4 rounded-[22px] border border-line bg-white/[0.03] p-4">
                  <p className="text-sm font-medium text-white">Current recipient</p>
                  <TruncatedText
                    text={recipientEmail || "No recipient set yet"}
                    className="mt-3 text-sm text-white/65"
                  />
                </div>
              </Card>
            </div>
          </div>
        </div>
      ) : null}

      <Modal
        open={briefModalOpen}
        onClose={() => setBriefModalOpen(false)}
        title="Campaign Context"
        description="The dashboard brief is the default for every company. Use the override only when this specific sponsor needs a different angle."
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" onClick={handleResetOverride}>
              <RotateCcw className="h-4 w-4" />
              Reset Override
            </Button>
            <div className="flex flex-wrap gap-3">
              <Button variant="ghost" onClick={() => setBriefModalOpen(false)}>
                Close
              </Button>
              <Button disabled={activeAction !== null} onClick={() => void handleSaveOverride()}>
                {activeAction === "saveOverride" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {activeAction === "saveOverride" ? "Saving..." : "Save Company Override"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid gap-5">
          <div>
            <FieldLabel htmlFor="global-brief">Global brief</FieldLabel>
            <Textarea
              id="global-brief"
              className="min-h-[180px]"
              readOnly
              value={
                globalCampaignContext ||
                "No global brief has been saved on the dashboard yet."
              }
            />
          </div>
          <div>
            <FieldLabel htmlFor="company-brief">Company override</FieldLabel>
            <Textarea
              id="company-brief"
              className="min-h-[220px]"
              placeholder="Leave blank to inherit the shared dashboard brief. Add company-specific program context only when needed."
              value={companyCampaignOverride}
              onChange={(event) => setCompanyCampaignOverride(event.target.value)}
            />
          </div>
          <div className="rounded-[22px] border border-line bg-white/[0.03] p-4 text-sm leading-7 text-white/60">
            The effective context is what the agents read during research and drafting. Long text stays in this modal so the main page stays easier to scan.
          </div>
        </div>
      </Modal>

      <Drawer
        open={sendDrawerOpen}
        onClose={() => setSendDrawerOpen(false)}
        title="Send Outreach"
        description="Delivery lives in a drawer so you can check recipients, attachments, and the final message without losing your place in the editor."
        footer={
          <div className="flex flex-wrap justify-between gap-3">
            <Link href="/settings/gmail" className={buttonStyles("secondary")}>
              Manage Gmail
            </Link>
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
          </div>
        }
      >
        <div className="space-y-5">
          <div className="rounded-[24px] border border-line bg-white/[0.03] p-4 text-sm leading-7 text-white/68">
            {gmailStatus?.connected
              ? `Connected as ${gmailStatus.email ?? "your Gmail account"}.`
              : "Gmail is not connected yet. Visit Gmail settings before sending."}
          </div>

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
              onChange={(event) => setAttachments(Array.from(event.target.files ?? []))}
            />
            {attachments.length ? (
              <div className="mt-3 flex flex-col gap-2">
                {attachments.map((attachment) => (
                  <div
                    key={`${attachment.name}-${attachment.size}`}
                    className="rounded-[18px] border border-line bg-white/[0.03] px-3 py-2 text-sm text-white/70"
                  >
                    <TruncatedText text={attachment.name} />
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-[24px] border border-line bg-white/[0.03] p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-white/45">Final draft</p>
            <h4 className="mt-3 font-display text-2xl">{subject || "Untitled subject"}</h4>
            {previewLine ? (
              <TruncatedText
                text={previewLine}
                lines={2}
                className="mt-2 text-sm leading-6 text-white/55"
              />
            ) : null}
            <div className="mt-5 max-h-[360px] overflow-y-auto rounded-[20px] border border-line bg-white/[0.03] p-4">
              <div
                className="prose prose-invert max-w-none text-sm leading-7"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
