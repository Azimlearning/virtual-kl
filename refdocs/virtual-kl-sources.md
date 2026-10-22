# Virtual KL — Sources & References

> Raw research and external dependencies. The PRD is the *decided* view; this file is the *considered* view — including things that were looked at and rejected, which is often the more useful half.
> Record a source when it's chosen, and again when it's rejected. "We already tried that and here's why it didn't fit" is the single most expensive fact to re-derive.

Last updated: 2026-10-22

---

## Founding context documents

The documents this project was scaffolded from. Kept because the PRD paraphrases them and paraphrase loses detail. The first three live **outside the repo** in `../context/` (D-16).

- `../context/hackathon/SDP_Hackathon_Key_Notes.md` — the 37-slide briefing deck distilled: deadlines, submission checklist, themes, judging weights, T&C (IP cl.11–13), SDP township list [s8], sustainability pillars [s9]. Slides in `../context/hackathon/slides/NN.png`.
- `../context/hackathon/SDP_University_Hackathon_2026.md` — the public website and T&C summary.
- `../context/team-chat-2026-10-22/` — 22 screenshots of the team's WhatsApp planning (poll for Lisa's FYP, Jie Hao's Safety & Security framing, the Petronas risk-ops use case, "dashboard universal for public view", "focus on the data visual side"). Contains personal details — never commit.
- [brainstorm-2026-10-22.md](brainstorm-2026-10-22.md) — the concept and the research that shaped it.
- [cise-fyp-readme.md](cise-fyp-readme.md) — CISE's engineering log (background IP).

---

## External code & libraries

| Name | What it does for us | Link | License | Status |
|---|---|---|---|---|
| FastAPI, SQLAlchemy, APScheduler, httpx, tenacity, pydantic-settings | Backend core (inherited) | `requirements.txt` | MIT/BSD-family | In use |
| chromadb 0.5.20, neo4j 5.26 | Knowledge layer (inherited) | `requirements.txt` | Apache-2.0 / Apache-2.0 | In use |
| ollama 0.4.4 | Old local LLM client | `requirements.txt` | MIT | To be removed in P0 (D-06) |
| reportlab, python-docx | PDF/DOCX export (inherited) | `requirements.txt` | BSD / MIT | In use |
| Next.js 16, React 19, Tailwind 4, shadcn/base-ui, Recharts, react-simple-maps | Frontend (inherited) | `frontend/package.json` | MIT | In use |
| `@ai-sdk/google`, `ai`, `firebase`, `firebase-admin`, `drizzle-orm`, `pg` | Leftovers from an earlier prototype | `frontend/package.json` | various | To be removed in P0 if unused (verify) |
| Anthropic Python SDK (`anthropic`) | Claude calls | https://github.com/anthropics/anthropic-sdk-python | MIT | Planned P0 |
| Chronos (`chronos-forecasting`; Chronos-Bolt / Chronos-2) | Zero-shot forecasting | https://github.com/amazon-science/chronos-forecasting | Apache-2.0 | Planned P2 |
| deck.gl | GPU map layers, Tile3DLayer, TerrainExtension | https://deck.gl | MIT | Candidate P3 |
| Three.js | 3D scene, instancing | https://threejs.org | MIT | Candidate P3 |
| GSAP | Camera flights / animation | https://gsap.com | GreenSock standard no-charge licence | Candidate P3 |
| MapLibre GL JS | Base map + OSM building extrusion | https://maplibre.org | BSD-3-Clause | Candidate P3 |
| StadiView (thebuggeddev/football-stadium) | Visual reference: procedural Three.js scene, instanced thousands of selectable seats, GSAP camera flights, first-person seat view, minimap, reduced-motion handling — single `index.html`, Three.js r128 + GSAP 3.12.5 from cdnjs | https://github.com/thebuggeddev/football-stadium · demo https://football-stadium-ruddy.vercel.app | PolyForm Noncommercial 1.0.0 (commercial use needs a separate licence) | Reference; reuse allowed per D-12 with notices kept (A-11) |
| groundsource (PyPI helper) | Decodes the Groundsource parquet, adds country tags | https://github.com/SharathSivamalaisamy/groundsource | MIT | Candidate P4 |
| AgentSociety 2 | Reference architecture for LLM-agent city simulation | https://github.com/tsinghua-fib-lab/agentsociety | see repo | Reference only |
| U-RNN / UrbanFloodCast | Deep-learning flood emulators | https://github.com/holmescao/U-RNN · https://github.com/HydroPML/UrbanFloodCast | see repos | Roadmap (needs per-site training) |

---

## APIs & services

| Service | Used for | Pricing model | Auth / key location | Status |
|---|---|---|---|---|
| Anthropic API | All LLM work: briefs, agent, vision checks, persona policies, interviews | Pay-per-token | `ANTHROPIC_API_KEY` in `.env` (server only) | Planned P0 |
| data.gov.my Weather API | MET 7-day district forecast + warnings (BM/EN) | Free, no token, rate-limited | none | Verified 2026-10-22; planned P1 |
| data.gov.my Flood Warning API | JPS water-level stations (normal/alert/warning/danger levels, trend) | Free, no token | none | Reachable 2026-10-22 (301 → JSON); freshness unproven (A-07) |
| data.gov.my GTFS-realtime | Bus/train vehicle positions | Free | none | Not used (Mobility rejected, D-02) |
| Haze Monitor API | DOE station API (air) readings as JSON (68 stations) | Free, no key, third-party | none | Verified 2026-10-22 (A-06) |
| DOE MyEQMS / APIMS | Official source behind Haze Monitor | Free web view (JS-rendered; legacy host 403) | none | Not scraped directly |
| Open-Meteo Forecast / Air Quality / Flood (GloFAS) / Ensemble (WeatherNext 2) | Weather, PM2.5/AQI (CAMS, ~40 km), river discharge, 64-member AI ensemble | Free non-commercial; paid key for commercial | none (optional `apikey` for commercial) | Air quality verified 2026-10-22; others planned P1 (A-10) |
| Groundsource (Zenodo) | 2.6M news-derived flood events (polygons, dates) | Free, CC BY 4.0, 667 MB parquet | none | Planned P4 (A-13) |
| Google Flood Forecasting API | Riverine + urban flash-flood forecasts | Free, waitlist (months) | Google Cloud key after approval | Roadmap |
| Google Earth Engine — Satellite Embedding (AlphaEarth) | 10 m embeddings for look-alike risk mapping | Free for non-commercial/research | Google account | Tier 2 |
| Google Map Tiles API — Photorealistic 3D Tiles | Photoreal 3D city mesh | Free usage tier, billing account required | `GOOGLE_MAPS_API_KEY` (not yet added) | Optional P3 (A-04) |
| USGS, GDACS, GDELT, GNews, ACLED | CISE's global feeds | Free (GNews non-commercial; ACLED registration) | `GNEWS_API_KEY`, `ACLED_*` | In use; KL filter in P1 |
| Telegram Bot API, SMTP | Alert delivery (inherited) | Free | `TELEGRAM_*`, `SMTP_*` | In use |

Keys live in `.env` at the repo root (gitignored, read by `app/config.py` via pydantic-settings) and are read server-side only. Never commit a key; never expose one to a client bundle.

---

## Reference material

Docs, papers, articles studied but not depended on. Grouped by the claim they support.

**The problem (resident information gaps)**
- Putra Heights residents on communication — Malay Mail, 2025-04-03: https://www.malaymail.com/news/malaysia/2025/04/03/putra-heights-residents-call-for-better-on-the-ground-communication-seek-answers-on-home-return-aid-and-safety/171817
- Greenpeace Malaysia, "Putra Heights one year on" (advocacy; cite carefully): https://www.greenpeace.org/static/planet4-malaysia-stateless/2026/03/b46f87d2-web-putra-heights-one-year-on-v3-20260331.pdf
- Bandar Bukit Raja floods — FMT 2024-11-16: https://www.freemalaysiatoday.com/category/nation/2024/11/16/flood-hit-bandar-bukit-raja-residents-want-developer-to-halt-new-projects · The Edge 2024-11-21: https://theedgemalaysia.com/node/734847
- Gaps in flood early warning, Taman Sri Muda 2021 (SSRN, 2026): https://doi.org/10.2139/ssrn.7115286
- KL early flood warning sirens (25 telemetry stations) — NADMA/Malay Mail, 2026-01-09: https://www.nadma.gov.my/bm/media-2/berita/5991-when-sirens-call-how-kl-s-early-flood-warning-system-works-and-why-it-matters
- Cell Broadcast System in final phase — NST, 2026-10-11: https://www.nst.com.my/news/nation/2026/10/1553120/cell-broadcast-system-final-phase-deliver-disaster-alerts-phones
- MET ENSO status (haze through Oct 2026; extreme heat Jan–May 2027), updated 2026-10-16: https://www.met.gov.my/data/climate/status_elnino_en.pdf
- MOE haze measures (API > 100 suspend outdoor activities; > 200 close schools) — The Star, 2026-10-07: https://www.thestar.com.my/news/nation/2026/10/07/haze-education-ministry-orders-immediate-action-if-air-quality-worsens

**SDP context**
- SDP Sustainability Report 2025 (KL East Park wetlands/riparian buffers; flash-flood climate mapping): https://www.simedarbyproperty.com/sites/default/files/2026-04/SDP%20SR2025.pdf
- SDP Integrated Annual Report 2025 ("Melawati, Ampang Jaya"; "KL East, Kuala Lumpur"): https://www.simedarbyproperty.com/sites/default/files/2026-04/SDP%20IAR2025%20Mobile.pdf
- "Fostering resilient, nature-rich communities" (Bandar Bukit Raja Town Park retention, 50,000 m³; climate modelling across townships) — The Star, 2025-12-18: https://www.thestar.com.my/esg/2025/12/18/fostering-resilient-nature-rich-communities

**What AI makes newly possible**
- Groundsource dataset paper (82% practical precision; Malaysia recall 79–89% vs GDACS): https://eartharxiv.org/repository/object/12083/download/21690/ · dataset https://zenodo.org/records/18647054
- AI urban flash-flood forecasting (24 h, 20 km): https://research.google/blog/protecting-cities-with-ai-driven-flash-flood-forecasting/
- Aurora Earth-system foundation model (air pollution vs CAMS): https://www.nature.com/articles/s41586-025-09005-y
- AlphaEarth Foundations / Satellite Embedding: https://deepmind.google/blog/alphaearth-foundations-helps-map-our-planet-in-unprecedented-detail/
- WeatherNext 2 via Open-Meteo: https://open-meteo.com/en/docs/google-weathernext-api
- Chronos-Bolt: https://aws.amazon.com/blogs/machine-learning/fast-and-accurate-zero-shot-forecasting-with-chronos-bolt-and-autogluon/ · AtmoBench (TSFMs on air quality): https://shadowgraph.io/Rishi-Bharadwaj/AtmoBench
- Satellite AOD + ML PM2.5 for Malaysia (R² 0.53–0.76): https://www.mdpi.com/2076-3417/11/16/7326
- Flood depth from photos with a multimodal LLM (FloodDepth-GPT): https://link.springer.com/article/10.1007/s43762-024-00123-3
- Surveillance cameras as flood sensors: https://hess.copernicus.org/articles/23/4621/2019/
- Deep-learning InSAR deformation monitoring: https://www.mdpi.com/2072-4292/15/9/2310 · ASF HyP3: https://hyp3-docs.asf.alaska.edu/

**Simulation and synthetic residents**
- LLM agents predicting evacuation (ρ 0.58 zero-shot, 0.79 fine-tuned; 6,355 agents): https://doi.org/10.1145/3764925.3770907
- AgentSociety 2 (10k agents; disaster mobility RMSE 0.007–0.019; 66.5% fewer LLM calls via caching): https://arxiv.org/html/2607.11895v2
- LLM social-cognitive agents aligned to survey data (±0.13 Likert): https://doi.org/10.3390/systems13040240
- C-SAFE agent-based evacuation policy (early warnings cut stranded people 37%): https://www.sciencedirect.com/science/article/pii/S2212420925001049
- Virtual Singapore (national digital twin): https://www.tech.gov.sg/technews/5-things-to-know-about-virtual-singapore/

**Warning message design**
- LLM-personalised risk messages (n=73): https://doi.org/10.1109/sieds65500.2025.11021204
- Complete, standardised warning messages work better: https://doi.org/10.1061/nhrefo.nheng-2293
- LLMs on crisis microblogs (weak on flood posts and urgent requests, F1 < 0.6): https://doi.org/10.1145/3696410.3714511
- 3D/street-view flood visualisation: stronger perceived effect (https://doi.org/10.1016/j.pdisas.2025.100419) but no change in evacuation intent in a 160-person study (https://par.nsf.gov/servlets/purl/10435423)

---

## Considered and rejected

| Option | Why it looked good | Why it lost | Recorded in |
|---|---|---|---|
| Planet → Climate Resilience track | SDP pillar; same engine | One track only; Planet examples centre on behaviour/green infrastructure; the problem is resident information | D-02 |
| People → Mobility (live 3D bus tracking) | Jie Hao's idea; visual | GTFS-realtime has vehicle positions only; mostly new code; breaks "one problem" | D-02 |
| Nationwide "virtual Malaysia" twin | Scale story | User: KL first | D-04 |
| Local Ollama LLM (CISE original) | Privacy story | Can't serve a hosted demo; user chose Anthropic | D-06 |
| Hybrid local + cloud LLM | Keeps privacy story | User chose cloud only | D-06 |
| Per-agent LLM simulation | Most "generative" | Cost and latency at thousands of agents | D-09 |
| TimesFM 3.0 | Top benchmark results | Non-commercial weights; heavier | D-11 |
| Microsoft Aurora for air quality | Beats/matches CAMS | Needs GPU + gridded inputs | D-11 (roadmap) |
| Google Flood Forecasting API | Purpose-built | Waitlist of months | D-11 (roadmap) |
| Scraping DOE APIMS directly | Official | JS-rendered; legacy host returns 403 | D-13 |
| PurpleAir sensors | Hyperlocal PM2.5 | Points-based paid API; sparse in KL (unverified) | D-13 |
| InSAR ground-motion watch | Putra Heights relevance | Hours of processing; vegetation degrades C-band signal | brainstorm (roadmap) |
| Generative "your street flooded" images | Very visual | Mixed evidence on behaviour; needs a separate image model | brainstorm |
| Name "Siaga" | BM for "prepared" | User preferred "Virtual KL" | D-03 |
