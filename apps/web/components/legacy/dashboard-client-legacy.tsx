"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useEffectEvent, useRef, useState } from "react";
import {
  ArrowRight,
  BellRing,
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

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <Card className="bg-white/[0.04]">
      <p className="text-xs uppercase tracking-[0.28em] text-white/45">{label}</p>
      <p className="mt-4 font-display text-4xl">{value}</p>
      <p className="mt-2 text-sm text-white/60">{hint}</p>
    </Card>
  );
}

function JobStatusCell({ company }: { company: CompanyRecord }) {
  const statusLabel = jobStatusLabel(
    company.generation_status,
    company.generation_current_step,
  );
  const isActive =
    company.generation_status === "queued" || company.generation_status === "running";

  return (
    <div className="space-y-2">
      <Badge tone={generationTone(company.generation_status)}>{statusLabel}</Badge>
      {isActive ? (
        <>
          <ProgressBar value={company.generation_progress_percent ?? 0} />
          <p className="text-xs text-white/45">
            {company.generation_progress_percent ?? 0}% complete
          </p>
        </>
      ) : null}
      {company.generation_status === "failed" && company.generation_error_message ? (
        <p className="text-xs leading-5 text-danger/90">{company.generation_error_message}</p>
      ) : null}
      {!company.generation_status ? (
        <p className="text-xs text-white/45">No background run started yet.</p>
      ) : null}
    </div>
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
          <p className="font-semibold text-white">{notification.title}</p>
          <p className="mt-2 text-sm leading-6 text-white/70">{notification.message}</p>
        </div>
        {notification.read_at ? <Badge>Read</Badge> : <Badge tone="warning">New</Badge>}
      </div>
      <p className="mt-3 text-xs text-white/45">{formatTimestamp(notification.created_at)}</p>
    </div>
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

  const jobsInFlight = companies.filter(
    (company) =>
      company.generation_status === "queued" || company.generation_status === "running",
  ).length;
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
      <Card className="overflow-hidden bg-gradient-to-br from-white/10 via-white/[0.05] to-accentSoft/20">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.36em] text-accent/80">
              Hardware Sponsorship Ops
            </p>
            <h2 className="mt-4 max-w-2xl font-display text-4xl leading-tight lg:text-5xl">
              Queue research in the background, come back later, and review every company from one control room.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/70">
              The dashboard brief drives bulk generation across the full sponsor tracker, while each company page can override it with a more targeted angle.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/upload" className={buttonStyles()}>
              Upload Tracker
              <ArrowRight className="h-4 w-4" />
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
            <Button
              variant="secondary"
              disabled={activeAction !== null}
              onClick={() => void handleRefresh()}
            >
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
        <StatCard
          label="Companies"
          value={summary?.total_companies ?? companies.length}
          hint="Imported from your outreach tracker"
        />
        <StatCard
          label="Drafts Ready"
          value={
            summary?.generated_templates ??
            companies.filter((company) => company.has_template).length
          }
          hint="Completed outreach drafts ready to review"
        />
        <StatCard
          label="Jobs Active"
          value={(summary?.queued_jobs ?? 0) + (summary?.in_progress_jobs ?? jobsInFlight)}
          hint="Queued or currently processing in the background"
        />
        <StatCard
          label="Notifications"
          value={summary?.unread_notifications ?? 0}
          hint="Unread completion or failure updates"
        />
      </div>

      {error ? (
        <Card className="border-danger/30 bg-danger/10 text-sm text-danger">{error}</Card>
      ) : null}
      {notice ? (
        <Card className="border-success/30 bg-success/10 text-sm text-success">{notice}</Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="bg-gradient-to-br from-white/[0.06] to-accent/10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-white/45">
                Global Campaign Brief
              </p>
              <h3 className="mt-2 font-display text-3xl">Shared system context for every company</h3>
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

          <div className="mt-6">
            <Textarea
              className="min-h-[240px]"
              placeholder="Describe the program, the audience, why you need sponsorship, the exact support you want, what sponsors gain, key dates, and any priorities the research should focus on."
              value={campaignBrief}
              onChange={(event) => setCampaignBrief(event.target.value)}
            />
            <p className="mt-3 text-sm leading-7 text-white/60">
              This brief is snapshotted into each queued job so a user can leave the app, come back later, and still see progress against the exact context that was used.
            </p>
          </div>
        </Card>

        <Card>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-white/45">
                Notification Center
              </p>
              <h3 className="mt-2 font-display text-3xl">Completion and failure updates</h3>
            </div>
            <div className="flex flex-wrap gap-3">
              {notificationPermission !== "granted" ? (
                <Button variant="secondary" onClick={() => void enableBrowserNotifications()}>
                  <BellRing className="h-4 w-4" />
                  Enable Browser Alerts
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
                  <RefreshCcw className="h-4 w-4" />
                )}
                Mark All Read
              </Button>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {notifications.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-line bg-white/[0.03] p-6 text-sm leading-7 text-white/60">
                Background completions and failures will appear here. If browser alerts are enabled, new unread items will also trigger a desktop notification while this page is open.
              </div>
            ) : (
              notifications.slice(0, 6).map((notification) => (
                <NotificationCard key={notification.id} notification={notification} />
              ))
            )}
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-white/45">
              Company Pipeline
            </p>
            <h3 className="mt-2 font-display text-3xl">Per-company status, progress, and draft readiness</h3>
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

        {initialLoading ? (
          <div className="mt-8 flex items-center gap-3 rounded-[24px] border border-line bg-white/[0.03] px-5 py-4 text-sm text-white/70">
            <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
            Loading companies, queued jobs, and notifications...
          </div>
        ) : null}

        {!initialLoading && filteredCompanies.length === 0 ? (
          <div className="mt-8 rounded-[28px] border border-dashed border-line bg-white/[0.03] p-8 text-center">
            <Sparkles className="mx-auto h-10 w-10 text-accent" />
            <h4 className="mt-4 font-display text-2xl">Nothing in the pipeline yet</h4>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-white/65">
              Upload the sponsor tracker to parse companies, save the campaign brief, and start background generation for the entire list.
            </p>
            <Link href="/upload" className={buttonStyles("primary", "mt-6 inline-flex")}>
              Go to Upload
            </Link>
          </div>
        ) : null}

        {!initialLoading && filteredCompanies.length > 0 ? (
          <div className="mt-6 overflow-hidden rounded-[28px] border border-line">
            <div className="grid grid-cols-[2fr_1.4fr_1fr_88px] gap-4 border-b border-line bg-white/[0.04] px-5 py-4 text-xs uppercase tracking-[0.24em] text-white/45">
              <span>Company</span>
              <span>Research Progress</span>
              <span>Draft</span>
              <span />
            </div>
            {filteredCompanies.map((company) => (
              <div
                key={company.id}
                className="grid grid-cols-[2fr_1.4fr_1fr_88px] gap-4 border-b border-line/70 px-5 py-4 last:border-b-0"
              >
                <div>
                  <p className="font-semibold text-white">{company.name}</p>
                  <div className="mt-1 flex flex-wrap gap-2 text-sm text-white/55">
                    {company.contact_email ? <span>{company.contact_email}</span> : null}
                    {company.website ? <span>{formatMaybeUrl(company.website)}</span> : null}
                  </div>
                  <p className="mt-2 text-sm text-white/55">
                    {company.industry ?? "Unspecified industry"}
                  </p>
                  {company.campaign_context_override ? (
                    <p className="mt-2 text-xs uppercase tracking-[0.2em] text-accent/80">
                      Company brief override active
                    </p>
                  ) : null}
                </div>

                <JobStatusCell company={company} />

                <div className="space-y-2">
                  <Badge tone={company.has_template ? "success" : "muted"}>
                    {company.has_template ? "Draft ready" : "No draft yet"}
                  </Badge>
                  {company.latest_generation_updated_at ? (
                    <p className="text-xs text-white/45">
                      Updated {formatTimestamp(company.latest_generation_updated_at)}
                    </p>
                  ) : null}
                </div>

                <Link
                  href={`/companies/${company.id}`}
                  className="inline-flex items-center justify-end text-accent transition hover:text-white"
                >
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
