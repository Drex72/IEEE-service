"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { MailCheck, ShieldCheck } from "lucide-react";

import { ApiError, getGmailAuthUrl, getGmailStatus } from "@/lib/api";
import type { GmailStatusResponse } from "@/lib/types";
import { Button, Card } from "@/components/ui";

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
      <Card className="bg-gradient-to-br from-white/[0.08] via-white/[0.04] to-accent/10">
        <p className="text-xs uppercase tracking-[0.36em] text-accent/80">Delivery</p>
        <h2 className="mt-4 font-display text-4xl">Connect Gmail once, send from the app</h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/70">
          OAuth runs server-side, tokens are stored encrypted, and sends are logged back to
          Supabase for status tracking.
        </p>
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

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <p className="text-xs uppercase tracking-[0.32em] text-white/45">Connection status</p>
          <h3 className="mt-3 font-display text-3xl">
            {status?.connected ? "Connected" : "Not connected"}
          </h3>
          <p className="mt-3 text-sm leading-7 text-white/70">
            {status?.connected
              ? `Ready to send as ${status.email}.`
              : "Authorize Gmail to enable sending, logging, and follow-up operations."}
          </p>

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
              Refresh status
            </Button>
          </div>

          {status?.configured === false ? (
            <p className="mt-4 text-sm text-warning">
              Gmail OAuth credentials are not configured in the backend environment yet.
            </p>
          ) : null}
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-accent/10 p-3 text-accent">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-2xl">Scopes requested</h3>
              <p className="text-sm text-white/60">Minimal access for sending and identifying the connected mailbox.</p>
            </div>
          </div>

          <ul className="mt-6 space-y-4 text-sm leading-7 text-white/70">
            <li>gmail.send for outbound mail delivery</li>
            <li>userinfo.email and openid to label the connected account</li>
            <li>Encrypted token storage in Supabase via the API backend</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
