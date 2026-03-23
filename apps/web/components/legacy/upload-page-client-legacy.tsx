"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { FileSpreadsheet, Sparkles } from "lucide-react";

import { ApiError, uploadCompanies } from "@/lib/api";
import type { UploadResponse } from "@/lib/types";
import { Button, Card, Input, buttonStyles } from "@/components/ui";

export function UploadPageClient() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-br from-accent/15 via-white/[0.05] to-white/[0.04]">
        <p className="text-xs uppercase tracking-[0.36em] text-accent/80">Upload</p>
        <h2 className="mt-4 font-display text-4xl">Bring in the sponsorship tracker</h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/70">
          The parser is tailored to the provided IES UNILAG workbook format. It reads the
          company sheet, preserves the notes column, and surfaces the instructions sheet as
          campaign context.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/10 p-3 text-accent">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-2xl">Tracker import</h3>
              <p className="text-sm text-white/60">Accepts `.xlsx` sponsor tracker files.</p>
            </div>
          </div>

          <div className="mt-6 rounded-[28px] border border-dashed border-line bg-white/[0.03] p-6">
            <Input
              type="file"
              accept=".xlsx"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <p className="mt-3 text-sm text-white/55">
              Best results come from the tracker format with `Company`, `Contact / Email`,
              `Status`, and `Notes` columns.
            </p>
          </div>

          {error ? (
            <div className="mt-6 rounded-3xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
              {error}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              disabled={!file || isPending}
              onClick={() =>
                startTransition(() => {
                  if (!file) {
                    return;
                  }
                  void (async () => {
                    try {
                      setError(null);
                      const payload = await uploadCompanies(file);
                      setResult(payload);
                    } catch (err) {
                      setError(err instanceof ApiError ? err.message : "Upload failed.");
                    }
                  })();
                })
              }
            >
              {isPending ? "Uploading..." : "Upload and Parse"}
            </Button>
            <Link href="/" className={buttonStyles("secondary")}>
              Back to dashboard
            </Link>
          </div>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-[0.32em] text-white/45">What happens next</p>
          <ul className="mt-5 space-y-4 text-sm leading-7 text-white/70">
            <li>1. Companies are normalized and stored in Supabase.</li>
            <li>2. Each row keeps tier, contact route, notes, and source row metadata.</li>
            <li>3. The AI pipeline can then research and generate a tailored sponsorship ask.</li>
            <li>4. Gmail send is available once OAuth is connected.</li>
          </ul>
        </Card>
      </div>

      {result ? (
        <Card>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-accent/80">Imported</p>
              <h3 className="mt-2 font-display text-3xl">{result.imported} companies ready</h3>
              <p className="mt-3 text-sm text-white/65">
                Head back to the dashboard to generate drafts company by company.
              </p>
            </div>
            <Link href="/" className={buttonStyles()}>
              Open Dashboard
              <Sparkles className="h-4 w-4" />
            </Link>
          </div>

          {result.tracker_summary ? (
            <div className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-[28px] border border-line bg-white/[0.03] p-5">
                <p className="text-xs uppercase tracking-[0.28em] text-white/45">
                  Tracker context
                </p>
                <h4 className="mt-3 text-lg font-semibold text-white">
                  {result.tracker_summary.banner}
                </h4>
                <p className="mt-3 text-sm leading-7 text-white/70">
                  {result.tracker_summary.context_line}
                </p>
                {result.tracker_summary.instructions.length ? (
                  <ul className="mt-4 space-y-3 text-sm leading-7 text-white/70">
                    {result.tracker_summary.instructions.map((instruction) => (
                      <li key={instruction}>{instruction}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="rounded-[28px] border border-line bg-white/[0.03] p-5">
                <p className="text-xs uppercase tracking-[0.28em] text-white/45">Angles</p>
                <p className="mt-4 text-sm leading-7 text-white/70">
                  {result.tracker_summary.ieee_angle ?? "No IEEE angle was detected in the sheet."}
                </p>
                <p className="mt-4 text-sm leading-7 text-white/70">
                  {result.tracker_summary.tier_guide ?? "No tier guide was detected in the sheet."}
                </p>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
