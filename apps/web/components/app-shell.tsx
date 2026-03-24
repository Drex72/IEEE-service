"use client";

import { type ReactNode, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUpRight,
  CircuitBoard,
  LayoutDashboard,
  LoaderCircle,
  MailPlus,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
  Upload,
} from "lucide-react";

import { ApiError, resetWorkspace } from "@/lib/api";
import { Button, Card, Modal, TruncatedText, buttonStyles } from "@/components/ui";
import { cn } from "@/lib/utils";

const SIDEBAR_STORAGE_KEY = "ieee-sponsorship-sidebar-collapsed";
const SIDEBAR_STORAGE_EVENT = "ieee-sponsorship-sidebar-storage";

const navigation = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    helper: "Monitor sponsor research, draft readiness, and campaign activity.",
  },
  {
    href: "/upload",
    label: "Prospects",
    icon: Upload,
    helper: "Import sponsor records from the IEEE IES UNILAG workbook.",
  },
  {
    href: "/settings/gmail",
    label: "Mailbox",
    icon: MailPlus,
    helper: "Authorize the outreach mailbox and confirm send readiness.",
  },
];

function pageMeta(pathname: string) {
  if (pathname === "/") {
    return {
      eyebrow: "Campaign Dashboard",
      title: "Coordinate sponsor research and outreach for IEEE IES UNILAG.",
      description:
        "Review the campaign brief, monitor generation activity, and move across sponsor records from one operating surface.",
    };
  }

  if (pathname.startsWith("/upload")) {
    return {
      eyebrow: "Prospect Intake",
      title: "Import sponsor prospects from the IEEE IES UNILAG tracker.",
      description:
        "Load the workbook, validate company records, and prepare the campaign dataset for research and outreach.",
    };
  }

  if (pathname.startsWith("/settings/gmail")) {
    return {
      eyebrow: "Mailbox Administration",
      title: "Prepare the outreach mailbox for sponsor delivery.",
      description:
        "Manage Gmail authorization separately so sponsor research and draft review remain focused.",
    };
  }

  if (pathname.startsWith("/companies/")) {
    return {
      eyebrow: "Sponsor Record",
      title: "Review research, refine outreach, and prepare delivery.",
      description:
        "Use each sponsor record to review research progress, sharpen the message, and prepare the final outreach draft.",
    };
  }

  return {
    eyebrow: "Operations",
    title: "IEEE IES UNILAG sponsorship operations.",
    description:
      "Import, research, draft, and send without losing context.",
  };
}

function SidebarLink({
  href,
  label,
  helper,
  icon: Icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  helper: string;
  icon: typeof LayoutDashboard;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={label}
      className={cn(
        "group flex items-center gap-3 rounded-[22px] border px-3 py-3 transition duration-300",
        active
          ? "border-white/15 bg-white text-slate-950 shadow-lg shadow-white/10"
          : "border-white/6 bg-white/[0.03] text-white/72 hover:border-white/15 hover:bg-white/[0.08] hover:text-white",
        collapsed && "justify-center px-2",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition",
          active ? "bg-slate-950/8 text-slate-950" : "bg-white/[0.06] text-accent",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div
        className={cn(
          "min-w-0 overflow-hidden transition-[max-width,opacity,transform] duration-300",
          collapsed ? "max-w-0 -translate-x-2 opacity-0" : "max-w-[220px] opacity-100",
        )}
      >
        <p className="truncate text-sm font-semibold">{label}</p>
        <p
          className={cn(
            "mt-1 truncate text-xs",
            active ? "text-slate-900/70" : "text-white/42",
          )}
        >
          {helper}
        </p>
      </div>
    </Link>
  );
}

function subscribeSidebarPreference(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === SIDEBAR_STORAGE_KEY) {
      onStoreChange();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(SIDEBAR_STORAGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(SIDEBAR_STORAGE_EVENT, onStoreChange);
  };
}

function getSidebarSnapshot() {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
}

function notifySidebarPreferenceChange() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(SIDEBAR_STORAGE_EVENT));
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const meta = pageMeta(pathname);
  const sidebarCollapsed = useSyncExternalStore(
    subscribeSidebarPreference,
    getSidebarSnapshot,
    () => false,
  );
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  function handleToggleSidebar() {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      SIDEBAR_STORAGE_KEY,
      sidebarCollapsed ? "false" : "true",
    );
    notifySidebarPreferenceChange();
  }

  async function handleResetWorkspace() {
    try {
      setResetPending(true);
      setResetError(null);
      await resetWorkspace();
      setResetModalOpen(false);
      router.push("/");
      if (typeof window !== "undefined") {
        window.location.assign("/");
      }
    } catch (error) {
      setResetError(
        error instanceof ApiError ? error.message : "Could not reset the workspace.",
      );
    } finally {
      setResetPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,181,71,0.12),transparent_22%),radial-gradient(circle_at_top_right,rgba(24,213,180,0.14),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_22%)]" />
      <div className="pointer-events-none fixed inset-0 bg-grid [background-size:28px_28px] opacity-[0.05]" />

      <div className="relative mx-auto flex max-w-[1720px] gap-4 px-3 py-4 lg:px-6">
        <aside
          className={cn(
            "hidden lg:flex lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:shrink-0 lg:flex-col lg:overflow-hidden lg:rounded-[34px] lg:border lg:border-line/70 lg:bg-card/90 lg:p-4 lg:shadow-halo lg:backdrop-blur-xl lg:transition-[width,padding] lg:duration-300",
            sidebarCollapsed ? "lg:w-[104px]" : "lg:w-[320px]",
          )}
        >
          <div className={cn("flex items-start gap-3", sidebarCollapsed ? "justify-center" : "justify-between")}>
            <Link
              href="/"
              className={cn(
                "flex min-w-0 items-center gap-3",
                sidebarCollapsed && "justify-center",
              )}
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/6 text-accent shadow-halo">
                <CircuitBoard className="h-5 w-5" />
              </div>
              <div
                className={cn(
                  "min-w-0 overflow-hidden transition-[max-width,opacity,transform] duration-300",
                  sidebarCollapsed ? "max-w-0 -translate-x-2 opacity-0" : "max-w-[180px] opacity-100",
                )}
              >
                <p className="text-xs uppercase tracking-[0.34em] text-white/40">
                  IEEE IES UNILAG
                </p>
                <TruncatedText
                  text="Sponsorship Desk"
                  className="font-display text-2xl text-white"
                />
              </div>
            </Link>

            <button
              type="button"
              onClick={handleToggleSidebar}
              className="rounded-full border border-line bg-white/[0.04] p-2 text-white/70 transition hover:bg-white/[0.08] hover:text-white"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </div>

          <div className="mt-6 flex-1 space-y-2 overflow-y-auto pr-1">
            {navigation.map((item) => (
              <SidebarLink
                key={item.href}
                href={item.href}
                label={item.label}
                helper={item.helper}
                icon={item.icon}
                collapsed={sidebarCollapsed}
                active={
                  item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
                }
              />
            ))}
          </div>

          <div className="mt-6 space-y-3">
              <Link
                href="/upload"
                className={cn(
                  buttonStyles("secondary", "w-full justify-center"),
                  sidebarCollapsed && "px-0",
                )}
                title="Import Sponsor Workbook"
              >
                <Upload className="h-4 w-4" />
                <span
                  className={cn(
                    "overflow-hidden transition-[max-width,opacity] duration-300",
                    sidebarCollapsed ? "max-w-0 opacity-0" : "max-w-[120px] opacity-100",
                  )}
                >
                  Import Tracker
                </span>
              </Link>

            <Button
              variant="ghost"
              className={cn("w-full justify-center", sidebarCollapsed && "px-0")}
              onClick={() => {
                setResetError(null);
                setResetModalOpen(true);
              }}
              title="Reset workspace"
            >
              <Trash2 className="h-4 w-4" />
              <span
                className={cn(
                  "overflow-hidden transition-[max-width,opacity] duration-300",
                  sidebarCollapsed ? "max-w-0 opacity-0" : "max-w-[120px] opacity-100",
                )}
              >
                Reset Workspace
              </span>
            </Button>

            <Card
              className={cn(
                "overflow-hidden border-white/10 bg-white/[0.04] p-4",
                sidebarCollapsed && "px-3",
              )}
            >
              <p
                className={cn(
                  "text-xs uppercase tracking-[0.28em] text-accent/80 transition-opacity duration-300",
                  sidebarCollapsed && "text-center",
                )}
              >
                {sidebarCollapsed ? meta.eyebrow.slice(0, 1) : meta.eyebrow}
              </p>
              <div
                className={cn(
                  "overflow-hidden transition-[max-height,opacity,transform] duration-300",
                  sidebarCollapsed ? "max-h-0 opacity-0" : "mt-3 max-h-48 opacity-100",
                )}
              >
                <p className="font-display text-2xl leading-tight text-white">{meta.title}</p>
                <p className="mt-2 text-sm leading-6 text-white/58">{meta.description}</p>
              </div>
            </Card>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border border-line/10 bg-canvas/82 px-4 py-4 backdrop-blur-xl lg:hidden">
            <div className="flex flex-col gap-4">
              <div className="flex min-w-0 items-center justify-between gap-4">
                <Link href="/" className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/6 text-accent shadow-halo">
                    <CircuitBoard className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.34em] text-white/40">
                      IEEE IES UNILAG
                    </p>
                    <TruncatedText
                      text="Sponsorship Desk"
                      className="font-display text-2xl text-white"
                    />
                  </div>
                </Link>

                <Link href="/upload" className={buttonStyles("secondary", "shrink-0")}>
                  Import
                </Link>
              </div>

              <nav className="flex flex-wrap items-center gap-2 rounded-full border border-line/15 bg-white/[0.04] p-1.5">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  const active =
                    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition",
                        active
                          ? "bg-white text-slate-950"
                          : "text-white/65 hover:bg-white/10 hover:text-white",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </header>

          <div className="relative py-4 lg:py-0">
            <Card className="mb-6 overflow-hidden bg-white/[0.04] py-5">
              <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)] xl:items-center">
                <div>
                  <p className="text-xs uppercase tracking-[0.32em] text-accent/80">
                    {meta.eyebrow}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="font-display text-3xl leading-tight text-white">{meta.title}</p>
                  <p className="mt-2 text-sm leading-6 text-white/60">{meta.description}</p>
                </div>
              </div>
            </Card>

            <div className="mb-6 hidden items-center justify-end gap-3 lg:flex">
              <Link href="/upload" className={buttonStyles("secondary")}>
                Import Tracker
              </Link>
              <Link href="/" className={buttonStyles()}>
                Open Dashboard
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>

            <main className="min-w-0">{children}</main>
          </div>
        </div>
      </div>

      <Modal
        open={resetModalOpen}
        title="Reset Current Workspace"
        description="This clears the current owner workspace, including companies, contacts, drafts, queue history, notifications, campaign brief, and connected Gmail state."
        onClose={() => {
          if (!resetPending) {
            setResetModalOpen(false);
          }
        }}
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              variant="secondary"
              disabled={resetPending}
              onClick={() => setResetModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={resetPending}
              onClick={() => void handleResetWorkspace()}
            >
              {resetPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {resetPending ? "Resetting..." : "Clear Workspace"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-[22px] border border-danger/30 bg-danger/10 p-4 text-sm leading-7 text-danger">
            This action is destructive. It removes the current workspace data so you can start from a clean set.
          </div>
          <div className="rounded-[22px] border border-line bg-white/[0.03] p-4 text-sm leading-7 text-white/68">
            If background generation is still queued or running, the reset will be blocked until those jobs finish.
          </div>
          {resetError ? (
            <div className="rounded-[22px] border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
              {resetError}
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
