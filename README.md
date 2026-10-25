# SciMetro Studio (React + Vite + TypeScript)

SciMetro Studio is a scientometric study generator that bridges the dblp computer-science bibliographic database, OpenCitations citation graph, and Wikidata knowledge graphs with LLM assistance to automatically synthesize literature analyses and academic reports.

## Features

- **Wikidata Concept Exploration**:
  - Live query resolution via Wikidata entity search (`wbsearchentities` / `wbgetentities`)
  - Multilingual alias and ontology mapping (subclasses, instances, facets, and parts)
- **SPARQL Pipeline with dblp**:
  - Automatic query formulation and boolean title search against `sparql.dblp.org`
  - Automated author and institutional affiliation extraction
  - Forward and backward citation snowballing via OpenCitations RDF triples (`cito:hasCitedEntity`, `cito:hasCitingEntity`)
- **Scientometric & Statistical Indicators**:
  - Compound annual publication growth rate (log-linear regression)
  - Hirsch's h-index
  - Lotka's law of scientific productivity distribution
  - Geographic mapping and international collaboration index
  - Title keyword and bigram co-occurrence frequencies
  - Citation distribution bins and top cited works
  - Interactive SVG works-per-year timeline chart
- **LLM Assistance (Ollama & Fallback Synthesis)**:
  - Boolean keyword query formulation
  - Outlier filtering by relevance threshold
  - Full academic paper generation with 6 core sections and 11 formatted academic tables
- **Storage & Integration**:
  - Download complete academic paper as Markdown (`.md`)
  - Export complete dataset as JSON (`data.json`)
  - Store papers and datasets directly into GitHub repositories via GitHub REST API
  - Built-in Stored Studies browser and manager

## Tech Stack

- **Framework**: React 18 with Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS & Academic CSS variables with system dark/light mode
- **APIs**: Wikidata API, dblp SPARQL (QLever), Ollama local API, GitHub REST API

## Development

```bash
npm install
npm run dev
```

Build for production:
```bash
npm run build
```

## Deploying to GitHub Pages

The build uses relative asset URLs (`base: './'` in `vite.config.ts`), so the same output works on a user site (`https://user.github.io/`), a project site (`https://user.github.io/<repo>/`), a custom domain and a nested path. With an absolute base every script, stylesheet and font returns 404 under `/<repo>/` and the page stays blank; `npm test` builds the application and checks this under three paths.

The workflow in `.github/workflows/pages.yml` type-checks, runs the tests, builds into `_site` and deploys. If your repository also has a `scripts/build_site.py`, the workflow runs it instead of the plain build: make sure it calls Vite with this configuration and does not override `base`.

## Using a local Ollama from GitHub Pages

Ollama accepts requests only from `localhost`, `127.0.0.1` and `0.0.0.0` by default, so the Pages origin must be allowed, then Ollama restarted:

```
OLLAMA_ORIGINS="https://<user>.github.io" ollama serve
```

(the origin has no path; for the macOS app, systemd, Windows and Docker see the **Using a local Ollama from this page** panel in Settings, which prints the commands for your exact origin.) Keep the Ollama URL at `http://localhost:11434`: an Ollama on another machine over plain http is blocked from an HTTPS page. Chrome and Edge ask permission to access local network devices the first time. **Test connections** in Settings reports which of these is the cause (origin not allowed, Ollama not running, model not installed, mixed content, timeout), and the pipeline falls back to the built-in synthesizer when Ollama is unavailable.

## Tests

`npm test` runs the unit, rendering and deployment tests. `npm run test:browser` additionally drives a real browser engine (WebKitGTK; needs `apt install webkit2gtk-driver xvfb` and `pip install selenium`) against mock Ollama servers and the production build, and saves screenshots.

## To Cite the Tool

The interface has a **To Cite the Tool** section (also reachable from the header) with copyable APA and BibTeX entries for SciMetro Studio. No author or DOI is invented: archive a release (for example on Zenodo) and cite its DOI for a persistent identifier. Please also acknowledge Wikidata (CC0), QLever, Crossref and Wikipedia.

### Related work by Houcemeddine Turki

Several parts of the pipeline are evoked by earlier work of Houcemeddine Turki and co-authors. The works are background, grouped by the part of the pipeline they bear on; they do not endorse this software, which does not reproduce their methods.

**Terms and query formulation** (Steps 1–2: multilingual labels, aliases, ontology relations and the title query)

- Turki, H., Shafee, T., Hadj Taieb, M. A., Ben Aouicha, M., Vrandečić, D., Das, D., & Hamdi, H. (2019). Wikidata: A large-scale collaborative ontological medical database. Journal of Biomedical Informatics, 99, 103292. https://doi.org/10.1016/j.jbi.2019.103292
- Turki, H. (2021). Systematic review automation driven by Wikidata. WikidataCon 2021, short presentation, 31 October 2021. https://pretalx.com/wdcon21/talk/HWZ8RG/

**Bibliographic metadata and citation links** (Retrieval, citation snowballing and keyword analysis)

- Turki, H., Hadj Taieb, M. A., Ben Aouicha, M., Fraumann, G., Hauschke, C., & Heller, L. (2021). Enhancing knowledge graph extraction and validation from scholarly publications using bibliographic metadata. Frontiers in Research Metrics and Analytics, 6, 694307. https://doi.org/10.3389/frma.2021.694307
- Turki, H., Hadj Taieb, M. A., & Ben Aouicha, M. (2020). Facts to consider when analyzing the references of Nobel Prize scientific background [Letter to the editor]. Scientometrics, 124(1), 787–790. https://doi.org/10.1007/s11192-020-03456-y
- Turki, H., Hadj Taieb, M. A., & Ben Aouicha, M. (2022). Awakening sleeping beauties during the COVID-19 pandemic influences the citation impact of their references [Research letter]. Scientometrics, 127(10), 6047–6050. https://doi.org/10.1007/s11192-022-04501-8
- Turki, H. (2018). Citation analysis is also useful to assess the eligibility of biomedical research works for inclusion in living systematic reviews [Comment]. Journal of Clinical Epidemiology, 97, 124–125. https://doi.org/10.1016/j.jclinepi.2017.11.002

**Coverage of open bibliographic data** (Metadata and DOI coverage reported in the manuscript)

- Turki, H., Fraumann, G., Hadj Taieb, M. A., & Ben Aouicha, M. (2023). Global visibility of publications through Digital Object Identifiers. Frontiers in Research Metrics and Analytics, 8, 1207980. https://doi.org/10.3389/frma.2023.1207980
- Ben Aouicha, M., Turki, H., & Hadj Taieb, M. A. (2023). Editorial: Linked open bibliographic data for real-time research assessment [Editorial]. Frontiers in Research Metrics and Analytics, 8, 1275731. https://doi.org/10.3389/frma.2023.1275731

**Topic-level bibliometric indicators** (Growth, document and geographic distribution in the results)

- Turki, H., Hadj Taieb, M. A., Ben Aouicha, M., Rasberry, L., & Mietchen, D. (2023). Ten years of Wikidata: A bibliometric study. Wikidata’23: Wikidata Workshop at ISWC 2023 (CEUR Workshop Proceedings, Vol. 3640, paper 13). https://ceur-ws.org/Vol-3640/paper13.pdf
- Turki, H. (2016). Usefulness of the single publication h-index [Letter to the editor]. Scientometrics, 106(3), 1281–1282. https://doi.org/10.1007/s11192-015-1808-y
- Turki, H., Hadj Taieb, M. A., & Ben Aouicha, M. (2018). The value of letters to the editor [Letter to the editor]. Scientometrics, 117(2), 1285–1287. https://doi.org/10.1007/s11192-018-2906-4
- Turki, H., Ben Aouicha, M., & Hadj Taieb, M. A. (2019). Discussing Arab Spring’s effect on scientific productivity and research performance in Arab countries [Research letter]. Scientometrics, 120(1), 337–339. https://doi.org/10.1007/s11192-019-03127-7

**Collaboration and subject-term networks** (Network analysis and thematic clusters)

- Lrhoul, H., Turki, H., Hammouti, B., & Benammar, O. (2023). Internationalization of the Moroccan Journal of Chemistry: A bibliometric study. Heliyon, 9(5), e15857. https://doi.org/10.1016/j.heliyon.2023.e15857
- Turki, H. & Chebil, K. (2024). A framework for integrating biomedical knowledge in Wikidata with open biological and biomedical ontologies and MeSH keywords. Heliyon, 10(19), e38448. https://psau.sa.elsevierpure.com/en/publications/a-framework-for-integrating-biomedical-knowledge-in-wikidata-with/
