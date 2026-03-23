"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useEffectEvent, useRef, useState } from "react";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock3,
  LayoutGrid,
  List,
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
  statusTone,
} from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  Drawer,
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

type ActiveAction = "refresh" | "saveBrief" | "generateAll" | "markRead" | null;
type ActivityTab = "queue" | "notifications";
type DirectoryView = "table" | "grid";

const DIRECTORY_VIEW_STORAGE_KEY = "ieee-sponsor-directory-view";

function StatusPill({
  tone,
  text,
}: {
  tone: "muted" | "success" | "danger" | "warning";
  text: string;
}) {
  return (
    <Badge tone={tone} className="max-w-full">
      <TruncatedText text={text} className="max-w-[220px]" />
    </Badge>
  );
}

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
      <p className="mt-3 font-display text-4xl">{value}</p>
      <p className="mt-2 text-sm leading-6 text-white/58">{hint}</p>
    </Card>
  );
}

function MetricSkeleton() {
  return (
    <Card className="bg-white/[0.04] p-5">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-4 h-10 w-24" />
      <SkeletonText className="mt-4" lines={2} />
    </Card>
  );
}

function DashboardSectionSkeleton() {
  return (
    <Card className="bg-white/[0.04]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-4 h-6 w-72 max-w-full" />
          <SkeletonText className="mt-4" lines={3} />
        </div>
        <div className="flex shrink-0 gap-3">
          <Skeleton className="h-11 w-28 rounded-full" />
          <Skeleton className="h-11 w-28 rounded-full" />
        </div>
      </div>
    </Card>
  );
}

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-[28px] border border-line">
      <div className="space-y-0">
        <div className="grid grid-cols-[1.7fr_1.1fr_1.1fr_0.8fr_1fr_60px] gap-4 border-b border-line bg-slate-950/95 px-4 py-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={`header-${index}`} className="h-3 w-20" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, rowIndex) => (
          <div
            key={`row-${rowIndex}`}
            className="grid grid-cols-[1.7fr_1.1fr_1.1fr_0.8fr_1fr_60px] gap-4 border-b border-line/70 px-4 py-4 last:border-b-0"
          >
            <div className="space-y-2">
              <Skeleton className="h-4 w-40 max-w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-4 w-32 max-w-full self-center" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-2.5 w-full rounded-full" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full self-center" />
            <Skeleton className="h-4 w-24 self-center" />
            <Skeleton className="h-10 w-10 rounded-full self-center justify-self-end" />
          </div>
        ))}
      </div>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={`grid-card-${index}`}
          className="rounded-[28px] border border-line bg-white/[0.03] p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-5 w-40 max-w-full" />
              <Skeleton className="mt-3 h-4 w-24" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <div className="mt-5 flex gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="mt-5 space-y-4">
            <div>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-4 w-44 max-w-full" />
            </div>
            <div>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-4 w-36 max-w-full" />
            </div>
            <div>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-2.5 w-full rounded-full" />
              <Skeleton className="mt-2 h-3 w-24" />
            </div>
          </div>
          <div className="mt-6 flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-28 rounded-full" />
          </div>
        </div>
      ))}
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
        <div className="min-w-0">
          <TruncatedText
            text={notification.title}
            className="font-medium text-white"
          />
          <TruncatedText
            text={notification.message}
            lines={2}
            className="mt-2 text-sm leading-6 text-white/70"
          />
        </div>
        {notification.read_at ? <Badge>Read</Badge> : <Badge tone="warning">New</Badge>}
      </div>
      <p className="mt-3 text-xs text-white/45">{formatTimestamp(notification.created_at)}</p>
    </div>
  );
}

function QueueRow({ company }: { company: CompanyRecord }) {
  return (
    <Link
      href={`/companies/${company.id}`}
      className="rounded-[22px] border border-line bg-white/[0.03] p-4 transition hover:border-white/20 hover:bg-white/[0.05]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <TruncatedText text={company.name} className="font-medium text-white" />
          <p className="mt-1 text-sm text-white/55">
            {company.industry ?? "Unspecified industry"}
          </p>
        </div>
        <StatusPill
          tone={generationTone(company.generation_status)}
          text={jobStatusLabel(company.generation_status, company.generation_current_step)}
        />
      </div>
      <ProgressBar className="mt-4" value={company.generation_progress_percent ?? 0} />
      <p className="mt-2 text-xs text-white/45">
        {company.generation_progress_percent ?? 0}% complete
      </p>
    </Link>
  );
}

function CompanyTable({
  companies,
}: {
  companies: CompanyRecord[];
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-line">
      <div className="max-h-[720px] overflow-auto">
        <div className="min-w-[940px] overflow-x-auto">
          <table className="min-w-full table-fixed">
            <thead className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur">
              <tr className="border-b border-line text-left text-xs uppercase tracking-[0.24em] text-white/45">
                <th className="w-[28%] px-4 py-4 font-medium">Company</th>
                <th className="w-[18%] px-4 py-4 font-medium">Contact</th>
                <th className="w-[16%] px-4 py-4 font-medium">Generation</th>
                <th className="w-[12%] px-4 py-4 font-medium">Draft Status</th>
                <th className="w-[18%] px-4 py-4 font-medium">Last Activity</th>
                <th className="w-[8%] px-4 py-4 font-medium" />
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id} className="border-b border-line/70 align-top last:border-b-0">
                  <td className="px-4 py-4">
                    <div className="min-w-0 space-y-1">
                      <TruncatedText text={company.name} className="font-semibold text-white" />
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={statusTone(company.status)}>
                          {company.status ?? "Unknown"}
                        </Badge>
                        {company.campaign_context_override ? (
                          <Badge tone="warning">Override</Badge>
                        ) : null}
                      </div>
                      <p className="text-sm text-white/55">
                        {company.industry ?? "Unspecified industry"}
                      </p>
                      {company.website ? (
                        <TruncatedText
                          text={formatMaybeUrl(company.website) ?? company.website}
                          className="text-sm text-white/45"
                        />
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {company.contact_email ? (
                      <TruncatedText
                        text={company.contact_email}
                        className="text-sm text-white/72"
                      />
                    ) : (
                      <span className="text-sm text-white/38">No email</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-2">
                      <StatusPill
                        tone={generationTone(company.generation_status)}
                        text={jobStatusLabel(
                          company.generation_status,
                          company.generation_current_step,
                        )}
                      />
                      {company.generation_status === "queued" ||
                      company.generation_status === "running" ? (
                        <>
                          <ProgressBar value={company.generation_progress_percent ?? 0} />
                          <p className="text-xs text-white/45">
                            {company.generation_progress_percent ?? 0}% complete
                          </p>
                        </>
                      ) : company.generation_status === "failed" &&
                        company.generation_error_message ? (
                        <TruncatedText
                          text={company.generation_error_message}
                          lines={2}
                          className="text-xs text-danger"
                        />
                      ) : (
                        <span className="text-xs text-white/38">Idle</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <Badge tone={company.has_template ? "success" : "muted"}>
                      {company.has_template ? "Ready" : "None"}
                    </Badge>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm text-white/55">
                      {company.latest_generation_updated_at
                        ? formatTimestamp(company.latest_generation_updated_at)
                        : "No run yet"}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Link
                      href={`/companies/${company.id}`}
                      className={buttonStyles("ghost", "px-3 py-2")}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CompanyGrid({
  companies,
}: {
  companies: CompanyRecord[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {companies.map((company) => {
        const generationLabel = jobStatusLabel(
          company.generation_status,
          company.generation_current_step,
        );

        return (
          <Link
            key={company.id}
            href={`/companies/${company.id}`}
            className="group rounded-[28px] border border-line bg-white/[0.03] p-5 transition hover:border-white/20 hover:bg-white/[0.06]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <TruncatedText
                  text={company.name}
                  lines={2}
                  className="text-lg font-semibold text-white"
                />
                <p className="mt-2 text-sm text-white/55">
                  {company.industry ?? "Unspecified industry"}
                </p>
              </div>
              <StatusPill
                tone={generationTone(company.generation_status)}
                text={generationLabel}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone={statusTone(company.status)}>{company.status ?? "Unknown"}</Badge>
              <Badge tone={company.has_template ? "success" : "muted"}>
                {company.has_template ? "Draft ready" : "No draft"}
              </Badge>
              {company.campaign_context_override ? <Badge tone="warning">Override</Badge> : null}
            </div>

            <div className="mt-5 grid gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-white/40">Primary contact</p>
                <TruncatedText
                  text={company.contact_email ?? company.contact_details ?? "No contact captured"}
                  lines={2}
                  className="mt-2 text-sm leading-6 text-white/72"
                />
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-white/40">Website</p>
                <TruncatedText
                  text={formatMaybeUrl(company.website) ?? company.website ?? "No website provided"}
                  lines={2}
                  className="mt-2 text-sm leading-6 text-white/65"
                />
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-white/40">Generation progress</p>
                {company.generation_status === "queued" ||
                company.generation_status === "running" ? (
                  <>
                    <ProgressBar className="mt-3" value={company.generation_progress_percent ?? 0} />
                    <p className="mt-2 text-sm text-white/55">
                      {company.generation_progress_percent ?? 0}% complete
                    </p>
                  </>
                ) : company.generation_status === "failed" &&
                  company.generation_error_message ? (
                  <TruncatedText
                    text={company.generation_error_message}
                    lines={2}
                    className="mt-2 text-sm leading-6 text-danger"
                  />
                ) : (
                  <p className="mt-2 text-sm text-white/55">
                    {company.has_template
                      ? "Latest draft is available for review."
                      : "No background generation run yet."}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-3 border-t border-line/70 pt-4">
              <p className="text-sm text-white/50">
                {company.latest_generation_updated_at
                  ? formatTimestamp(company.latest_generation_updated_at)
                  : "No recent activity"}
              </p>
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-accent">
                Open record
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </div>
          </Link>
        );
      })}
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
  const [briefModalOpen, setBriefModalOpen] = useState(false);
  const [activityDrawerOpen, setActivityDrawerOpen] = useState(false);
  const [activityTab, setActivityTab] = useState<ActivityTab>("queue");
  const [directoryView, setDirectoryView] = useState<DirectoryView>("table");
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
  const briefPreview =
    campaignBrief.trim() ||
    "No campaign brief has been saved yet. Open the editor to define the IEEE IES UNILAG program, the sponsorship ask, and the research priorities.";

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
        setNotice("Campaign brief saved.");
        setBriefModalOpen(false);
        await syncDashboard({ silent: true, preserveEditor: true });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not save the campaign brief.");
      }
    });
  }

  function handleResetBrief() {
    setCampaignBrief(savedCampaignBrief);
    setNotice("Campaign brief reset to the last saved version.");
    setError(null);
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
        setActivityTab("queue");
        setActivityDrawerOpen(true);
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
        setNotice("Campaign updates marked as read.");
        await syncDashboard({ silent: true, preserveEditor: true });
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Could not mark campaign updates as read.",
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
    if (typeof window !== "undefined") {
      const storedView = window.localStorage.getItem(DIRECTORY_VIEW_STORAGE_KEY);
      if (storedView === "table" || storedView === "grid") {
        setDirectoryView(storedView);
      }
    }

    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationPermission(Notification.permission);
    }
    void syncDashboardEvent();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(DIRECTORY_VIEW_STORAGE_KEY, directoryView);
  }, [directoryView]);

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
      <Card className="overflow-hidden bg-gradient-to-br from-white/[0.08] via-white/[0.04] to-accentSoft/12">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.36em] text-accent/80">Campaign Dashboard</p>
            <h2 className="mt-4 font-display text-4xl leading-tight lg:text-5xl">
              Run IEEE IES UNILAG sponsor outreach from one operating surface.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/68">
              Set the campaign brief, queue background research, and move through sponsor records without losing context.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/upload" className={buttonStyles("secondary")}>
              Import Workbook
            </Link>
            <Button variant="secondary" onClick={() => setBriefModalOpen(true)}>
              <Sparkles className="h-4 w-4" />
              Edit Campaign Brief
            </Button>
            <Button
              disabled={activeAction !== null || companies.length === 0}
              onClick={() => void handleGenerateAll()}
            >
              {activeAction === "generateAll" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <WandSparkles className="h-4 w-4" />
              )}
              {activeAction === "generateAll" ? "Queueing..." : "Generate All Drafts"}
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

      {error ? (
        <Card className="border-danger/30 bg-danger/10 text-sm text-danger">{error}</Card>
      ) : null}
      {notice ? (
        <Card className="border-success/30 bg-success/10 text-sm text-success">{notice}</Card>
      ) : null}

      {initialLoading ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <MetricSkeleton key={`metric-skeleton-${index}`} />
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <DashboardSectionSkeleton />
            <DashboardSectionSkeleton />
          </div>

          <Card>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-white/45">Sponsor Directory</p>
                <h3 className="mt-2 font-display text-3xl">Browse sponsor records</h3>
              </div>
              <div className="flex w-full max-w-xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <Skeleton className="h-11 w-44 rounded-2xl" />
                <Skeleton className="h-11 w-full rounded-2xl" />
              </div>
            </div>
            <div className="mt-6">
              {directoryView === "table" ? <TableSkeleton /> : <GridSkeleton />}
            </div>
          </Card>
        </>
      ) : (
        <>
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

          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <Card className="bg-white/[0.04]">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.32em] text-white/45">Campaign Brief</p>
                  <p className="mt-3 text-lg font-medium text-white">Default context for all sponsor research and outreach</p>
                  <TruncatedText
                    text={briefPreview}
                    lines={3}
                    className="mt-3 text-sm leading-7 text-white/65"
                  />
                </div>

                <div className="flex shrink-0 flex-wrap gap-3">
                  <Button variant="secondary" onClick={() => setBriefModalOpen(true)}>
                    Edit Brief
                  </Button>
                  <Button
                    disabled={activeAction !== null || companies.length === 0}
                    onClick={() => void handleGenerateAll()}
                  >
                    {activeAction === "generateAll" ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <WandSparkles className="h-4 w-4" />
                    )}
                    Queue All Companies
                  </Button>
                </div>
              </div>
            </Card>

            <Card>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.32em] text-white/45">Campaign Activity</p>
                  <p className="mt-3 text-lg font-medium text-white">
                    {activeCompanies.length} active runs, {failedCompanies.length} failures, {notifications.length} recent updates
                  </p>
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
                    onClick={() => {
                      setActivityTab("queue");
                      setActivityDrawerOpen(true);
                    }}
                  >
                    <Clock3 className="h-4 w-4" />
                    Open Activity
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          <Card>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-white/45">Sponsor Directory</p>
                <h3 className="mt-2 font-display text-3xl">Browse sponsor records</h3>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
                  Switch between table and grid layouts depending on whether you want dense scanning or cleaner card-based browsing.
                </p>
              </div>
              <div className="flex w-full max-w-2xl flex-col gap-3 xl:items-end">
                <TabsBar
                  items={[
                    { id: "table", label: "Table", icon: <List className="h-4 w-4" /> },
                    { id: "grid", label: "Grid", icon: <LayoutGrid className="h-4 w-4" /> },
                  ]}
                  value={directoryView}
                  onChange={(nextValue) => setDirectoryView(nextValue as DirectoryView)}
                />
                <div className="relative w-full max-w-md">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                  <Input
                    className="pl-11"
                    placeholder="Search company, industry, contact, or notes..."
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
              </div>
            </div>

            {filteredCompanies.length === 0 ? (
              <div className="mt-6 rounded-[26px] border border-dashed border-line bg-white/[0.03] p-8 text-center">
                <Clock3 className="mx-auto h-8 w-8 text-accent" />
                <h4 className="mt-4 font-display text-2xl">No sponsor records available yet</h4>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-white/65">
                  Import the sponsor tracker first, then each sponsor record will appear here for research, drafting, and delivery review.
                </p>
                <Link href="/upload" className={buttonStyles("primary", "mt-6 inline-flex")}>
                  Open Import
                </Link>
              </div>
            ) : (
              <div className="mt-6">
                {directoryView === "table" ? (
                  <CompanyTable companies={filteredCompanies} />
                ) : (
                  <CompanyGrid companies={filteredCompanies} />
                )}
              </div>
            )}
          </Card>
        </>
      )}

      <Modal
        open={briefModalOpen}
        onClose={() => setBriefModalOpen(false)}
        title="Campaign Brief"
        description="This shared brief guides sponsor research and outreach for every record unless a company page overrides it."
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" onClick={handleResetBrief}>
              <RefreshCcw className="h-4 w-4" />
              Reset Brief
            </Button>
            <div className="flex flex-wrap gap-3">
              <Button variant="ghost" onClick={() => setBriefModalOpen(false)}>
                Close
              </Button>
              <Button disabled={activeAction !== null} onClick={() => void handleSaveBrief()}>
                {activeAction === "saveBrief" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {activeAction === "saveBrief" ? "Saving..." : "Save Campaign Brief"}
              </Button>
            </div>
          </div>
        }
      >
        <Textarea
          className="min-h-[360px]"
          placeholder="Describe the program, the audience, the sponsorship ask, the sponsor value, dates, constraints, and what the research should prioritize."
          value={campaignBrief}
          onChange={(event) => setCampaignBrief(event.target.value)}
        />
        <div className="mt-4 rounded-[22px] border border-line bg-white/[0.03] p-4 text-sm leading-7 text-white/60">
          Use this field to describe the IEEE IES UNILAG program, the sponsorship ask, key dates, audience, and any research priorities.
        </div>
      </Modal>

      <Drawer
        open={activityDrawerOpen}
        onClose={() => setActivityDrawerOpen(false)}
        title="Campaign Activity"
        description="Background generation and campaign updates live here so the main dashboard can stay focused on sponsor navigation."
        footer={
          <div className="flex flex-wrap justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge tone="warning">{activeCompanies.length} active</Badge>
              <Badge tone={failedCompanies.length ? "danger" : "muted"}>
                {failedCompanies.length} failed
              </Badge>
            </div>
            <Button
              variant="secondary"
              disabled={activeAction !== null || notifications.length === 0}
              onClick={() => void handleMarkRead()}
            >
              {activeAction === "markRead" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Mark Updates Read
            </Button>
          </div>
        }
      >
        <TabsBar
          items={[
            { id: "queue", label: "Active Runs", icon: <Clock3 className="h-4 w-4" /> },
            {
              id: "notifications",
              label: "Updates",
              icon: <BellRing className="h-4 w-4" />,
            },
          ]}
          value={activityTab}
          onChange={(nextValue) => setActivityTab(nextValue as ActivityTab)}
        />

        {activityTab === "queue" ? (
          <div className="mt-6 space-y-4">
            {activeCompanies.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-line bg-white/[0.03] p-6 text-sm leading-7 text-white/60">
                No background runs are active right now.
              </div>
            ) : (
              activeCompanies.map((company) => <QueueRow key={company.id} company={company} />)
            )}

            {failedCompanies.length ? (
              <details className="rounded-[24px] border border-line bg-white/[0.03] p-4">
                <summary className="cursor-pointer list-none font-medium text-white">
                  Failed companies
                </summary>
                <div className="mt-4 space-y-3">
                  {failedCompanies.map((company) => (
                    <div
                      key={company.id}
                      className="rounded-[18px] border border-danger/20 bg-danger/10 p-4"
                    >
                      <TruncatedText text={company.name} className="font-medium text-white" />
                      {company.generation_error_message ? (
                        <TruncatedText
                          text={company.generation_error_message}
                          lines={2}
                          className="mt-2 text-sm text-danger"
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        ) : null}

        {activityTab === "notifications" ? (
          <div className="mt-6 space-y-3">
            {notifications.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-line bg-white/[0.03] p-6 text-sm leading-7 text-white/60">
                No campaign updates yet.
              </div>
            ) : (
              notifications.map((notification) => (
                <NotificationCard key={notification.id} notification={notification} />
              ))
            )}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
