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
