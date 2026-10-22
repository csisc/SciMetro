#!/usr/bin/env python3
"""
SciMetro Studio - Static Site Generator for GitHub Pages
Compiles the Vite application, builds stored scientometric studies into publication-ready HTML,
and generates JSON indexes for the interactive browser.
"""

import os
import sys
import json
import shutil
import subprocess
import re
from pathlib import Path

# Optional markdown library (installed in GitHub Actions via `pip install markdown`)
try:
    import markdown
    HAS_MARKDOWN = True
except ImportError:
    HAS_MARKDOWN = False

REPO_ROOT = Path(__file__).resolve().parent.parent
STUDIES_DIR_NAME = os.environ.get("STUDIES_DIR", "studies")
STUDIES_DIR = REPO_ROOT / STUDIES_DIR_NAME
SITE_DIR = REPO_ROOT / os.environ.get("SITE_DIR", "_site")
DIST_DIR = REPO_ROOT / "dist"

ACADEMIC_PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} - SciMetro Scientometric Study</title>
  <meta name="description" content="{meta_description}">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%230b5fff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><path d='M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20'/><path d='M2 12h20'/></svg>">
  <style>
    :root {{
      --bg: #ffffff;
      --fg: #1a1a1a;
      --mut: #666666;
      --bd: #e2e8f0;
      --ac: #0b5fff;
      --paper-bg: #ffffff;
      --code-bg: #f8fafc;
      --table-header: #f1f5f9;
      --table-stripe: #f8fafc;
    }}
    @media (prefers-color-scheme: dark) {{
      :root {{
        --bg: #0f172a;
        --fg: #f1f5f9;
        --mut: #94a3b8;
        --bd: #334155;
        --ac: #38bdf8;
        --paper-bg: #1e293b;
        --code-bg: #0f172a;
        --table-header: #334155;
        --table-stripe: #1e293b;
      }}
    }}
    * {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--fg);
      line-height: 1.6;
      padding: 0;
    }}
    header.site-header {{
      border-bottom: 1px solid var(--bd);
      padding: 0.85rem 1.5rem;
      background: var(--paper-bg);
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 20;
    }}
    .site-brand {{
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: 700;
      text-decoration: none;
      color: var(--fg);
      font-size: 1rem;
    }}
    .site-actions {{
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }}
    .btn {{
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.825rem;
      padding: 0.4rem 0.85rem;
      border-radius: 6px;
      text-decoration: none;
      border: 1px solid var(--bd);
      color: var(--fg);
      background: var(--paper-bg);
      cursor: pointer;
      transition: background 0.15s ease;
    }}
    .btn:hover {{
      background: var(--code-bg);
    }}
    .btn-primary {{
      background: var(--ac);
      color: #ffffff;
      border-color: var(--ac);
    }}
    .btn-primary:hover {{
      opacity: 0.92;
    }}
    .wrapper {{
      max-width: 900px;
      margin: 2rem auto;
      padding: 0 1.5rem;
    }}
    .study-meta-bar {{
      margin-bottom: 2rem;
      padding: 1rem 1.25rem;
      background: var(--code-bg);
      border: 1px solid var(--bd);
      border-radius: 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 1.25rem;
      font-size: 0.85rem;
      color: var(--mut);
    }}
    .study-meta-item strong {{
      color: var(--fg);
    }}
    .manuscript {{
      background: var(--paper-bg);
      border: 1px solid var(--bd);
      border-radius: 10px;
      padding: 3rem 3.5rem;
      box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.05);
      font-family: Charter, Georgia, "Times New Roman", serif;
      font-size: 1.05rem;
      line-height: 1.75;
    }}
    .manuscript h1 {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 2.1rem;
      line-height: 1.25;
      margin-bottom: 1.25rem;
      color: var(--fg);
      border-bottom: 2px solid var(--bd);
      padding-bottom: 0.75rem;
    }}
    .manuscript h2 {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 1.45rem;
      margin-top: 2rem;
      margin-bottom: 0.75rem;
      color: var(--fg);
      border-bottom: 1px solid var(--bd);
      padding-bottom: 0.35rem;
    }}
    .manuscript h3 {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 1.2rem;
      margin-top: 1.5rem;
      margin-bottom: 0.5rem;
      color: var(--fg);
    }}
    .manuscript p {{
      margin-bottom: 1.15rem;
      text-align: justify;
    }}
    .manuscript ul, .manuscript ol {{
      margin-bottom: 1.15rem;
      padding-left: 2rem;
    }}
    .manuscript li {{
      margin-bottom: 0.35rem;
    }}
    .manuscript blockquote {{
      border-left: 4px solid var(--ac);
      margin: 1.25rem 0;
      padding: 0.75rem 1.25rem;
      background: var(--code-bg);
      font-style: italic;
      color: var(--mut);
    }}
    .manuscript table {{
      width: 100%;
      border-collapse: collapse;
      margin: 1.75rem 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 0.875rem;
      line-height: 1.4;
      border-top: 2px solid var(--fg);
      border-bottom: 2px solid var(--fg);
    }}
    .manuscript th, .manuscript td {{
      padding: 0.6rem 0.75rem;
      text-align: left;
      border-bottom: 1px solid var(--bd);
    }}
    .manuscript th {{
      background: var(--table-header);
      font-weight: 600;
      border-bottom: 1.5px solid var(--fg);
    }}
    .manuscript tr:nth-child(even) td {{
      background: var(--table-stripe);
    }}
    .manuscript code {{
      font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.85em;
      background: var(--code-bg);
      padding: 0.15rem 0.35rem;
      border-radius: 4px;
      border: 1px solid var(--bd);
    }}
    .manuscript pre {{
      background: var(--code-bg);
      border: 1px solid var(--bd);
      border-radius: 6px;
      padding: 1rem;
      overflow-x: auto;
      margin: 1.25rem 0;
    }}
    .manuscript pre code {{
      border: none;
      background: none;
      padding: 0;
    }}
    footer.site-footer {{
      margin-top: 3rem;
      padding: 2rem 1.5rem;
      border-top: 1px solid var(--bd);
      text-align: center;
      font-size: 0.85rem;
      color: var(--mut);
    }}
    @media (max-width: 768px) {{
      .manuscript {{
        padding: 1.75rem 1.25rem;
        font-size: 1rem;
      }}
      .wrapper {{
        padding: 0 0.75rem;
      }}
    }}
    @media print {{
      header.site-header, .site-actions, .study-meta-bar, footer.site-footer {{
        display: none !important;
      }}
      .wrapper {{
        margin: 0;
        max-width: 100%;
        padding: 0;
      }}
      .manuscript {{
        border: none;
        box-shadow: none;
        padding: 0;
        font-size: 11pt;
      }}
    }}
  </style>
</head>
<body>
  <header class="site-header">
    <a href="../../" class="site-brand">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0b5fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
        <path d="M2 12h20"/>
      </svg>
      <span>SciMetro Studio</span>
    </a>
    <div class="site-actions">
      <a href="../" class="btn">All Studies</a>
      <a href="paper.md" download class="btn">Markdown</a>
      <a href="data.json" download class="btn">JSON</a>
      <button onclick="window.print()" class="btn btn-primary">Print / PDF</button>
    </div>
  </header>

  <div class="wrapper">
    <div class="study-meta-bar">
      <div class="study-meta-item">Topic: <strong>{topic}</strong></div>
      <div class="study-meta-item">Date: <strong>{date}</strong></div>
      <div class="study-meta-item">Works: <strong>{works_count}</strong></div>
      <div class="study-meta-item">Database: <strong>{database}</strong></div>
      {extra_meta}
    </div>

    <article class="manuscript">
      {content_html}
    </article>
  </div>

  <footer class="site-footer">
    <p>Synthesized by <strong>SciMetro Studio</strong> with Wikidata QLever &amp; LLM assistance.</p>
  </footer>
</body>
</html>
"""

INDEX_PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stored Scientometric Studies - SciMetro Studio</title>
  <meta name="description" content="Archive of publication-grade scientometric studies generated by SciMetro Studio.">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%230b5fff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><path d='M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20'/><path d='M2 12h20'/></svg>">
  <style>
    :root {{
      --bg: #ffffff;
      --fg: #1a1a1a;
      --mut: #666666;
      --bd: #e2e8f0;
      --ac: #0b5fff;
      --card-bg: #ffffff;
      --badge-bg: #f1f5f9;
    }}
    @media (prefers-color-scheme: dark) {{
      :root {{
        --bg: #0f172a;
        --fg: #f1f5f9;
        --mut: #94a3b8;
        --bd: #334155;
        --ac: #38bdf8;
        --card-bg: #1e293b;
        --badge-bg: #334155;
      }}
    }}
    * {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--fg);
      line-height: 1.6;
    }}
    header.site-header {{
      border-bottom: 1px solid var(--bd);
      padding: 1rem 2rem;
      background: var(--card-bg);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }}
    .site-brand {{
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-weight: 700;
      text-decoration: none;
      color: var(--fg);
      font-size: 1.15rem;
    }}
    .wrapper {{
      max-width: 1000px;
      margin: 2.5rem auto;
      padding: 0 1.5rem;
    }}
    .page-title {{
      font-size: 1.85rem;
      margin-bottom: 0.5rem;
      font-weight: 800;
    }}
    .page-sub {{
      color: var(--mut);
      margin-bottom: 2rem;
      font-size: 1rem;
    }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
      gap: 1.25rem;
    }}
    .card {{
      background: var(--card-bg);
      border: 1px solid var(--bd);
      border-radius: 10px;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
      text-decoration: none;
      color: inherit;
    }}
    .card:hover {{
      transform: translateY(-2px);
      border-color: var(--ac);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08);
    }}
    .card-title {{
      font-size: 1.15rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      color: var(--fg);
    }}
    .card-topic {{
      font-size: 0.85rem;
      color: var(--ac);
      font-weight: 600;
      margin-bottom: 0.75rem;
    }}
    .card-footer {{
      margin-top: 1.25rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--bd);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.8rem;
      color: var(--mut);
    }}
    .badge {{
      display: inline-block;
      padding: 0.2rem 0.5rem;
      background: var(--badge-bg);
      border-radius: 4px;
      font-weight: 500;
    }}
    .empty-state {{
      padding: 4rem 2rem;
      text-align: center;
      border: 1px dashed var(--bd);
      border-radius: 12px;
      color: var(--mut);
    }}
    .empty-state h3 {{
      font-size: 1.25rem;
      color: var(--fg);
      margin-bottom: 0.5rem;
    }}
    .btn {{
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.5rem 1rem;
      background: var(--ac);
      color: white;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.875rem;
      margin-top: 1rem;
    }}
  </style>
</head>
<body>
  <header class="site-header">
    <a href="../" class="site-brand">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0b5fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
        <path d="M2 12h20"/>
      </svg>
      <span>SciMetro Studio</span>
    </a>
    <a href="../" class="btn" style="margin:0;">Open Studio</a>
  </header>

  <div class="wrapper">
    <h1 class="page-title">Stored Scientometric Studies</h1>
    <p class="page-sub">Explore generated academic literature reviews and scientometric analyses.</p>

    {studies_content}
  </div>
</body>
</html>
"""

def simple_markdown_to_html(md_text: str) -> str:
    """Fallback simple markdown converter if python-markdown is unavailable."""
    import html
    lines = md_text.splitlines()
    html_lines = []
    in_table = False
    in_code = False

    for line in lines:
        if line.startswith("```"):
            if in_code:
                html_lines.append("</code></pre>")
                in_code = False
            else:
                html_lines.append("<pre><code>")
                in_code = True
            continue
        if in_code:
            html_lines.append(html.escape(line))
            continue

        if line.startswith("|") and line.endswith("|"):
            if not in_table:
                html_lines.append("<table>")
                in_table = True
            cells = [c.strip() for c in line.split("|")[1:-1]]
            if any(set(c) <= set("-: ") for c in cells):
                continue  # header divider
            row_html = "".join(f"<td>{html.escape(c)}</td>" for c in cells)
            html_lines.append(f"<tr>{row_html}</tr>")
            continue
        elif in_table:
            html_lines.append("</table>")
            in_table = False

        if line.startswith("# "):
            html_lines.append(f"<h1>{html.escape(line[2:])}</h1>")
        elif line.startswith("## "):
            html_lines.append(f"<h2>{html.escape(line[3:])}</h2>")
        elif line.startswith("### "):
            html_lines.append(f"<h3>{html.escape(line[4:])}</h3>")
        elif line.strip():
            html_lines.append(f"<p>{html.escape(line)}</p>")

    if in_table:
        html_lines.append("</table>")
    if in_code:
        html_lines.append("</code></pre>")

    return "\n".join(html_lines)


def render_markdown(md_text: str) -> str:
    if HAS_MARKDOWN:
        return markdown.markdown(
            md_text,
            extensions=[
                "tables",
                "fenced_code",
                "toc",
                "attr_list",
                "sane_lists",
            ],
            output_format="html5",
        )
    return simple_markdown_to_html(md_text)


def build_app():
    """Build the Vite app into DIST_DIR and copy to SITE_DIR."""
    print(">>> Step 1: Building SciMetro Studio web application...")

    # Check if npm or bun is available
    has_npm = shutil.which("npm") is not None
    has_bun = shutil.which("bun") is not None

    built = False
    if has_npm:
        try:
            print("Running `npm run build`...")
            subprocess.run(["npm", "run", "build"], cwd=REPO_ROOT, check=True)
            built = True
        except subprocess.CalledProcessError as e:
            print(f"Warning: `npm run build` failed: {e}", file=sys.stderr)
    elif has_bun:
        try:
            print("Running `bun run build`...")
            subprocess.run(["bun", "run", "build"], cwd=REPO_ROOT, check=True)
            built = True
        except subprocess.CalledProcessError as e:
            print(f"Warning: `bun run build` failed: {e}", file=sys.stderr)

    SITE_DIR.mkdir(parents=True, exist_ok=True)

    if built and DIST_DIR.exists():
        print(f"Copying built assets from {DIST_DIR} to {SITE_DIR}...")
        for item in DIST_DIR.iterdir():
            dest = SITE_DIR / item.name
            if item.is_dir():
                if dest.exists():
                    shutil.rmtree(dest)
                shutil.copytree(item, dest)
            else:
                shutil.copy2(item, dest)
    else:
        # Fallback: copy root index.html and assets if dist not produced
        print("Notice: using root index.html fallback for static site.")
        if (REPO_ROOT / "index.html").exists():
            shutil.copy2(REPO_ROOT / "index.html", SITE_DIR / "index.html")

    # Ensure 404.html exists for SPA client-side routing on GitHub Pages
    if (SITE_DIR / "index.html").exists():
        shutil.copy2(SITE_DIR / "index.html", SITE_DIR / "404.html")

    # Add .nojekyll to prevent Jekyll from bypassing underscore folders
    (SITE_DIR / ".nojekyll").touch()


def build_studies():
    """Scan studies directory, render markdown to HTML, and build JSON index."""
    print(f">>> Step 2: Processing stored studies from '{STUDIES_DIR}'...")

    studies_list = []
    site_studies_dir = SITE_DIR / "studies"
    site_studies_dir.mkdir(parents=True, exist_ok=True)

    if STUDIES_DIR.exists() and STUDIES_DIR.is_dir():
        for item in sorted(STUDIES_DIR.iterdir()):
            if not item.is_dir():
                continue

            slug = item.name
            paper_file = item / "paper.md"
            data_file = item / "data.json"

            if not paper_file.exists():
                continue

            print(f"  - Processing study: {slug}")
            paper_md = paper_file.read_text(encoding="utf-8")

            # Try to read data.json if available
            study_data = {}
            if data_file.exists():
                try:
                    study_data = json.loads(data_file.read_text(encoding="utf-8"))
                except Exception as err:
                    print(f"    Warning: Could not parse {data_file}: {err}")

            # Derive title and topic
            title = slug.replace("-", " ").title()
            for line in paper_md.splitlines():
                if line.startswith("# "):
                    title = line[2:].strip()
                    break

            topic = study_data.get("topic") or (
                study_data.get("wikidata", {}).get("label") if isinstance(study_data.get("wikidata"), dict) else None
            ) or title

            date_str = study_data.get("generatedAt") or study_data.get("date") or "Recently"
            if "T" in str(date_str):
                date_str = str(date_str).split("T")[0]

            works_count = len(study_data.get("works", [])) if "works" in study_data else study_data.get("worksCount", "N/A")
            database = study_data.get("database") or "Wikidata (QLever)"

            # Copy raw files
            study_dest_dir = site_studies_dir / slug
            study_dest_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(paper_file, study_dest_dir / "paper.md")
            if data_file.exists():
                shutil.copy2(data_file, study_dest_dir / "data.json")

            # Render HTML
            html_content = render_markdown(paper_md)
            meta_desc = f"Scientometric study on {topic}. {works_count} publications analyzed via {database}."

            h_index = study_data.get("stats", {}).get("hIndex")
            extra_meta = f'<div class="study-meta-item">h-Index: <strong>{h_index}</strong></div>' if h_index else ""

            rendered_html = ACADEMIC_PAGE_TEMPLATE.format(
                title=title,
                meta_description=meta_desc,
                topic=topic,
                date=date_str,
                works_count=works_count,
                database=database,
                extra_meta=extra_meta,
                content_html=html_content,
            )

            (study_dest_dir / "index.html").write_text(rendered_html, encoding="utf-8")

            studies_list.append({
                "slug": slug,
                "title": title,
                "topic": topic,
                "date": date_str,
                "works": works_count if isinstance(works_count, int) else None,
                "database": database,
                "hIndex": h_index,
                "paperMarkdown": paper_md,
                "jsonData": json.dumps(study_data) if study_data else "{}",
                "savedAt": date_str,
                "path": f"studies/{slug}/",
            })

    # Generate studies index page
    if studies_list:
        cards_html = []
        for s in studies_list:
            works_badge = f'<span class="badge">{s["works"]} works</span>' if s.get("works") is not None else ""
            h_badge = f'<span class="badge">h-index: {s["hIndex"]}</span>' if s.get("hIndex") is not None else ""
            cards_html.append(f"""
            <a href="{s['slug']}/" class="card">
              <div>
                <div class="card-topic">{s['topic']}</div>
                <h2 class="card-title">{s['title']}</h2>
              </div>
              <div class="card-footer">
                <span>{s['date']}</span>
                <div style="display:flex;gap:0.4rem;">
                  {works_badge}
                  {h_badge}
                </div>
              </div>
            </a>
            """)
        studies_content = f'<div class="grid">{"".join(cards_html)}</div>'
    else:
        studies_content = """
        <div class="empty-state">
          <h3>No stored studies yet</h3>
          <p>Generate your first scientometric study in SciMetro Studio and store it to this repository!</p>
          <a href="../" class="btn">Open SciMetro Studio</a>
        </div>
        """

    studies_index_html = INDEX_PAGE_TEMPLATE.format(studies_content=studies_content)
    (site_studies_dir / "index.html").write_text(studies_index_html, encoding="utf-8")

    # Export studies metadata JSON for the SPA
    studies_json_content = json.dumps(studies_list, indent=2)
    (SITE_DIR / "studies.json").write_text(studies_json_content, encoding="utf-8")
    (site_studies_dir / "index.json").write_text(studies_json_content, encoding="utf-8")

    print(f"Finished processing {len(studies_list)} studies.")


def main():
    print("=" * 60)
    print(" SciMetro Studio - Site Builder")
    print("=" * 60)
    build_app()
    build_studies()
    print("=" * 60)
    print(f" Build complete! Output directory: {SITE_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    main()
