"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MailCheck, RefreshCcw, ShieldCheck, SendHorizonal } from "lucide-react";

import { ApiError, getGmailAuthUrl, getGmailStatus } from "@/lib/api";
import type { GmailStatusResponse } from "@/lib/types";
import { Badge, Button, Card, Skeleton, SkeletonText } from "@/components/ui";

function GmailSettingsSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <Card>
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-[22px]" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-8 w-56 max-w-full" />
          </div>
        </div>

        <div className="mt-6 rounded-[28px] border border-line bg-white/[0.03] p-5">
          <SkeletonText lines={3} />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Skeleton className="h-11 w-36 rounded-full" />
          <Skeleton className="h-11 w-36 rounded-full" />
        </div>
      </Card>

      <div className="space-y-6">
        <Card>
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 rounded-[22px]" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-8 w-60 max-w-full" />
            </div>
          </div>
          <div className="mt-6 grid gap-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={`scope-${index}`} className="h-16 w-full rounded-[20px]" />
            ))}
          </div>
        </Card>

        <Card>
          <Skeleton className="h-3 w-28" />
          <SkeletonText className="mt-5" lines={3} />
        </Card>
      </div>
    </div>
  );
}

export function GmailSettingsClient() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<GmailStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  async function refreshStatus() {
    try {
      setIsRefreshing(true);
      const payload = await getGmailStatus();
      setStatus(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load Gmail status.");
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        setIsLoadingStatus(true);
        const payload = await getGmailStatus();
        if (!active) {
          return;
        }
        setStatus(payload);
        setError(null);
      } catch (err) {
        if (!active) {
          return;
        }
        setError(err instanceof ApiError ? err.message : "Could not load Gmail status.");
      } finally {
        if (active) {
          setIsLoadingStatus(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const callbackStatus = searchParams.get("status");
  const connectedEmail = searchParams.get("email");

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden bg-gradient-to-br from-white/[0.08] via-white/[0.04] to-accent/12">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.36em] text-accent/80">Mailbox Administration</p>
            <h2 className="mt-4 font-display text-4xl leading-tight lg:text-5xl">
              Authorize the campaign mailbox for sponsor outreach.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/68">
              Mailbox setup is handled separately so the rest of the workflow can stay focused on sponsor research and draft review.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Badge tone={status?.connected ? "success" : "muted"}>
              {status?.connected ? "Connected" : "Not connected"}
            </Badge>
            <Badge tone={status?.configured === false ? "warning" : "success"}>
              {status?.configured === false ? "OAuth missing" : "OAuth configured"}
            </Badge>
          </div>
        </div>
      </Card>

      {callbackStatus === "connected" ? (
        <Card className="border-success/30 bg-success/10">
          <div className="flex items-center gap-3">
            <MailCheck className="h-5 w-5 text-success" />
            <p className="text-sm text-success">
              Gmail connected successfully{connectedEmail ? ` for ${connectedEmail}` : ""}.
            </p>
          </div>
        </Card>
      ) : null}

      {error ? (
        <Card className="border-danger/30 bg-danger/10 text-sm text-danger">{error}</Card>
      ) : null}

      {isLoadingStatus && !status ? (
        <GmailSettingsSkeleton />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <Card>
            <div className="flex items-center gap-4">
              <div className="rounded-[22px] border border-white/10 bg-white/8 p-3 text-accent">
                <SendHorizonal className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-white/45">Mailbox Status</p>
                <h3 className="mt-2 font-display text-3xl">
                  {status?.connected ? "Mailbox ready" : "Authorize the campaign mailbox"}
                </h3>
              </div>
            </div>

            <div className="mt-6 rounded-[28px] border border-line bg-white/[0.03] p-5">
              <p className="text-sm leading-7 text-white/68">
                {status?.connected
                  ? `Emails can now be sent as ${status.email}.`
                  : "Authorize Gmail to unlock send actions from each sponsor record and log delivery back into Supabase."}
              </p>
              {status?.connected_at ? (
                <p className="mt-3 text-sm text-white/45">
                  Last updated: {new Date(status.connected_at).toLocaleString()}
                </p>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                disabled={isConnecting || status?.configured === false}
                onClick={() => {
                  void (async () => {
                    try {
                      setIsConnecting(true);
                      const payload = await getGmailAuthUrl(
                        `${window.location.origin}/settings/gmail`,
                      );
                      window.location.href = payload.url;
                    } catch (err) {
                      setError(
                        err instanceof ApiError
                          ? err.message
                          : "Could not start Gmail OAuth.",
                      );
                      setIsConnecting(false);
                    }
                  })();
                }}
              >
                {isConnecting
                  ? "Opening OAuth..."
                  : status?.connected
                    ? "Reconnect Gmail"
                    : "Connect Gmail"}
              </Button>
              <Button variant="secondary" onClick={() => void refreshStatus()} disabled={isRefreshing}>
                <RefreshCcw className={isRefreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                {isRefreshing ? "Refreshing..." : "Refresh status"}
              </Button>
            </div>

            {status?.configured === false ? (
              <div className="mt-6 rounded-[24px] border border-warning/30 bg-warning/10 p-4 text-sm leading-6 text-warning">
                Gmail OAuth credentials are not configured in the backend environment yet.
              </div>
            ) : null}
          </Card>

          <div className="space-y-6">
            <Card>
              <div className="flex items-center gap-4">
                <div className="rounded-[22px] border border-accent/20 bg-accent/10 p-3 text-accent">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-white/45">Security</p>
                  <h3 className="mt-2 font-display text-3xl">Access remains limited</h3>
                </div>
              </div>

              <div className="mt-6 grid gap-3">
                {[
                  "gmail.send for outbound delivery only",
                  "userinfo.email and openid to label the connected account",
                  "Encrypted token storage through the API backend",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-[20px] border border-line bg-white/[0.03] px-4 py-4 text-sm leading-6 text-white/68"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <p className="text-xs uppercase tracking-[0.28em] text-white/45">Operational Notes</p>
              <div className="mt-5 space-y-3 text-sm leading-7 text-white/68">
                <p>Draft review stays on each sponsor record. Mailbox administration stays here.</p>
                <p>Once connected, every sponsor record can send from the same mailbox without routing you back through setup.</p>
                <p>If you rotate credentials later, return here to confirm connection status before sending again.</p>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
