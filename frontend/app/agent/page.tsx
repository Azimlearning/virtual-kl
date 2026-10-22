import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/page-header"
import { AgentConsole } from "@/components/kl/agent-console"

export const metadata = { title: "Proactive agent" }

export default function AgentPage() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10">
        <PageHeader
          eyebrow="02 · Agent"
          title="Proactive agent"
          description="It doesn't wait for a threshold to be crossed. It watches, anticipates, rehearses the warning on the twin, decides how much autonomy it has, and drafts complete advisories in English and Bahasa Malaysia. Orange and Red wait for a human; Red is never auto-sent."
        />
        <AgentConsole />
      </div>
    </AppShell>
  )
}
