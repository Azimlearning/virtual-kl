import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/page-header"
import { PhotoCheck } from "@/components/kl/photo-check"

export const metadata = { title: "Photo check" }

export default function CheckPage() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10">
        <PageHeader
          eyebrow="04 · Photo check"
          title="Ground-truth photo check"
          description="Residents see things sensors miss, but people only act on information they trust. A vision model reads a resident's photo and the system checks it against the nearest live DOE reading: corroborated, contradicted, or unverified, with the reasons."
        />
        <PhotoCheck />
      </div>
    </AppShell>
  )
}
