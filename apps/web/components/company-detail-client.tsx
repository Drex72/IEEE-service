"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Layers3,
  Linkedin,
  LoaderCircle,
  Mail,
  PenSquare,
  RefreshCcw,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  StopCircle,
  Users2,
} from "lucide-react";

import {
  ApiError,
  cancelGenerationJob,
  generateTemplate,
  getCampaignContext,
  getCompany,
  getCompanyContacts,
  getGmailStatus,
  getLatestGenerationJob,
  regenerateTemplate,
  sendEmail,
  updateCompany,
  updateContactDraft,
} from "@/lib/api";
import type {
  CompanyContactRecord,
  CompanyRecord,
  ContactOutreachDraftRecord,
  GenerationJobRecord,
  GenerationStepRecord,
  GmailStatusResponse,
} from "@/lib/types";
import {
  formatMaybeUrl,
  formatTimestamp,
  generationTone,
  isValidEmail,
  jobStatusLabel,
  jobTriggerLabel,
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
  | "saveDraft"
  | "send"
  | "cancelJob"
  | null;

type WorkspaceTab = "overview" | "research" | "draft";
type ChannelTab = "email" | "linkedin";

const workspaceTabs = [
  { id: "overview", label: "Overview", icon: <Layers3 className="h-4 w-4" /> },
  { id: "research", label: "Research", icon: <Sparkles className="h-4 w-4" /> },
  { id: "draft", label: "Outreach", icon: <PenSquare className="h-4 w-4" /> },
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
          <Skeleton className="h-4 w-44" />
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <Card>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-8 w-52 max-w-full" />
          <SkeletonText className="mt-5" lines={8} />
        </Card>
        <Card>
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-4 h-8 w-64 max-w-full" />
          <SkeletonText className="mt-5" lines={7} />
        </Card>
      </div>
    </div>
  );
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
          className={`max-w-[70%] rounded-full px-3 py-1 text-xs font-semibold ${toneClasses[tone]}`}
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

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}

function getContactLabel(contact: CompanyContactRecord) {
  return (
    contact.full_name?.trim() ||
    contact.email?.trim() ||
    contact.raw_contact?.trim() ||
    contact.reach_channel?.trim() ||
    "Team contact"
  );
}

function normalizeContactText(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function getContactSubLabel(contact: CompanyContactRecord) {
  const label = getContactLabel(contact);
  const roleTitle = contact.role_title?.trim();
  const email = contact.email?.trim();
  const rawContact = contact.raw_contact?.trim();
  const reachChannel = contact.reach_channel?.trim();
  const parts = [roleTitle];

  if (email && normalizeContactText(email) !== normalizeContactText(label)) {
    parts.push(email);
  }

  if (parts.length) {
    return parts.join(" • ");
  }
  if (reachChannel) {
    return reachChannel;
  }
  if (contact.linkedin_url) {
    return "LinkedIn profile captured";
  }
  if (rawContact && normalizeContactText(rawContact) !== normalizeContactText(label)) {
    return rawContact;
  }
  if (email) {
    return "Direct email captured";
  }
  return "No role or email captured yet";
}

function getContactDraft(
  contact: CompanyContactRecord | null | undefined,
  channel: ChannelTab,
) {
  return contact?.drafts.find((draft) => draft.channel === channel) ?? null;
}

function patchDraftIntoContacts(
  contacts: CompanyContactRecord[],
  updatedDraft: ContactOutreachDraftRecord,
) {
  return contacts.map((contact) => {
    if (contact.id !== updatedDraft.contact_id) {
      return contact;
    }
    const nextDrafts = contact.drafts.some(
      (draft) => draft.channel === updatedDraft.channel,
    )
      ? contact.drafts.map((draft) =>
          draft.channel === updatedDraft.channel ? updatedDraft : draft,
        )
      : [...contact.drafts, updatedDraft];

    nextDrafts.sort((left, right) => {
      const leftScore = left.channel === "email" ? 0 : 1;
      const rightScore = right.channel === "email" ? 0 : 1;
      return leftScore - rightScore;
    });
    return { ...contact, drafts: nextDrafts };
  });
}

function getDraftHighlights(
  draft: ContactOutreachDraftRecord | null,
  channel: ChannelTab,
) {
  if (!draft) {
    return [] as string[];
  }
  const generatedContext = draft.generated_context as Record<string, any>;
  const finalBundle = generatedContext.final_bundle as Record<string, any> | undefined;
  if (channel === "email") {
    const email = finalBundle?.email as { personalization_highlights?: string[] } | undefined;
    return email?.personalization_highlights ?? [];
  }
  const linkedin = finalBundle?.linkedin_message as
    | { personalization_highlights?: string[] }
    | undefined;
  return linkedin?.personalization_highlights ?? [];
}

export function CompanyDetailClient({ companyId }: { companyId: string }) {
  const [company, setCompany] = useState<CompanyRecord | null>(null);
  const [contacts, setContacts] = useState<CompanyContactRecord[]>([]);
  const [latestJob, setLatestJob] = useState<GenerationJobRecord | null>(null);
  const [gmailStatus, setGmailStatus] = useState<GmailStatusResponse | null>(null);
  const [globalCampaignContext, setGlobalCampaignContext] = useState("");
  const [companyCampaignOverride, setCompanyCampaignOverride] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<ChannelTab>("email");
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

  const selectedContact =
    contacts.find((contact) => contact.id === selectedContactId) ?? contacts[0] ?? null;
  const emailDraft = getContactDraft(selectedContact, "email");
  const linkedinDraft = getContactDraft(selectedContact, "linkedin");
  const selectedDraft = selectedChannel === "email" ? emailDraft : linkedinDraft;
  const previewHtml = markdownToHtml(contentMarkdown);
  const jobStatus = latestJob?.status ?? company?.generation_status ?? null;
  const jobCurrentStep = latestJob?.current_step ?? company?.generation_current_step ?? null;
  const jobProgress =
    latestJob?.progress_percent ?? company?.generation_progress_percent ?? 0;
  const jobIsActive =
    jobStatus === "queued" || jobStatus === "running" || jobStatus === "cancelling";
  const hasUnsavedOverride =
    companyCampaignOverride.trim() !== (company?.campaign_context_override ?? "").trim();
  const hasUnsavedDraft =
    subject !== (selectedDraft?.subject ?? "") ||
    previewLine !== (selectedDraft?.preview_line ?? "") ||
    contentMarkdown !== (selectedDraft?.content_markdown ?? "");
  const effectiveCampaignBrief =
    companyCampaignOverride.trim() || globalCampaignContext.trim();
  const unifiedContext =
    emailDraft?.generated_context?.unified_context ??
    selectedDraft?.generated_context?.unified_context;
  const completedSteps =
    latestJob?.steps.filter((step) => step.status === "completed").length ?? 0;
  const totalSteps = latestJob?.steps.length ?? 0;
  const siteLabel = formatMaybeUrl(company?.website);
  const hasAnyDraft = contacts.some((contact) =>
    contact.drafts.some((draft) => draft.channel === "email"),
  );
  const hasValidEmailContact = contacts.some((contact) => isValidEmail(contact.email));
  const selectedDraftHighlights = getDraftHighlights(selectedDraft, selectedChannel);

  async function syncPage(options?: { silent?: boolean; preserveInputs?: boolean }) {
    try {
      const [companyPayload, contactsPayload, gmailPayload, campaignPayload, jobPayload] =
        await Promise.all([
          getCompany(companyId),
          getCompanyContacts(companyId).catch((err) => {
            if (err instanceof ApiError && err.status === 404) {
              return [];
            }
            throw err;
          }),
          getGmailStatus().catch(() => ({ configured: false, connected: false })),
          getCampaignContext().catch(() => ({ owner_key: "", brief: "" })),
          getLatestGenerationJob(companyId).catch((err) => {
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
      setContacts(contactsPayload);

      if (!options?.preserveInputs || !hasUnsavedOverride) {
        setCompanyCampaignOverride(companyPayload.campaign_context_override ?? "");
      }

      if (!selectedContactId || !contactsPayload.some((contact) => contact.id === selectedContactId)) {
        setSelectedContactId(contactsPayload[0]?.id ?? null);
      }

      setError(null);
    } catch (err) {
      if (!options?.silent) {
        setError(err instanceof ApiError ? err.message : "Could not load the sponsor record.");
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
            ? "Background generation started. Each contact will get an email draft and a LinkedIn message."
            : "Background regeneration started. Existing drafts stay available until the refreshed versions are saved.",
        );
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : mode === "generate"
              ? "Could not start background generation."
              : "Could not start regeneration.",
        );
      }
    });
  }

  async function handleCancelJob() {
    if (!latestJob) {
      return;
    }

    await runAction("cancelJob", async () => {
      try {
        const job = await cancelGenerationJob(latestJob.id);
        setLatestJob(job);
        setCompany((currentCompany) =>
          currentCompany
            ? {
                ...currentCompany,
                generation_status: job.status,
                generation_progress_percent: job.progress_percent,
                generation_current_step: job.current_step,
                generation_error_message: job.error_message,
                latest_generation_job_id: job.id,
              }
            : currentCompany,
        );
        setNotice(
          job.status === "cancelled"
            ? "The queued run was cancelled."
            : "Cancellation requested. The worker will stop this run after the current stage finishes.",
        );
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not stop the current run.");
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

  async function handleSaveDraft() {
    if (!selectedContact) {
      return;
    }

    await runAction("saveDraft", async () => {
      try {
        const saved = await updateContactDraft(selectedContact.id, selectedChannel, {
          subject: selectedChannel === "email" ? subject : null,
          preview_line: selectedChannel === "email" ? previewLine : null,
          content_markdown: contentMarkdown,
          content_html: markdownToHtml(contentMarkdown),
        });
        setContacts((currentContacts) => patchDraftIntoContacts(currentContacts, saved));
        setNotice(
          selectedChannel === "email"
            ? "Email draft saved."
            : "LinkedIn message saved.",
        );
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not save the selected draft.");
      }
    });
  }

  function handleResetDraft() {
    setSubject(selectedDraft?.subject ?? "");
    setPreviewLine(selectedDraft?.preview_line ?? "");
    setContentMarkdown(selectedDraft?.content_markdown ?? "");
    setNotice("Draft reset to the last saved version.");
    setError(null);
  }

  function handleResetOverride() {
    setCompanyCampaignOverride("");
    setNotice(
      "Company override cleared locally. Save the brief if you want this record to inherit the shared campaign brief again.",
    );
    setError(null);
  }

  async function handleSend() {
    if (!selectedContact || !selectedDraft || selectedChannel !== "email") {
      return;
    }

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
          contact_id: selectedContact.id,
          draft_id: selectedDraft.id,
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
  }, [companyId, jobIsActive]);

  useEffect(() => {
    const currentStatus = latestJob?.status ?? null;
    const previousStatus = previousJobStatusRef.current;
    if (previousStatus && previousStatus !== currentStatus) {
      if (currentStatus === "completed") {
        setNotice("Fresh contact drafts are ready.");
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
    } else if (hasAnyDraft) {
      setActiveTab("draft");
    } else {
      setActiveTab("overview");
    }
    initializedTabRef.current = true;
  }, [initialLoading, jobIsActive, hasAnyDraft]);

  useEffect(() => {
    setSubject(selectedDraft?.subject ?? "");
    setPreviewLine(selectedDraft?.preview_line ?? "");
    setContentMarkdown(selectedDraft?.content_markdown ?? "");
  }, [
    selectedContactId,
    selectedChannel,
    selectedDraft?.id,
    selectedDraft?.updated_at,
    selectedDraft?.subject,
    selectedDraft?.preview_line,
    selectedDraft?.content_markdown,
  ]);

  useEffect(() => {
    if (selectedContact?.email) {
      setRecipientEmail(selectedContact.email);
      return;
    }
    if (company?.contact_email) {
      setRecipientEmail(company.contact_email);
    }
  }, [selectedContact?.id, selectedContact?.email, company?.contact_email]);

  if (initialLoading && !company) {
    return <CompanyDetailSkeleton />;
  }

  const contactSelectorItems = contacts.map((contact) => ({
    id: contact.id,
    label: getContactLabel(contact),
    description: getContactSubLabel(contact),
    hasDrafts: contact.drafts.length > 0,
  }));

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
              {company?.name ?? "Loading sponsor record..."}
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone={statusTone(company?.status)}>{company?.status ?? "Unknown"}</Badge>
              {company?.tier ? <Badge>{company.tier}</Badge> : null}
              <Badge tone={hasAnyDraft ? "success" : "muted"}>
                {hasAnyDraft ? `${company?.draft_count ?? 0} email drafts` : "No drafts"}
              </Badge>
              {company?.latest_generation_trigger ? (
                <Badge>{jobTriggerLabel(company.latest_generation_trigger)}</Badge>
              ) : null}
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
              Brief
            </Button>
            <Button
              variant="ghost"
              disabled={!selectedDraft || selectedChannel !== "email"}
              onClick={() => setSendDrawerOpen(true)}
            >
              <Mail className="h-4 w-4" />
              Send Email
            </Button>
            {latestJob && jobIsActive ? (
              <Button
                variant="ghost"
                disabled={activeAction !== null}
                onClick={() => void handleCancelJob()}
              >
                {activeAction === "cancelJob" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <StopCircle className="h-4 w-4" />
                )}
                {activeAction === "cancelJob" ? "Stopping..." : "Stop Run"}
              </Button>
            ) : null}
            {!hasAnyDraft ? (
              <Button
                disabled={activeAction !== null || !company || jobIsActive || !hasValidEmailContact}
                onClick={() => void handleQueueGenerate("generate")}
              >
                {activeAction === "queueGenerate" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {activeAction === "queueGenerate" ? "Queueing..." : "Generate Drafts"}
              </Button>
            ) : (
              <Button
                disabled={activeAction !== null || jobIsActive || !hasValidEmailContact}
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
      {!initialLoading && !hasValidEmailContact ? (
        <Card className="border-warning/30 bg-warning/10 text-sm text-warning">
          At least one contact with a valid email is required before this sponsor can enter the email generation queue. Let contact discovery finish or add a valid email contact first.
        </Card>
      ) : null}
      {initialLoading ? (
        <Card className="flex items-center gap-3 text-sm text-white/70">
          <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
          Loading sponsor profile, contacts, and queue state...
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
          label="Contacts"
          value={`${company?.contact_count ?? contacts.length}`}
          hint="Every contact can carry its own email draft and LinkedIn message."
          tone={contacts.length ? "success" : "warning"}
        />
        <MetricCard
          label="Draft Packages"
          value={`${company?.draft_count ?? 0}`}
          hint="Saved email drafts across the current contact roster."
          tone={hasAnyDraft ? "success" : "muted"}
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
                      label="Primary Contact"
                      value={selectedContact ? getContactLabel(selectedContact) : "No contact captured"}
                      lines={2}
                    />
                    <SnapshotRow
                      label="Channel"
                      value={selectedContact?.reach_channel ?? company?.reach_channel ?? "No channel guidance yet"}
                      lines={2}
                    />
                    <SnapshotRow
                      label="Phone / Address"
                      value={
                        selectedContact?.phone_or_address ??
                        company?.phone_or_address ??
                        "No phone or address captured"
                      }
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

          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-white/45">Contact Roster</p>
                <h3 className="mt-2 font-display text-3xl">Choose the outreach recipient</h3>
              </div>
              <Badge tone={contacts.length ? "success" : "warning"}>
                {contacts.length} contact{contacts.length === 1 ? "" : "s"}
              </Badge>
            </div>

            <div className="mt-5 grid gap-3">
              {contacts.length ? (
                contacts.map((contact) => {
                  const contactEmailDraft = getContactDraft(contact, "email");
                  const contactLinkedinDraft = getContactDraft(contact, "linkedin");
                  const active = contact.id === selectedContact?.id;
                  return (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => setSelectedContactId(contact.id)}
                      className={`rounded-[22px] border px-4 py-4 text-left transition ${
                        active
                          ? "border-accent bg-accent/10"
                          : "border-line bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <TruncatedText
                            text={getContactLabel(contact)}
                            className="font-medium text-white"
                          />
                          <TruncatedText
                            text={getContactSubLabel(contact)}
                            className="mt-2 text-sm leading-6 text-white/58"
                            lines={2}
                          />
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {contact.is_primary ? <Badge tone="warning">Primary</Badge> : null}
                          <Badge
                            tone={
                              contactEmailDraft
                                ? "success"
                                : contact.email
                                  ? "warning"
                                  : "muted"
                            }
                          >
                            {contactEmailDraft
                              ? "Email draft ready"
                              : contact.email
                                ? "Email on file"
                                : "No email on file"}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/48">
                        <span>{contactLinkedinDraft ? "LinkedIn ready" : "LinkedIn pending"}</span>
                        {contact.linkedin_url ? <span>LinkedIn profile captured</span> : null}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-[22px] border border-dashed border-line bg-white/[0.03] p-5 text-sm leading-7 text-white/60">
                  No contact records were imported for this company yet. Re-import the workbook after applying the latest migration.
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.28em] text-white/45">Campaign Brief</p>
                <h3 className="mt-2 font-display text-3xl">Global brief with company override</h3>
              </div>
              <Button variant="secondary" onClick={() => setBriefModalOpen(true)}>
                Edit Brief
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
                <h3 className="mt-2 font-display text-3xl">Why the selected recipient is a strong fit</h3>
              </div>
              <Badge tone={selectedDraft ? "success" : "muted"}>
                {selectedDraft ? "Context ready" : "Waiting"}
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
                Queue generation to populate the fit summary, the recipient-specific hook, and the recommendation logic.
              </div>
            )}
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
                    Completed stages in the latest queued run.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-[24px] border border-dashed border-line bg-white/[0.03] p-6 text-sm leading-7 text-white/60">
                No background run has started yet. Use Generate Drafts or Regenerate from the header when you are ready.
              </div>
            )}
          </Card>

          {latestJob ? (
            <Card>
              <p className="text-xs uppercase tracking-[0.28em] text-white/45">Stage Detail</p>
              <h3 className="mt-2 font-display text-3xl">Detailed stage log</h3>
              <p className="mt-3 text-sm leading-6 text-white/58">
                Each panel explains what the pipeline surfaced without exposing hidden reasoning.
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
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.28em] text-white/45">Recipient Workspace</p>
                <h3 className="mt-2 font-display text-3xl">Choose the contact and outreach channel</h3>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={() => setBriefModalOpen(true)}>
                  <FileText className="h-4 w-4" />
                  Brief
                </Button>
                <Button
                  variant="ghost"
                  disabled={!selectedDraft || !hasUnsavedDraft}
                  onClick={handleResetDraft}
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
                <Button
                  variant={hasUnsavedDraft ? "primary" : "secondary"}
                  disabled={activeAction !== null || !selectedContact || !selectedDraft}
                  onClick={() => void handleSaveDraft()}
                >
                  {activeAction === "saveDraft" ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {activeAction === "saveDraft" ? "Saving..." : "Save Draft"}
                </Button>
                <Button
                  disabled={!selectedDraft || selectedChannel !== "email"}
                  onClick={() => setSendDrawerOpen(true)}
                >
                  <Send className="h-4 w-4" />
                  Send Email
                </Button>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-white/45">
                  <Users2 className="h-4 w-4" />
                  Contacts
                </div>
                {contactSelectorItems.length ? (
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {contactSelectorItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedContactId(item.id)}
                        className={`min-w-[240px] rounded-[22px] border px-4 py-4 text-left transition ${
                          item.id === selectedContact?.id
                            ? "border-accent bg-accent/10"
                            : "border-line bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                        }`}
                      >
                        <TruncatedText text={item.label} className="font-medium text-white" />
                        <TruncatedText
                          text={item.description}
                          lines={2}
                          className="mt-2 text-sm leading-6 text-white/58"
                        />
                        <div className="mt-3">
                          <Badge tone={item.hasDrafts ? "success" : "muted"}>
                            {item.hasDrafts ? "Drafts ready" : "Awaiting drafts"}
                          </Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[22px] border border-dashed border-line bg-white/[0.03] p-5 text-sm leading-7 text-white/60">
                    No imported contacts are available yet for this sponsor record.
                  </div>
                )}
              </div>

              <TabsBar
                items={[
                  { id: "email", label: "Email", icon: <Mail className="h-4 w-4" /> },
                  { id: "linkedin", label: "LinkedIn", icon: <Linkedin className="h-4 w-4" /> },
                ]}
                value={selectedChannel}
                onChange={(nextValue) => setSelectedChannel(nextValue as ChannelTab)}
              />
            </div>
          </Card>

          {!selectedContact ? (
            <Card className="rounded-[24px] border border-dashed border-line bg-white/[0.03] p-6 text-sm leading-7 text-white/60">
              This company does not have any imported contacts yet, so no personalized outreach package can be shown.
            </Card>
          ) : !selectedDraft ? (
            <Card className="rounded-[24px] border border-dashed border-line bg-white/[0.03] p-6 text-sm leading-7 text-white/60">
              There is no saved {selectedChannel === "email" ? "email draft" : "LinkedIn message"} for {getContactLabel(selectedContact)} yet. Queue generation or regenerate the company record to build it.
            </Card>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)]">
              <Card>
                <p className="text-xs uppercase tracking-[0.28em] text-white/45">Editor</p>
                <div className="mt-5 grid gap-5">
                  {selectedChannel === "email" ? (
                    <>
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
                    </>
                  ) : (
                    <div className="rounded-[20px] border border-line bg-white/[0.03] px-4 py-4 text-sm leading-6 text-white/62">
                      LinkedIn messages stay subject-free and shorter by design. Keep the note crisp, personal, and easy to reply to.
                    </div>
                  )}

                  <div>
                    <FieldLabel htmlFor="message-body">
                      {selectedChannel === "email" ? "Email body" : "LinkedIn message"}
                    </FieldLabel>
                    <Textarea
                      id="message-body"
                      className="min-h-[520px]"
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
                  {selectedChannel === "email" ? (
                    <>
                      <h4 className="mt-3 font-display text-2xl">
                        {subject || "Untitled subject"}
                      </h4>
                      {previewLine ? (
                        <TruncatedText
                          text={previewLine}
                          lines={2}
                          className="mt-2 text-sm leading-6 text-white/55"
                        />
                      ) : null}
                    </>
                  ) : (
                    <h4 className="mt-3 font-display text-2xl">LinkedIn message</h4>
                  )}
                  <div className="mt-4 rounded-[20px] border border-line bg-white/[0.03] px-4 py-3 text-sm leading-6 text-white/62">
                    The pipeline now writes one outreach package per contact, keeps the hook stronger, avoids em dashes, and separates Email from LinkedIn so both can feel native to the channel.
                  </div>
                  <div className="mt-5 max-h-[560px] overflow-y-auto rounded-[22px] border border-line bg-white/[0.03] p-5">
                    <div
                      className="prose prose-invert max-w-none text-sm leading-7"
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                  </div>
                </Card>

                <Card>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.28em] text-white/45">
                        Personalization Anchors
                      </p>
                      <h4 className="mt-2 font-display text-2xl">Why this note should feel specific</h4>
                    </div>
                    <Badge tone="success">{selectedChannel}</Badge>
                  </div>
                  <div className="mt-5 space-y-3">
                    {selectedDraftHighlights.length ? (
                      selectedDraftHighlights.map((item) => (
                        <div
                          key={item}
                          className="rounded-[18px] border border-line bg-white/[0.03] px-4 py-3 text-sm leading-6 text-white/72"
                        >
                          {item}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[18px] border border-dashed border-line bg-white/[0.03] px-4 py-3 text-sm leading-6 text-white/60">
                        Personalization cues will appear here once the pipeline surfaces them for this contact.
                      </div>
                    )}
                  </div>
                </Card>

                <Card>
                  <p className="text-xs uppercase tracking-[0.28em] text-white/45">Selected Contact</p>
                  <h4 className="mt-2 font-display text-2xl">{getContactLabel(selectedContact)}</h4>
                  <p className="mt-3 text-sm leading-6 text-white/62">
                    {getContactSubLabel(selectedContact)}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedContact.is_primary ? <Badge tone="warning">Primary</Badge> : null}
                    {selectedContact.linkedin_url ? <Badge>LinkedIn profile</Badge> : null}
                    {selectedContact.email ? <Badge tone="success">Email available</Badge> : null}
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>
      ) : null}

      <Modal
        open={briefModalOpen}
        title="Campaign Brief for This Sponsor"
        description="Use the global brief by default, or save a company-specific override when this sponsor needs a different angle."
        onClose={() => setBriefModalOpen(false)}
        footer={
          <div className="flex flex-wrap justify-between gap-3">
            <Button variant="ghost" onClick={handleResetOverride}>
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => setBriefModalOpen(false)}>
                Close
              </Button>
              <Button
                disabled={activeAction !== null || !hasUnsavedOverride}
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
          </div>
        }
      >
        <div className="grid gap-5">
          <div className="rounded-[24px] border border-line bg-white/[0.03] p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-white/45">Active brief</p>
            <p className="mt-3 text-sm leading-7 text-white/68">
              {effectiveCampaignBrief ||
                "There is no shared or company-specific brief yet. Add one so the pipeline knows what the program is solving and why sponsorship matters."}
            </p>
          </div>

          <div>
            <FieldLabel htmlFor="company-brief">Company override</FieldLabel>
            <Textarea
              id="company-brief"
              value={companyCampaignOverride}
              onChange={(event) => setCompanyCampaignOverride(event.target.value)}
              placeholder="Add a company-specific angle if this sponsor needs a more tailored context than the shared dashboard brief."
            />
          </div>
        </div>
      </Modal>

      <Drawer
        open={sendDrawerOpen}
        title="Send Email Draft"
        description={
          selectedContact
            ? `Send the selected email draft to ${getContactLabel(selectedContact)}.`
            : "Send the selected email draft."
        }
        onClose={() => setSendDrawerOpen(false)}
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={() => setSendDrawerOpen(false)}>
              Close
            </Button>
            <Button
              disabled={
                activeAction !== null ||
                selectedChannel !== "email" ||
                !selectedDraft ||
                !recipientEmail.trim()
              }
              onClick={() => void handleSend()}
            >
              {activeAction === "send" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {activeAction === "send" ? "Sending..." : "Send Email"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-5">
          <div>
            <FieldLabel htmlFor="recipient-email">Recipient email</FieldLabel>
            <Input
              id="recipient-email"
              value={recipientEmail}
              onChange={(event) => setRecipientEmail(event.target.value)}
              placeholder="recipient@company.com"
            />
          </div>

          <div>
            <FieldLabel htmlFor="attachment-upload">Attachments</FieldLabel>
            <Input
              id="attachment-upload"
              type="file"
              multiple
              onChange={(event) => setAttachments(Array.from(event.target.files ?? []))}
            />
            {attachments.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {attachments.map((file) => (
                  <Badge key={file.name}>{file.name}</Badge>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-white/45">No attachments selected.</p>
            )}
          </div>

          <div className="rounded-[24px] border border-line bg-white/[0.03] p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-white/45">Selected draft</p>
            <p className="mt-3 text-sm leading-7 text-white/68">
              {subject || "Untitled subject"}
            </p>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
