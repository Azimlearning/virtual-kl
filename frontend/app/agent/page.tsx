import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/page-header"
import { AgentConsole } from "@/components/kl/agent-console"
import { AgentFeed } from "@/components/kl/agent-feed"

export const metadata = { title: "Proactive agent" }

export default function AgentPage() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 md:px-6 md:py-10">
        <PageHeader
          eyebrow="Agent"
          title="The agent acts first"
          description="It doesn't wait to be asked. It starts when the app opens, checks Kuala Lumpur every minute, notices changes and coming threshold crossings, rehearses the options on the twin, drafts the advisories, and comes to you only for decisions that are yours. Orange and Red wait for a human; Red is never auto-sent."
        />

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold">What it has done on its own</h2>
          <AgentFeed className="max-w-3xl" />
          <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
            It runs while a tab is open. A production version would run as a scheduled worker and reach people through WhatsApp or Telegram; approving an advisory does not send anything in this prototype.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold">Run the full loop on demand</h2>
          <AgentConsole />
        </section>
      </div>
    </AppShell>
  )
}
