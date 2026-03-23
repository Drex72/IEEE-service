"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { MailCheck, RefreshCcw, ShieldCheck, SendHorizonal } from "lucide-react";

import { ApiError, getGmailAuthUrl, getGmailStatus } from "@/lib/api";
import type { GmailStatusResponse } from "@/lib/types";
import { Badge, Button, Card } from "@/components/ui";

export function GmailSettingsClient() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<GmailStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function refreshStatus() {
    try {
      const payload = await getGmailStatus();
      setStatus(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load Gmail status.");
    }
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
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
            <p className="text-xs uppercase tracking-[0.36em] text-accent/80">Mailbox Setup</p>
            <h2 className="mt-4 font-display text-4xl leading-tight lg:text-5xl">
              Connect Gmail once, then keep sending inside the workspace.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/68">
              Delivery setup lives on its own page now, so the rest of the outreach workflow stays focused on research and drafting.
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

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <div className="flex items-center gap-4">
            <div className="rounded-[22px] border border-white/10 bg-white/8 p-3 text-accent">
              <SendHorizonal className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-white/45">Connection</p>
              <h3 className="mt-2 font-display text-3xl">
                {status?.connected ? "Mailbox ready" : "Authorize the sender"}
              </h3>
            </div>
          </div>

          <div className="mt-6 rounded-[28px] border border-line bg-white/[0.03] p-5">
            <p className="text-sm leading-7 text-white/68">
              {status?.connected
                ? `Emails can now be sent as ${status.email}.`
                : "Authorize Gmail to unlock send actions from each company workspace and log delivery back into Supabase."}
            </p>
            {status?.connected_at ? (
              <p className="mt-3 text-sm text-white/45">
                Last updated: {new Date(status.connected_at).toLocaleString()}
              </p>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              disabled={isPending || status?.configured === false}
              onClick={() =>
                startTransition(() => {
                  void (async () => {
                    try {
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
                    }
                  })();
                })
              }
            >
              {status?.connected ? "Reconnect Gmail" : "Connect Gmail"}
            </Button>
            <Button variant="secondary" onClick={() => void refreshStatus()}>
              <RefreshCcw className="h-4 w-4" />
              Refresh status
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
                <h3 className="mt-2 font-display text-3xl">Requested scopes stay tight</h3>
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
            <p className="text-xs uppercase tracking-[0.28em] text-white/45">How It Fits</p>
            <div className="mt-5 space-y-3 text-sm leading-7 text-white/68">
              <p>Drafting stays on the company page. Delivery setup stays here.</p>
              <p>Once connected, every company workspace can send from the same mailbox without sending you back through setup.</p>
              <p>If you disconnect or rotate credentials later, this page is the one place to verify status again.</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
