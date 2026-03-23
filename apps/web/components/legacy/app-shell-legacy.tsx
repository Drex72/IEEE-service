"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircuitBoard, MailPlus, PanelLeft, Upload } from "lucide-react";

import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", label: "Dashboard", icon: PanelLeft },
  { href: "/upload", label: "Upload Tracker", icon: Upload },
  { href: "/settings/gmail", label: "Gmail", icon: MailPlus },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-canvas text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,181,71,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(24,213,180,0.12),transparent_34%)]" />
      <div className="pointer-events-none fixed inset-0 bg-grid [background-size:26px_26px] opacity-[0.08]" />
      <div className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-6 px-4 py-6 lg:flex-row lg:px-8">
        <aside className="w-full rounded-[32px] border border-line/70 bg-slate-950/70 p-6 shadow-halo backdrop-blur lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:w-[320px]">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/90 text-slate-950">
              <CircuitBoard className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-white/45">
                IEEE IES UNILAG
              </p>
              <h1 className="font-display text-2xl">Sponsorship Engine</h1>
            </div>
          </div>

          <p className="mt-6 max-w-sm text-sm leading-6 text-white/65">
            Upload the sponsor tracker, let the AI research each company, tune the outreach,
            and send from Gmail without leaving the workspace.
          </p>

          <nav className="mt-8 space-y-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === "/"
                  ? pathname === item.href
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition",
                    active
                      ? "bg-white text-slate-950"
                      : "bg-white/0 text-white/70 hover:bg-white/8 hover:text-white",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 rounded-[24px] border border-accent/25 bg-accent/10 p-5">
            <p className="text-xs uppercase tracking-[0.32em] text-accent/70">
              Why this build
            </p>
            <p className="mt-3 text-sm leading-6 text-white/75">
              Tuned for hardware sponsorship asks: engineering credibility, recruiting value,
              and real alignment instead of generic fundraising copy.
            </p>
          </div>
        </aside>

        <main className="w-full flex-1">{children}</main>
      </div>
    </div>
  );
}
