"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  CircuitBoard,
  LayoutDashboard,
  MailPlus,
  Sparkles,
  Upload,
} from "lucide-react";

import { buttonStyles, Card } from "@/components/ui";
import { cn } from "@/lib/utils";

const navigation = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    description: "Campaign brief, live queue, and company navigation.",
  },
  {
    href: "/upload",
    label: "Upload",
    icon: Upload,
    description: "Bring in a fresh sponsor tracker and parse it into the workspace.",
  },
  {
    href: "/settings/gmail",
    label: "Gmail",
    icon: MailPlus,
    description: "Connect the sending mailbox and confirm delivery readiness.",
  },
];

function pageMeta(pathname: string) {
  if (pathname === "/") {
    return {
      eyebrow: "Control Room",
      title: "Coordinate research, drafts, and delivery from one place.",
      description:
        "The refined layout keeps the critical actions visible and moves the navigation friction out of the way.",
    };
  }

  if (pathname.startsWith("/upload")) {
    return {
      eyebrow: "Import",
      title: "Bring the sponsor tracker in cleanly.",
      description:
        "Upload is now treated like a setup step, with guidance and next steps beside the import action.",
    };
  }

  if (pathname.startsWith("/settings/gmail")) {
    return {
      eyebrow: "Delivery",
      title: "Keep mailbox setup separate from campaign work.",
      description:
        "Connection details stay easy to find without crowding the rest of the workspace.",
    };
  }

  if (pathname.startsWith("/companies/")) {
    return {
      eyebrow: "Company Workspace",
      title: "One company, one focused workspace.",
      description:
        "The company page now splits profile, research progress, drafting, and delivery into clearer working zones.",
    };
  }

  return {
    eyebrow: "Workspace",
    title: "AI-powered sponsorship operations.",
    description:
      "Upload, research, draft, and send without bouncing between disconnected screens.",
  };
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const meta = pageMeta(pathname);

  return (
    <div className="min-h-screen bg-canvas text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,181,71,0.12),transparent_22%),radial-gradient(circle_at_top_right,rgba(24,213,180,0.14),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_22%)]" />
      <div className="pointer-events-none fixed inset-0 bg-grid [background-size:28px_28px] opacity-[0.06]" />

      <header className="sticky top-0 z-30 border-b border-line/10 bg-canvas/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-5 px-4 py-4 lg:px-8 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/6 text-accent shadow-halo">
                <CircuitBoard className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.34em] text-white/40">
                  IEEE IES UNILAG
                </p>
                <h1 className="font-display text-2xl">Sponsorship Engine</h1>
              </div>
            </Link>

            <div className="hidden min-[940px]:flex items-center gap-2 rounded-full border border-line/15 bg-white/[0.04] p-1.5">
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
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-accent/20 bg-accent/10 px-4 py-2 text-xs uppercase tracking-[0.28em] text-accent/80">
              Refined Layout
            </div>
            <Link href="/upload" className={buttonStyles("secondary")}>
              Upload Tracker
            </Link>
            <Link href="/" className={buttonStyles()}>
              Open Dashboard
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-[1600px] px-4 py-6 lg:px-8">
        <div className="grid gap-6 xl:grid-cols-[290px_minmax(0,1fr)]">
          <aside className="hidden xl:block">
            <div className="sticky top-[104px] space-y-4">
              <Card className="bg-white/[0.05]">
                <p className="text-xs uppercase tracking-[0.32em] text-accent/70">
                  {meta.eyebrow}
                </p>
                <h2 className="mt-4 font-display text-3xl leading-tight">{meta.title}</h2>
                <p className="mt-4 text-sm leading-7 text-white/65">{meta.description}</p>
              </Card>

              <Card className="bg-white/[0.04]">
                <p className="text-xs uppercase tracking-[0.28em] text-white/45">Workspace Map</p>
                <div className="mt-5 space-y-3">
                  {navigation.map((item) => {
                    const Icon = item.icon;
                    const active =
                      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-start gap-3 rounded-[22px] border px-4 py-4 transition",
                          active
                            ? "border-accent/30 bg-accent/10"
                            : "border-line bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
                        )}
                      >
                        <div
                          className={cn(
                            "mt-0.5 rounded-2xl p-2",
                            active ? "bg-accent text-slate-950" : "bg-white/8 text-white/70",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium text-white">{item.label}</p>
                          <p className="mt-1 text-sm leading-6 text-white/55">
                            {item.description}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </Card>

              <Card className="bg-gradient-to-br from-accent/10 via-white/[0.04] to-accentSoft/10">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-white/10 p-2 text-accent">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-medium text-white">Revert Path</p>
                </div>
                <p className="mt-4 text-sm leading-7 text-white/65">
                  The previous interface is preserved as a legacy variant. Switch
                  `NEXT_PUBLIC_LAYOUT_VARIANT=legacy` if you want the old layout back.
                </p>
              </Card>
            </div>
          </aside>

          <main className="min-w-0 space-y-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
