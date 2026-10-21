"""Assemble the GitHub Pages site: the app (index.html) plus a browsable
listing of the studies the app stored in the repo (studies/<slug>/paper.md + data.json)."""
import html, json, os, pathlib, re, shutil
import markdown

SRC = pathlib.Path(os.environ.get("STUDIES_DIR", "studies").strip("/"))
OUT = pathlib.Path("_site")
OUT.mkdir(exist_ok=True)
shutil.copy("index.html", OUT / "index.html")

CSS = """<style>
body{font:16px/1.6 system-ui,sans-serif;max-width:860px;margin:0 auto;padding:24px 16px;color:#1a1a1a;background:#fff}
@media(prefers-color-scheme:dark){body{background:#151515;color:#eee}a{color:#6ea2ff}td,th{border-color:#3a3a3a!important}}
table{border-collapse:collapse;display:block;overflow-x:auto}td,th{border-bottom:1px solid #d8d8d4;padding:4px 10px;text-align:left}
code{font-size:.9em}
</style>"""

def page(title, body):
    return (f'<!doctype html><html lang="en"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{html.escape(title)}</title>{CSS}</head><body>{body}</body></html>')

items = []
if SRC.is_dir():
    for d in sorted(SRC.iterdir(), reverse=True):
        paper, data = d / "paper.md", d / "data.json"
        if not (d.is_dir() and paper.exists()):
            continue
        dest = OUT / SRC.name / d.name
        dest.mkdir(parents=True, exist_ok=True)
        md = paper.read_text(encoding="utf-8")
        m = re.match(r"#\s+(.+)", md)
        title = m.group(1).strip() if m else d.name
        (dest / "paper.html").write_text(
            page(title, '<p><a href="../">&larr; All studies</a></p>' +
                 markdown.markdown(md, extensions=["tables"])), encoding="utf-8")
        shutil.copy(paper, dest / "paper.md")
        meta = {}
        if data.exists():
            shutil.copy(data, dest / "data.json")
            try:
                meta = json.loads(data.read_text(encoding="utf-8"))
            except Exception:
                pass
        date = re.search(r"(\d{4}-\d{2}-\d{2})$", d.name)
        items.append({
            "slug": d.name, "title": title, "date": date.group(1) if date else "",
            "works": (meta.get("stats") or {}).get("docs"),
            "database": meta.get("database", "DBLP"),
            "paper": f"{d.name}/paper.html", "markdown": f"{d.name}/paper.md", "data": f"{d.name}/data.json",
        })

(OUT / SRC.name).mkdir(exist_ok=True)
(OUT / SRC.name / "index.json").write_text(json.dumps(items, indent=1, ensure_ascii=False), encoding="utf-8")
rows = "".join(
    f'<tr><td>{html.escape(i["date"])}</td><td><a href="{i["paper"]}">{html.escape(i["title"])}</a></td>'
    f'<td>{i["works"] if i["works"] is not None else ""}</td>'
    f'<td><a href="{i["markdown"]}">md</a> · <a href="{i["data"]}">json</a></td></tr>' for i in items)
body = ('<p><a href="../">&larr; Study generator</a></p><h1>Stored studies</h1>' +
        (f'<table><tr><th>Date</th><th>Study</th><th>Works</th><th>Files</th></tr>{rows}</table>' if items
         else '<p>No studies stored yet.</p>'))
(OUT / SRC.name / "index.html").write_text(page("Stored studies", body), encoding="utf-8")
print(f"Built site with {len(items)} stored studies")
