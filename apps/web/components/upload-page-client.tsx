"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, FileSpreadsheet, Sparkles, WandSparkles } from "lucide-react";

import { ApiError, uploadCompanies } from "@/lib/api";
import type { UploadResponse } from "@/lib/types";
import { Button, Card, Input, Skeleton, SkeletonText, buttonStyles } from "@/components/ui";

function ImportingState() {
  return (
    <Card className="bg-white/[0.04]">
      <p className="text-xs uppercase tracking-[0.28em] text-white/45">Import In Progress</p>
      <h3 className="mt-3 font-display text-3xl">Processing workbook and extracting sponsor records</h3>
      <p className="mt-3 text-sm leading-7 text-white/62">
        Company rows, workbook guidance, and campaign context are being organized into the workspace.
      </p>
      <div className="mt-5 space-y-3">
        <Skeleton className="h-14 w-full rounded-[22px]" />
        <Skeleton className="h-14 w-full rounded-[22px]" />
        <SkeletonText lines={3} />
      </div>
    </Card>
  );
}

export function UploadPageClient() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const previewCompanies = result?.companies.slice(0, 5) ?? [];

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden bg-gradient-to-br from-accent/12 via-white/[0.05] to-accentSoft/10">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.36em] text-accent/80">Prospect Intake</p>
            <h2 className="mt-4 font-display text-4xl leading-tight lg:text-5xl">
              Import the IEEE IES UNILAG sponsor tracker.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/68">
              This parser is tuned for the IEEE IES UNILAG workbook structure, including company rows, notes, status fields, and guidance sheets that can seed your campaign context.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/" className={buttonStyles("secondary")}>
              Back to Dashboard
            </Link>
            <a
              href="#upload-zone"
              className={buttonStyles()}
            >
              Start Import
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card id="upload-zone" className="bg-white/[0.04]">
          <div className="flex items-center gap-4">
            <div className="rounded-[22px] border border-white/10 bg-white/8 p-3 text-accent">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-white/45">Workbook Upload</p>
              <h3 className="mt-2 font-display text-3xl">Upload the sponsor workbook</h3>
            </div>
          </div>

          <div className="mt-6 rounded-[30px] border border-dashed border-line bg-white/[0.03] p-6">
            <Input
              type="file"
              accept=".xlsx"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <div className="mt-4 grid gap-3 text-sm leading-6 text-white/62">
              <p>The uploader expects `.xlsx` and works best with the sponsor tracker columns for company, contact, status, and notes.</p>
              <p>The import does not generate outreach yet. It prepares sponsor records and campaign guidance for the next step.</p>
            </div>
          </div>

          {error ? (
            <div className="mt-6 rounded-[24px] border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
              {error}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              disabled={!file || isUploading}
              onClick={() => {
                if (!file) {
                  return;
                }
                void (async () => {
                  try {
                    setIsUploading(true);
                    setError(null);
                    setResult(null);
                    const payload = await uploadCompanies(file);
                    setResult(payload);
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : "Upload failed.");
                  } finally {
                    setIsUploading(false);
                  }
                })();
              }}
            >
              {isUploading ? "Importing..." : "Import Workbook"}
            </Button>
            {file ? (
              <p className="text-sm text-white/55">{file.name}</p>
            ) : (
              <p className="text-sm text-white/45">No file selected yet.</p>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <p className="text-xs uppercase tracking-[0.28em] text-white/45">Imported Data</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] border border-line bg-white/[0.03] p-5">
                <p className="font-medium text-white">Sponsor records</p>
                <p className="mt-2 text-sm leading-6 text-white/62">
                  Name, website, industry, status, notes, source row, and contact data are normalized into Supabase.
                </p>
              </div>
              <div className="rounded-[24px] border border-line bg-white/[0.03] p-5">
                <p className="font-medium text-white">Workbook guidance</p>
                <p className="mt-2 text-sm leading-6 text-white/62">
                  Banner copy, instructions, and IEEE positioning notes become reusable campaign context.
                </p>
              </div>
            </div>
          </Card>

          {isUploading ? (
            <ImportingState />
          ) : (
            <Card>
              <p className="text-xs uppercase tracking-[0.28em] text-white/45">Next Steps</p>
              <div className="mt-5 space-y-4">
                {[
                  "Refine the campaign brief on the dashboard before generation begins.",
                  "Queue sponsor research for one company or the full list in the background.",
                  "Open any sponsor record to inspect progress, refine the draft, and send outreach.",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-[22px] border border-line bg-white/[0.03] px-4 py-4 text-sm leading-6 text-white/68"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {isUploading ? (
        <Card className="overflow-hidden bg-gradient-to-br from-white/[0.05] via-white/[0.03] to-accentSoft/10">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="mt-4 h-10 w-[420px] max-w-full" />
              <SkeletonText className="mt-4" lines={2} />
            </div>
            <Skeleton className="h-11 w-44 rounded-full" />
          </div>
          <div className="mt-8 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <Card className="bg-white/[0.03] p-5">
              <Skeleton className="h-3 w-32" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={`preview-${index}`} className="h-16 w-full rounded-[20px]" />
                ))}
              </div>
            </Card>
            <Card className="bg-white/[0.03] p-5">
              <Skeleton className="h-3 w-36" />
              <Skeleton className="mt-4 h-6 w-52 max-w-full" />
              <SkeletonText className="mt-4" lines={4} />
            </Card>
          </div>
        </Card>
      ) : null}

      {result ? (
        <Card className="overflow-hidden bg-gradient-to-br from-white/[0.05] via-white/[0.03] to-accentSoft/10">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.32em] text-accent/80">Import Completed</p>
              <h3 className="mt-3 font-display text-4xl">
                {result.imported} compan{result.imported === 1 ? "y" : "ies"} are ready for outreach.
              </h3>
              <p className="mt-4 text-sm leading-7 text-white/65">
                Continue to the dashboard to finalize the campaign brief and queue sponsor research.
              </p>
            </div>

            <Link href="/" className={buttonStyles()}>
              Open Dashboard
              <WandSparkles className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-8 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[28px] border border-line bg-white/[0.03] p-5">
              <p className="text-xs uppercase tracking-[0.28em] text-white/45">Imported Companies</p>
              <div className="mt-4 space-y-3">
                {previewCompanies.map((company) => (
                  <div
                    key={company.id}
                    className="rounded-[20px] border border-line/80 bg-white/[0.03] px-4 py-3"
                  >
                    <p className="font-medium text-white">{company.name}</p>
                    <p className="mt-1 text-sm text-white/55">
                      {company.industry ?? "Unspecified industry"}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {result.tracker_summary ? (
              <div className="rounded-[28px] border border-line bg-white/[0.03] p-5">
                <p className="text-xs uppercase tracking-[0.28em] text-white/45">Workbook Guidance</p>
                <h4 className="mt-3 text-lg font-semibold text-white">
                  {result.tracker_summary.banner ?? "Workbook guidance found"}
                </h4>
                {result.tracker_summary.context_line ? (
                  <p className="mt-3 text-sm leading-7 text-white/68">
                    {result.tracker_summary.context_line}
                  </p>
                ) : null}
                {result.tracker_summary.instructions.length ? (
                  <div className="mt-4 space-y-2">
                    {result.tracker_summary.instructions.slice(0, 4).map((instruction) => (
                      <div
                        key={instruction}
                        className="rounded-[18px] border border-line bg-white/[0.03] px-3 py-3 text-sm leading-6 text-white/68"
                      >
                        {instruction}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-[18px] border border-line bg-white/[0.03] px-3 py-3 text-sm leading-6 text-white/60">
                    No additional tracker instructions were detected.
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-[28px] border border-line bg-white/[0.03] p-5">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-4 w-4 text-accent" />
                  <p className="font-medium text-white">No workbook guidance detected</p>
                </div>
                <p className="mt-4 text-sm leading-7 text-white/62">
                  That is fine. You can still define the campaign brief manually from the dashboard before generation starts.
                </p>
              </div>
            )}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
