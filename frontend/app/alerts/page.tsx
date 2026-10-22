import { redirect } from "next/navigation"
import Link from "next/link"
import { getCurrentUser } from "@/lib/auth"
import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { SeverityBadge } from "@/components/severity-badge"
import { RelativeTime } from "@/components/relative-time"
import { AlertTestButton } from "@/components/alert-test-button"
import { getAlerts } from "@/app/actions/crisis"
import { BellRing, CheckCircle2, ExternalLink, Info, Mail } from "lucide-react"

export default async function AlertsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")

  const { items, telegramConfigured, emailConfigured, emailRecipientCount, minLevel } = await getAlerts()
  const anyChannel = telegramConfigured || emailConfigured

  return (
    <AppShell userName={user.name || user.email || "Operator"}>
      <div className="mx-auto flex max-w-4xl flex-col gap-5 p-4 md:p-6">
        <PageHeader
          title="Alerts"
          description="Orange and Red incidents that are still active, and which notification channels each one has been sent through. Sending is automatic: new alerts go out within minutes of being detected."
        />

        <div className="grid gap-5 md:grid-cols-2">
          <Card className="gap-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <BellRing className="h-4 w-4 text-primary" />
                  Telegram
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {telegramConfigured
                    ? `Connected. ${minLevel} alerts are sent automatically, once each.`
                    : "Not set up yet."}
                </p>
              </div>
              <AlertTestButton channel="telegram" disabled={!telegramConfigured} />
            </div>
            {!telegramConfigured && (
              <ol className="ml-5 flex list-decimal flex-col gap-1 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                <li>In Telegram, open a chat with @BotFather, send /newbot and copy the token it gives you.</li>
                <li>Open a chat with your new bot and send it any message, for example &quot;hi&quot;.</li>
                <li>
                  In a browser, open https://api.telegram.org/bot&lt;your token&gt;/getUpdates and copy the number after
                  &quot;chat&quot;:&#123;&quot;id&quot;:
                </li>
                <li>
                  Put TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in your backend settings (.env locally, environment
                  variables when deployed), then restart the backend.
                </li>
              </ol>
            )}
          </Card>

          <Card className="gap-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Mail className="h-4 w-4 text-primary" />
                  Email
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {emailConfigured
                    ? `Connected. ${minLevel} alerts are emailed to ${emailRecipientCount} recipient${emailRecipientCount === 1 ? "" : "s"}, once each.`
                    : "Not set up yet."}
                </p>
              </div>
              <AlertTestButton channel="email" disabled={!emailConfigured} />
            </div>
            {!emailConfigured && (
              <ol className="ml-5 flex list-decimal flex-col gap-1 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                <li>
                  Gmail: turn on 2-Step Verification, then create an &quot;App password&quot; at
                  myaccount.google.com/apppasswords. Your normal password will not work.
                </li>
                <li>
                  In your backend settings set SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_USER=your address,
                  SMTP_PASSWORD=the app password.
                </li>
                <li>Set ALERT_EMAIL_TO to who should receive alerts (separate several addresses with commas).</li>
                <li>Restart the backend, then press &quot;Send test message&quot;.</li>
              </ol>
            )}
          </Card>
        </div>

        {!anyChannel && (
          <p className="text-xs text-muted-foreground">
            No channel is connected yet, so alerts only appear on this page. Dismissed incidents are never sent.
          </p>
        )}

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No active Orange or Red alerts right now.
          </div>
        ) : (
          <Card className="gap-0 p-0">
            <ul className="flex flex-col divide-y divide-border">
              {items.map((a) => {
                const pushEligible = minLevel === "Orange" || a.alertLevel === "Red"
                return (
                  <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                    <div className="min-w-0 flex flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge label={a.severityLabel} score={a.severity} />
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                          {a.alertLevel} alert
                        </span>
                      </div>
                      <Link href={`/incidents/${a.id}`} className="text-sm font-medium hover:underline">
                        {a.title}
                      </Link>
                      <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                        <span>{a.source}</span>
                        <RelativeTime date={a.timestamp} />
                        {a.url && (
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            Source <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 text-xs">
                      {a.notifiedChannels.length > 0 && a.notifiedAt ? (
                        <span className="inline-flex flex-wrap items-center justify-end gap-1 text-[var(--chart-1)]">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Sent via {a.notifiedChannels.map((c) => (c === "email" ? "Email" : "Telegram")).join(" + ")}{" "}
                          <RelativeTime date={a.notifiedAt} />
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Info className="h-3.5 w-3.5" />
                          {!anyChannel
                            ? "Dashboard only"
                            : pushEligible
                              ? "Waiting to send"
                              : `Below ${minLevel} threshold`}
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
      </div>
    </AppShell>
  )
}
