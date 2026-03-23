"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useEffectEvent, useRef, useState } from "react";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  RefreshCcw,
  Search,
  Sparkles,
  WandSparkles,
} from "lucide-react";

import {
  ApiError,
  generateAllTemplates,
  getCampaignContext,
  getCompanies,
  getDashboardSummary,
  getNotifications,
  markAllNotificationsRead,
  updateCampaignContext,
} from "@/lib/api";
import type {
  CompanyRecord,
  DashboardSummary,
  NotificationRecord,
} from "@/lib/types";
import {
  formatMaybeUrl,
  formatTimestamp,
  generationTone,
  jobStatusLabel,
} from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  Input,
  ProgressBar,
  Textarea,
  buttonStyles,
} from "@/components/ui";

type ActiveAction = "refresh" | "saveBrief" | "generateAll" | "markRead" | null;

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <Card className="bg-white/[0.04] p-5">
      <p className="text-xs uppercase tracking-[0.28em] text-white/45">{label}</p>
      <p className="mt-4 font-display text-4xl">{value}</p>
      <p className="mt-2 text-sm leading-6 text-white/58">{hint}</p>
    </Card>
  );
}

function NotificationCard({ notification }: { notification: NotificationRecord }) {
  const tone =
    notification.level === "danger"
      ? "border-danger/25 bg-danger/10"
      : notification.level === "success"
        ? "border-success/25 bg-success/10"
        : "border-line bg-white/[0.03]";

  return (
    <div className={`rounded-[22px] border p-4 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-white">{notification.title}</p>
          <p className="mt-2 text-sm leading-6 text-white/70">{notification.message}</p>
        </div>
        {notification.read_at ? <Badge>Read</Badge> : <Badge tone="warning">New</Badge>}
      </div>
      <p className="mt-3 text-xs text-white/45">{formatTimestamp(notification.created_at)}</p>
    </div>
  );
}

function QueuePreviewCard({ company }: { company: CompanyRecord }) {
  return (
    <Link
      href={`/companies/${company.id}`}
      className="rounded-[24px] border border-line bg-white/[0.03] p-4 transition hover:border-white/20 hover:bg-white/[0.05]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-white">{company.name}</p>
          <p className="mt-1 text-sm text-white/55">
            {company.industry ?? "Unspecified industry"}
          </p>
        </div>
        <Badge tone={generationTone(company.generation_status)}>
          {jobStatusLabel(company.generation_status, company.generation_current_step)}
        </Badge>
      </div>
      <ProgressBar className="mt-4" value={company.generation_progress_percent ?? 0} />
      <p className="mt-3 text-xs text-white/45">
        {company.generation_progress_percent ?? 0}% complete
      </p>
    </Link>
  );
}

function CompanyPipelineCard({ company }: { company: CompanyRecord }) {
  const isActive =
    company.generation_status === "queued" || company.generation_status === "running";

  return (
    <Link
      href={`/companies/${company.id}`}
      className="group rounded-[28px] border border-line bg-white/[0.03] p-5 transition hover:border-white/20 hover:bg-white/[0.05]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{company.name}</p>
          <p className="mt-2 text-sm text-white/55">{company.industry ?? "Unspecified industry"}</p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-white/35 transition group-hover:text-accent" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Badge tone={company.has_template ? "success" : "muted"}>
          {company.has_template ? "Draft ready" : "No draft yet"}
        </Badge>
        {company.generation_status ? (
          <Badge tone={generationTone(company.generation_status)}>
            {jobStatusLabel(company.generation_status, company.generation_current_step)}
          </Badge>
        ) : null}
        {company.campaign_context_override ? (
          <Badge tone="warning">Override brief</Badge>
        ) : null}
      </div>

      <div className="mt-4 space-y-2 text-sm text-white/58">
        {company.contact_email ? <p>{company.contact_email}</p> : null}
        {company.website ? <p>{formatMaybeUrl(company.website)}</p> : null}
      </div>

      {isActive ? (
        <div className="mt-5">
          <ProgressBar value={company.generation_progress_percent ?? 0} />
          <p className="mt-2 text-xs text-white/45">
            {company.generation_progress_percent ?? 0}% complete
          </p>
        </div>
      ) : (
        <p className="mt-5 text-xs text-white/45">
          {company.latest_generation_updated_at
            ? `Last updated ${formatTimestamp(company.latest_generation_updated_at)}`
            : "No background run has started yet"}
        </p>
      )}
    </Link>
  );
}

export function DashboardClient() {
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [campaignBrief, setCampaignBrief] = useState("");
  const [savedCampaignBrief, setSavedCampaignBrief] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");
  const deferredQuery = useDeferredValue(query);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());

  const filteredCompanies = companies
    .filter((company) => {
      const haystack = [
        company.name,
        company.industry,
        company.contact_email,
        company.website,
        company.notes,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(deferredQuery.toLowerCase());
    })
    .sort((left, right) => {
      const order = { running: 0, queued: 1, failed: 2, completed: 3 };
      const leftScore =
        order[left.generation_status as keyof typeof order] ?? (left.has_template ? 4 : 5);
      const rightScore =
        order[right.generation_status as keyof typeof order] ?? (right.has_template ? 4 : 5);
      return leftScore - rightScore;
    });

  const activeCompanies = filteredCompanies.filter(
    (company) =>
      company.generation_status === "queued" || company.generation_status === "running",
  );
  const failedCompanies = filteredCompanies.filter(
    (company) => company.generation_status === "failed",
  );
  const hasUnsavedBrief = campaignBrief.trim() !== savedCampaignBrief.trim();

  async function requestDashboardData() {
    const [companyRows, dashboardSummary, campaignContext, recentNotifications] =
      await Promise.all([
        getCompanies(),
        getDashboardSummary(),
        getCampaignContext(),
        getNotifications(),
      ]);
    return {
      companyRows,
      dashboardSummary,
      campaignBrief: campaignContext.brief ?? "",
      recentNotifications,
    };
  }

  async function syncDashboard(options?: { silent?: boolean; preserveEditor?: boolean }) {
    try {
      const nextData = await requestDashboardData();
      setCompanies(nextData.companyRows);
      setSummary(nextData.dashboardSummary);
      setNotifications(nextData.recentNotifications);
      if (!options?.preserveEditor || !hasUnsavedBrief) {
        setCampaignBrief(nextData.campaignBrief);
      }
      setSavedCampaignBrief(nextData.campaignBrief);
      setError(null);
    } catch (err) {
      if (!options?.silent) {
        setError(err instanceof ApiError ? err.message : "Could not load dashboard.");
      }
    } finally {
      setInitialLoading(false);
    }
  }

  const syncDashboardEvent = useEffectEvent(
    async (options?: { silent?: boolean; preserveEditor?: boolean }) => {
      await syncDashboard(options);
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

  async function handleSaveBrief() {
    await runAction("saveBrief", async () => {
      try {
        const saved = await updateCampaignContext(campaignBrief);
        const nextBrief = saved.brief ?? "";
        setCampaignBrief(nextBrief);
        setSavedCampaignBrief(nextBrief);
        setNotice("Global campaign brief saved.");
        await syncDashboard({ silent: true, preserveEditor: true });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not save the global brief.");
      }
    });
  }

  async function handleGenerateAll() {
    await runAction("generateAll", async () => {
      try {
        const saved = await updateCampaignContext(campaignBrief);
        const nextBrief = saved.brief ?? "";
        setCampaignBrief(nextBrief);
        setSavedCampaignBrief(nextBrief);

        const response = await generateAllTemplates({
          campaign_context: nextBrief,
        });
        await syncDashboard({ silent: true, preserveEditor: true });
        if (response.queued_jobs === 0 && response.skipped_companies > 0) {
          setNotice("Everything is already queued or already has a draft.");
          return;
        }
        setNotice(
          `Background generation is now covering ${response.queued_jobs} compan${
            response.queued_jobs === 1 ? "y" : "ies"
          }.`,
        );
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Could not start background generation.",
        );
      }
    });
  }

  async function handleRefresh() {
    await runAction("refresh", async () => {
      await syncDashboard({ preserveEditor: true });
    });
  }

  async function handleMarkRead() {
    await runAction("markRead", async () => {
      try {
        const updated = await markAllNotificationsRead();
        setNotifications(updated);
        setNotice("Notifications marked as read.");
        await syncDashboard({ silent: true, preserveEditor: true });
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Could not mark notifications as read.",
        );
      }
    });
  }

  async function enableBrowserNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }

    const result = await Notification.requestPermission();
    setNotificationPermission(result);
  }

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationPermission(Notification.permission);
    }
    void syncDashboardEvent();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void syncDashboardEvent({ silent: true, preserveEditor: true });
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (
      notificationPermission !== "granted" ||
      typeof window === "undefined" ||
      !("Notification" in window)
    ) {
      return;
    }

    for (const notification of notifications) {
      if (notification.read_at || seenNotificationIdsRef.current.has(notification.id)) {
        continue;
      }
      seenNotificationIdsRef.current.add(notification.id);
      new Notification(notification.title, {
        body: notification.message,
      });
    }
  }, [notificationPermission, notifications]);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden bg-gradient-to-br from-white/9 via-white/[0.04] to-accentSoft/12">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.36em] text-accent/80">Campaign Control</p>
            <h2 className="mt-4 font-display text-4xl leading-tight lg:text-5xl">
              Keep the brief, the queue, and the company list visible without fighting the page.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/68">
              The new dashboard separates campaign setup from live activity, so you can save the shared brief, queue the full list, and still scan company progress quickly.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/upload" className={buttonStyles("secondary")}>
              Upload Tracker
            </Link>
            <Button
              disabled={activeAction !== null || companies.length === 0}
              onClick={() => void handleGenerateAll()}
            >
              {activeAction === "generateAll" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <WandSparkles className="h-4 w-4" />
              )}
              {activeAction === "generateAll" ? "Queueing..." : "Generate All"}
            </Button>
            <Button variant="ghost" disabled={activeAction !== null} onClick={() => void handleRefresh()}>
              {activeAction === "refresh" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Companies"
          value={summary?.total_companies ?? companies.length}
          hint="Imported sponsor targets in the workspace"
        />
        <MetricCard
          label="Drafts Ready"
          value={
            summary?.generated_templates ??
            companies.filter((company) => company.has_template).length
          }
          hint="Completed drafts available for review"
        />
        <MetricCard
          label="In Motion"
          value={(summary?.queued_jobs ?? 0) + (summary?.in_progress_jobs ?? 0)}
          hint="Queued or currently processing right now"
        />
        <MetricCard
          label="Unread Alerts"
          value={summary?.unread_notifications ?? 0}
          hint="Recent completions or failures needing attention"
        />
      </div>

      {error ? (
        <Card className="border-danger/30 bg-danger/10 text-sm text-danger">{error}</Card>
      ) : null}
      {notice ? (
        <Card className="border-success/30 bg-success/10 text-sm text-success">{notice}</Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-6 xl:sticky xl:top-[104px] xl:self-start">
          <Card className="bg-white/[0.04]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-white/45">
                  Shared Campaign Brief
                </p>
                <h3 className="mt-2 font-display text-3xl">The global system context</h3>
              </div>
              <Button
                variant={hasUnsavedBrief ? "primary" : "secondary"}
                disabled={activeAction !== null}
                onClick={() => void handleSaveBrief()}
              >
                {activeAction === "saveBrief" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {activeAction === "saveBrief" ? "Saving..." : "Save Brief"}
              </Button>
            </div>

            <Textarea
              className="mt-6 min-h-[270px]"
              placeholder="Describe the program, the audience, the sponsorship ask, the sponsor value, dates, constraints, and what the research should prioritize."
              value={campaignBrief}
              onChange={(event) => setCampaignBrief(event.target.value)}
            />
            <div className="mt-4 rounded-[22px] border border-line bg-white/[0.03] p-4 text-sm leading-7 text-white/60">
              This brief is saved once here and used as the default context everywhere else, unless a company page explicitly overrides it.
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                disabled={activeAction !== null || companies.length === 0}
                onClick={() => void handleGenerateAll()}
              >
                {activeAction === "generateAll" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <WandSparkles className="h-4 w-4" />
                )}
                {activeAction === "generateAll" ? "Queueing..." : "Save and Generate All"}
              </Button>
              <p className="self-center text-sm text-white/50">
                Best used after the brief is up to date.
              </p>
            </div>
          </Card>

          <Card>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-white/45">
                  Notification Center
                </p>
                <h3 className="mt-2 font-display text-3xl">Recent updates</h3>
              </div>
              <div className="flex flex-wrap gap-3">
                {notificationPermission !== "granted" ? (
                  <Button variant="secondary" onClick={() => void enableBrowserNotifications()}>
                    <BellRing className="h-4 w-4" />
                    Enable Alerts
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  disabled={activeAction !== null || notifications.length === 0}
                  onClick={() => void handleMarkRead()}
                >
                  {activeAction === "markRead" ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Mark All Read
                </Button>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {notifications.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-line bg-white/[0.03] p-6 text-sm leading-7 text-white/60">
                  Completions and failures will land here. Browser notifications can mirror them while this page is open.
                </div>
              ) : (
                notifications.slice(0, 5).map((notification) => (
                  <NotificationCard key={notification.id} notification={notification} />
                ))
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-white/45">Live Queue</p>
                <h3 className="mt-2 font-display text-3xl">What is actively moving</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="warning">{activeCompanies.length} active</Badge>
                <Badge tone={failedCompanies.length ? "danger" : "muted"}>
                  {failedCompanies.length} failed
                </Badge>
              </div>
            </div>

            {initialLoading ? (
              <div className="mt-6 flex items-center gap-3 rounded-[24px] border border-line bg-white/[0.03] px-5 py-4 text-sm text-white/70">
                <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
                Loading companies and queue state...
              </div>
            ) : activeCompanies.length === 0 ? (
              <div className="mt-6 rounded-[26px] border border-dashed border-line bg-white/[0.03] p-6 text-sm leading-7 text-white/60">
                No companies are running right now. Queue generation from the brief panel or open a company workspace to start one manually.
              </div>
            ) : (
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {activeCompanies.slice(0, 4).map((company) => (
                  <QueuePreviewCard key={company.id} company={company} />
                ))}
              </div>
            )}
          </Card>

          <Card>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-white/45">
                  Company Directory
                </p>
                <h3 className="mt-2 font-display text-3xl">Open any company workspace fast</h3>
              </div>
              <div className="relative w-full max-w-md">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <Input
                  className="pl-11"
                  placeholder="Search company, industry, notes..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>

            {!initialLoading && filteredCompanies.length === 0 ? (
              <div className="mt-6 rounded-[26px] border border-dashed border-line bg-white/[0.03] p-8 text-center">
                <Clock3 className="mx-auto h-8 w-8 text-accent" />
                <h4 className="mt-4 font-display text-2xl">Nothing to browse yet</h4>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-white/65">
                  Upload the sponsor tracker first, then this section becomes the main jump-off point into each company workspace.
                </p>
                <Link href="/upload" className={buttonStyles("primary", "mt-6 inline-flex")}>
                  Go to Upload
                </Link>
              </div>
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-2">
                {filteredCompanies.map((company) => (
                  <CompanyPipelineCard key={company.id} company={company} />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
