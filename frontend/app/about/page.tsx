import { AppShell } from "@/components/app-shell"
import { PageHeader } from "@/components/page-header"
import { FreshnessChip } from "@/components/kl/ui"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CALIBRATION_LABEL } from "@/lib/twin/personas"
import { getSnapshot } from "@/lib/kl/snapshot"

export const dynamic = "force-dynamic"
export const metadata = { title: "Methods & limits" }

export default async function AboutPage() {
  const snap = await getSnapshot()
  const rows = [
    { name: "DOE air-quality readings (API)", from: "Haze Monitor JSON feed of DOE's APIMS (third party, free)", used: "Pulse, agent, photo check", s: snap.status.doe },
    { name: "Model PM2.5 / US AQI, 10 days back + 3 ahead", from: "Open-Meteo air-quality API (Copernicus CAMS), one value for KL", used: "Forecast chart, agent, twin scenarios", s: snap.status.aq },
    { name: "Rain probability", from: "Open-Meteo ensemble API, Google WeatherNext 2 (64 members)", used: "Pulse, agent", s: snap.status.ensemble },
    { name: "7-day KL forecast", from: "MET Malaysia via data.gov.my (location Ds058)", used: "Pulse", s: snap.status.metForecast },
    { name: "Weather warnings", from: "MET Malaysia via data.gov.my", used: "Pulse, agent", s: snap.status.metWarnings },
    { name: "Flood water-level stations", from: "JPS via data.gov.my flood-warning API", used: "Greyed map layer only", s: snap.status.jps },
  ]
  return (
    <AppShell>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10">
        <PageHeader
          eyebrow="05 · Methods & limits"
          title="Methods & limits"
          description="What is real, what is simulated, and where the edges are. Judges and residents should be able to see this without asking."
        />

        <Card>
          <CardHeader><CardTitle>Data sources — live status right now</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr><th className="py-1 pr-3 font-medium">Data</th><th className="py-1 pr-3 font-medium">Where it comes from</th><th className="py-1 pr-3 font-medium">Used for</th><th className="py-1 font-medium">Status</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name} className="border-t border-border align-top">
                    <td className="py-2 pr-3 font-medium">{r.name}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.from}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.used}</td>
                    <td className="py-2"><FreshnessChip label="" status={r.s} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted-foreground">Basemap: OpenFreeMap / OpenMapTiles / © OpenStreetMap contributors. KL focus-area coordinates come from OpenStreetMap (Nominatim) and DOE station metadata; each is cited in the code.</p>
          </CardContent>
        </Card>

        <div className="grid gap-5 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>What is simulated</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm leading-relaxed">
              <p>Everything in the KL Twin sandbox is a <strong>simulation</strong>: the residents, their behaviour, the outcomes and the &quot;interviews&quot;. Resident positions are scattered around a focus area and are not real addresses.</p>
              <p>{CALIBRATION_LABEL}. The persona parameters are plausible placeholders; the resident survey (in the project docs) exists to replace them. Until then the simulation shows <em>how timing and message quality interact</em>, not real-world effect sizes.</p>
              <p>The haze veil on the map follows one city-wide model value; it is not a spatial plume.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Known limits</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm leading-relaxed">
              <ul className="list-disc space-y-1.5 pl-4">
                <li>KL has only <strong>two DOE stations</strong>. Most of the city has no nearby official reading.</li>
                <li>The forecast is a model on the US AQI scale shifted by today&apos;s gap to DOE&apos;s API. It is a heuristic: <strong>indicative, not official</strong>. Official thresholds apply to DOE&apos;s API.</li>
                <li>The JPS flood-station feed is <strong>frozen</strong> (last update shown on the map), so flooding is not forecast or simulated here.</li>
                <li>A model reading a photo can be wrong and varies run to run; it is shown with its reasons and never decides alone.</li>
                <li>Advisories are drafts. Orange and Red need a human to approve; delivery channels are not connected in this prototype.</li>
                <li>This does not replace MET Malaysia, DOE, JPS, NADMA or the coming Cell Broadcast System. In an emergency call 999.</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>How the agent is kept honest</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm leading-relaxed md:grid-cols-3">
            <div><p className="font-semibold">Grounded numbers</p><p className="text-muted-foreground">Every number in an advisory must come from the facts the model was given, or the advisory is replaced by a template.</p></div>
            <div><p className="font-semibold">No overstatement</p><p className="text-muted-foreground">A message can&apos;t claim a higher alert level, a school closure or an evacuation the data doesn&apos;t support.</p></div>
            <div><p className="font-semibold">Humans approve</p><p className="text-muted-foreground">Green may auto-send; Orange and Red wait for approval; Red is never auto-sent. Every advisory shows its guardrail result.</p></div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Virtual KL is built on CISE (Crisis Intelligence Synthesis Engine), a final-year project by Nurlisa Nabiha, disclosed as background IP. AI tools (Claude) were used materially in building this prototype and are used inside it, as the hackathon terms require us to disclose. Sime Darby Property University Hackathon 2026 · People → Safety &amp; Security.
        </p>
      </div>
    </AppShell>
  )
}
