# SciMetro Studio

SciMetro Studio is an AI-assisted scientometric study generator built around **Wikidata's scholarly-work records and citation links**, queried through the [QLever SPARQL endpoint for Wikidata](https://qlever.cs.uni-freiburg.de/api/wikidata). It combines semantic topic expansion, bibliographic retrieval, citation-based corpus expansion, record screening, scientometric calculations, and manuscript generation. It does **not** use DBLP or OpenCitations as its primary retrieval or citation-analysis backend; Crossref is used for selected DOI-based bibliographic-reference enrichment.

## What it does

- **Expands a research topic semantically.** Resolve a topic to a Wikidata item and retrieve labels, aliases, Wikipedia sitelink titles and redirects in configured languages. Explore selected ontology relations, including subclasses, instances, parts, and facets, to find related terms.
- **Builds a title-search query.** Organize multilingual topic and related-item terms into query groups. When configured, a local Ollama model can help formulate the groups; the built-in scholarly synthesizer provides a deterministic fallback.
- **Retrieves scholarly works from Wikidata.** Query Wikidata through QLever using two complementary channels: (1) works whose main subject (P921) is the selected topic or selected related items, and (2) scholarly works whose titles match the generated term groups. The search is capped by the configured retrieval limit. The application does not search all subclasses of the selected topic as subjects.
- **Expands the corpus through Wikidata citation links.** Perform one-step forward and backward citation snowballing using Wikidata property P2860, starting from up to 20 seed works ranked by the citation counts available in the retrieved records. Newly found works are deduplicated against the existing corpus and the expansion is limited by the query implementation.
- **Filters and screens records.** Optional LLM-assisted relevance filtering scores publication titles against the topic and query. The metadata stage deduplicates by Wikidata identifier, excludes records without a title or publication year, and attempts to enrich missing author metadata in batches.
- **Finds earlier reviews and scientometric studies.** Search Wikidata for topic-related works with review, survey, bibliometric, scientometric and similar title terms, including relevant work types. If the initial search returns few results, the application broadens the title search. DOI records can be resolved through Crossref for fuller bibliographic references. Classification of these studies is based on title keywords; the application does not read and appraise their full texts.
- **Calculates scientometric indicators.** The analysis includes publication timelines and growth estimates, citation distributions and concentration, h-index and g-index, authorship and collaboration indicators, Lotka's law, Bradford's law, geographic and institutional distributions, and keyword co-occurrence/network analyses. Availability and interpretation of indicators depend on the metadata present in Wikidata.
- **Generates a manuscript and exports data.** Build a structured Markdown manuscript with generated tables and figures from the computed results and retrieved prior-study records. The default built-in synthesizer uses rule-based, data-grounded templates; an Ollama model can optionally draft selected narrative text. Export the manuscript as Markdown and the study dataset as JSON.
- **Stores studies locally or in GitHub.** Keep saved studies in browser storage and optionally upload study files to a GitHub repository through the GitHub REST API.

## Pipeline

The interface exposes nine stages. They can be run individually or sequentially with **Run all**:

1. **Wikidata labels, aliases and related terms** — collect multilingual labels and aliases, Wikipedia article titles and redirects, and selected related ontology items.
2. **Formulate query** — arrange topic and related terms into title-query groups, using Ollama when selected and available or the built-in query builder otherwise.
3. **Search Wikidata QLever** — retrieve candidate scholarly works through the main-subject and title-search channels.
4. **Citation snowballing** — add works linked to seed publications through Wikidata's P2860 citation property.
5. **Relevance filtering** — optionally use the configured LLM to identify title-level outliers; a built-in fallback is used when model assistance is unavailable.
6. **Metadata and affiliation check** — deduplicate records, remove records missing title or year, and enrich selected missing author metadata.
7. **Scientometric analysis** — calculate indicators and prepare the tables, distributions, and networks used in the results.
8. **Previous scientometric and review studies** — search Wikidata for related prior studies and resolve DOI-based references through Crossref where possible.
9. **Write the academic paper** — generate the manuscript, assemble the outputs, and save the study locally.

## Important coverage and interpretation limits

SciMetro analyses the bibliographic information represented in Wikidata, not a comprehensive or independently validated index of all scholarly publications. Coverage of publication years, authors, affiliations, DOIs, subjects and citation links varies. Citation counts derived from Wikidata's P2860 statements are counts of recorded links, not necessarily complete citation counts. Citation snowballing can add works that do not match the original topic query. Consequently, results should be interpreted as analyses of the retrieved corpus rather than population estimates for an entire research field. Compare indicators with independent sources and inspect the generated screening and coverage information before drawing substantive conclusions.

The prior-study search is metadata/title based. The tool does not read the full texts of the retrieved reviews, verify their conclusions, or automatically establish research gaps from their findings. Generated manuscript text and references should be checked before use in a publication.

## Tech stack

- **Frontend:** React 18, TypeScript, Vite
- **Styling and visualization:** Tailwind CSS, CSS variables, SVG/React visual components
- **Semantic and bibliographic data:** Wikidata Action API, Wikidata SPARQL through QLever, Wikipedia API for article redirects, Crossref REST API for selected DOI lookups
- **Optional local language model:** Ollama API
- **Optional persistence:** GitHub REST API; browser local storage
- **Testing:** TypeScript checks, unit/rendering/deployment tests, and optional browser tests

## Development

Requirements: a recent Node.js/npm installation.

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

Run the automated tests:

```bash
npm test
```

The browser integration suite can also be run with `npm run test:browser`; see the test instructions below for its additional system dependencies.

## Deploying to GitHub Pages

The build uses relative asset URLs (`base: './'` in `vite.config.ts`), so the same output works on a user site (`https://user.github.io/`), a project site (`https://user.github.io/<repo>/`), a custom domain and a nested path. An absolute base can cause scripts, stylesheets and fonts to return 404 under `/<repo>/`. The test suite checks deployment under multiple paths.

The workflow in `.github/workflows/pages.yml` type-checks, runs tests, builds into `_site` and deploys. If your repository also has a `scripts/build_site.py`, the workflow runs it instead of the plain build: ensure it calls Vite with this configuration and does not override `base`.

## Using a local Ollama from GitHub Pages

Ollama accepts browser requests only from allowed origins. To use a local Ollama instance from a GitHub Pages deployment, allow the exact site origin and restart Ollama:

```bash
OLLAMA_ORIGINS="https://<user>.github.io" ollama serve
```

Use the origin only (no repository path). For macOS, systemd, Windows and Docker instructions, see the **Using a local Ollama from this page** panel in Settings. Keep the Ollama URL at `http://localhost:11434` when the model runs on the same computer; browsers block plain-HTTP requests to a remote server from an HTTPS page. Chrome and Edge may request permission to access local network devices. The Settings connection test helps diagnose origin restrictions, an unavailable server, a missing model, mixed content and timeouts. If Ollama is unavailable, query formulation, filtering and manuscript synthesis use the application's built-in alternatives where supported.

## Tests

`npm test` runs the unit, rendering and deployment tests. `npm run test:browser` additionally drives a real browser engine (WebKitGTK; needs `apt install webkit2gtk-driver xvfb` and `pip install selenium`). The browser suite checks the production build under a sub-path, mock Ollama servers with real CORS behaviour, and the full **Run all** pipeline against a controlled mock network that exercises QLever-like constraints. Screenshots and the pipeline log are saved by the test run.

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
