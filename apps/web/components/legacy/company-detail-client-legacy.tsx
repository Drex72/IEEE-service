"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  LoaderCircle,
  Mail,
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

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}

function StepPanel({ step }: { step: GenerationStepRecord }) {
  return (
    <details
      className="rounded-[22px] border border-line bg-white/[0.03] p-4"
      open={step.status === "running"}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-white">{step.title}</p>
          <p className="mt-1 text-sm text-white/55">{step.description}</p>
        </div>
        <Badge tone={generationTone(step.status)}>{step.status}</Badge>
      </summary>

      <div className="mt-4 space-y-4 text-sm text-white/75">
        {step.summary ? (
          <div className="rounded-2xl border border-line bg-white/[0.03] p-3 leading-6">
            {step.summary}
          </div>
        ) : null}

        {step.details.length > 0 ? (
          <ul className="space-y-2 leading-6">
            {step.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        ) : null}

        {step.sources.length > 0 ? (
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-white/45">Sources</p>
            <div className="mt-3 flex flex-col gap-2">
              {step.sources.map((source, index) => (
                <a
                  key={`${source.url ?? source.title ?? "source"}-${index}`}
                  href={source.url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-2xl border border-line bg-white/[0.03] px-3 py-2 text-sm text-white/75 transition hover:border-accent hover:text-white"
                >
                  {source.title ?? source.url ?? "Source"}
                </a>
              ))}
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
  const [initialLoading, setInitialLoading] = useState(true);
  const previousJobStatusRef = useRef<string | null>(null);

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
            : "Background regeneration started. The current draft stays available while the new run finishes.",
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
        void syncPageEvent({ silent: true, preserveInputs: true });
      }
      if (currentStatus === "failed") {
        setError(latestJob?.error_message ?? "Background generation failed.");
      }
    }
    previousJobStatusRef.current = currentStatus;
  }, [latestJob?.status, latestJob?.error_message]);

  const unifiedContext = template?.generated_context?.unified_context;

  return (
    <div className="space-y-6">
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

      <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
        <div className="space-y-6">
          <Card>
            <p className="text-xs uppercase tracking-[0.32em] text-accent/80">Company profile</p>
            <h2 className="mt-3 font-display text-4xl">{company?.name ?? "Loading..."}</h2>

            <div className="mt-5 flex flex-wrap gap-2">
              <Badge tone={statusTone(company?.status)}>{company?.status ?? "Unknown"}</Badge>
              {company?.tier ? <Badge>{company.tier}</Badge> : null}
              {template ? <Badge tone="success">Draft ready</Badge> : null}
              {jobStatus ? (
                <Badge tone={generationTone(jobStatus)}>
                  {jobStatusLabel(jobStatus, jobCurrentStep)}
                </Badge>
              ) : null}
            </div>

            <dl className="mt-8 space-y-5 text-sm">
              <div>
                <dt className="text-white/45">Industry</dt>
                <dd className="mt-1 text-white/80">{company?.industry ?? "Not specified"}</dd>
              </div>
              <div>
                <dt className="text-white/45">Website</dt>
                <dd className="mt-1 text-white/80">{formatMaybeUrl(company?.website)}</dd>
              </div>
              <div>
                <dt className="text-white/45">Contact</dt>
                <dd className="mt-1 text-white/80">
                  {company?.contact_email ?? company?.contact_details ?? "Not available"}
                </dd>
              </div>
              <div>
                <dt className="text-white/45">Reach strategy</dt>
                <dd className="mt-1 whitespace-pre-wrap text-white/80">
                  {company?.reach_channel ?? "No specific route noted."}
                </dd>
              </div>
              <div>
                <dt className="text-white/45">Notes</dt>
                <dd className="mt-1 whitespace-pre-wrap text-white/80">
                  {company?.notes ?? "No internal notes captured."}
                </dd>
              </div>
            </dl>

            {unifiedContext ? (
              <div className="mt-8 rounded-[26px] border border-line bg-white/[0.03] p-5">
                <p className="text-xs uppercase tracking-[0.28em] text-white/45">AI alignment</p>
                <p className="mt-3 text-sm leading-7 text-white/75">
                  {unifiedContext.executive_summary}
                </p>
                <ul className="mt-4 space-y-3 text-sm leading-7 text-white/70">
                  {unifiedContext.alignment_points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>

          <Card>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-white/45">
                  Research Pipeline
                </p>
                <h3 className="mt-2 font-display text-3xl">Background progress and step summaries</h3>
              </div>
              {latestJob?.updated_at ? (
                <p className="text-sm text-white/50">
                  Updated {formatTimestamp(latestJob.updated_at)}
                </p>
              ) : null}
            </div>

            {latestJob ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-[24px] border border-line bg-white/[0.03] p-5">
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
                  {latestJob.campaign_context ? (
                    <p className="mt-4 text-sm leading-7 text-white/60">
                      This run is using a saved snapshot of the campaign brief, so later edits do not change the in-flight job.
                    </p>
                  ) : null}
                </div>

                <div className="rounded-[24px] border border-line bg-white/[0.03] p-5 text-sm leading-7 text-white/60">
                  These are high-level step summaries and source traces so the user can understand progress without exposing raw hidden reasoning.
                </div>

                <div className="space-y-3">
                  {latestJob.steps.map((step) => (
                    <StepPanel key={step.key} step={step} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-[24px] border border-dashed border-line bg-white/[0.03] p-6 text-sm leading-7 text-white/60">
                No background job has been started for this company yet. Queue a generate or regenerate run from the draft panel to start research in the background.
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-gradient-to-br from-white/[0.06] to-accent/10">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-white/45">
                  Campaign Context
                </p>
                <h3 className="mt-2 font-display text-3xl">Global brief plus company-specific override</h3>
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

            <div className="mt-8 grid gap-5">
              <div>
                <FieldLabel htmlFor="global-context">Global campaign brief</FieldLabel>
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
                <FieldLabel htmlFor="company-override">
                  Company brief override
                </FieldLabel>
                <Textarea
                  id="company-override"
                  className="min-h-[180px]"
                  placeholder="Leave this blank to inherit the global brief. Add anything unique for this company if you want the research and draft to lean a different way."
                  value={companyCampaignOverride}
                  onChange={(event) => setCompanyCampaignOverride(event.target.value)}
                />
                <p className="mt-3 text-sm leading-7 text-white/60">
                  {companyCampaignOverride.trim()
                    ? "This company will use its override instead of the dashboard brief."
                    : "This company currently inherits the dashboard brief."}
                </p>
              </div>

              <div className="rounded-[24px] border border-line bg-white/[0.03] p-4 text-sm leading-7 text-white/65">
                Effective brief length: {effectiveCampaignBrief.length} characters. This is the context the next queued run will use.
              </div>
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-white/[0.06] to-accent/10">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-white/45">
                  Outreach Draft
                </p>
                <h3 className="mt-2 font-display text-3xl">
                  {template ? "Edit and refine the current message" : "Queue the first draft"}
                </h3>
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
                  <>
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
                    <Button
                      variant="ghost"
                      disabled={activeAction !== null || !template}
                      onClick={() => void handleSaveTemplate()}
                    >
                      {activeAction === "save" ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      {activeAction === "save" ? "Saving..." : "Save"}
                    </Button>
                  </>
                )}
              </div>
            </div>

            {jobIsActive ? (
              <div className="mt-6 rounded-[24px] border border-accent/25 bg-accent/10 px-4 py-3 text-sm text-white/80">
                {jobStatus === "queued"
                  ? "This run is queued and will start in the background shortly."
                  : "Research and draft generation are running in the background. You can stay here, leave the page, or come back later."}
              </div>
            ) : null}

            <div className="mt-8 grid gap-5">
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
                  placeholder={
                    template
                      ? "Edit the saved draft."
                      : "Queue a draft to populate this editor."
                  }
                  value={contentMarkdown}
                  onChange={(event) => setContentMarkdown(event.target.value)}
                />
              </div>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-[1fr_0.92fr]">
            <Card>
              <p className="text-xs uppercase tracking-[0.32em] text-white/45">Live preview</p>
              <h4 className="mt-3 font-display text-2xl">{subject || "Untitled subject"}</h4>
              {previewLine ? <p className="mt-2 text-sm text-white/55">{previewLine}</p> : null}
              <div
                className="prose prose-invert mt-6 max-w-none text-sm leading-7"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </Card>

            <Card>
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-accent" />
                <div>
                  <p className="text-xs uppercase tracking-[0.32em] text-white/45">Send</p>
                  <h4 className="mt-2 font-display text-2xl">Gmail delivery</h4>
                </div>
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

              <div className="mt-6 rounded-[24px] border border-line bg-white/[0.03] p-4 text-sm leading-7 text-white/70">
                {gmailStatus?.connected
                  ? `Connected as ${gmailStatus.email}.`
                  : "Gmail is not connected yet. Visit Gmail settings before sending."}
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
          </div>
        </div>
      </div>
    </div>
  );
}
