"""Rebuild the site chrome on every page from one project list.

Writes the header and tabs, the sidebar, the previous/next pager, the footer links, the project cards
on projects/ and the contact cards on contact/. Each generated region sits between <!--zx:NAME--> and
<!--/zx:NAME--> markers; everything outside the markers is left alone.

To add a project: add an entry to PROJECTS (its pages must exist), then run
    python3 tools/build_nav.py
"""
import re
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent

PROJECTS = [
    {
        "id": "perch", "name": "Perch", "icon": "server",
        "area": "LLM serving", "status": "Evaluation release",
        "blurb": "Runs beneath unmodified vLLM and lets each GPU serve many models while holding first-token and per-token deadlines. Measured 10 models per GPU, no answers lost.",
        "contact": ("perch/#contact", "Send a request log, get a capacity report"),
        "hint": "The models you serve, your GPUs, and your first-token and per-token targets",
        "pages": [("perch/", "Overview", "server")],
    },
    {
        "id": "proprio", "name": "Proprio", "icon": "bot",
        "area": "Robot inference", "status": "Technical preview",
        "blurb": "Runs an unmodified vision-language-action robot policy faster and proves, tick by tick, that the actions are bit-identical to the policy as trained.",
        "contact": ("proprio/#contact", "Send a checkpoint, get a certificate"),
        "hint": "The policy, the GPU and the control rate you need",
        "pages": [("proprio/", "Overview", "bot")],
    },
    {
        "id": "atelier-studio", "name": "Atelier Studio", "icon": "sparkles",
        "area": "Chip design", "status": "Technical preview",
        "blurb": "AI-powered chip design exploration. Design better chips, faster, with architecture and compiler optimized together for your workloads.",
        "contact": ("engine/#contact", "Request a design-partner pilot"),
        "hint": "Your model, and its frame or token rate, power and area targets",
        "pages": [("engine/", "Overview", "sparkles"), ("technology/", "Technology", "layers"),
                  ("benchmarks/", "Benchmarks", "chart"), ("demo/", "Live demo", "play")],
    },
    {
        "id": "sutra", "name": "Sutra NPU IP", "icon": "cpu",
        "area": "Silicon IP", "status": "Evaluation preview",
        "blurb": "A digital in-memory-compute AI accelerator IP for language and vision models at the edge, with a RISC-V control core, generated and verified for your model.",
        "contact": ("ip/#contact", "Run your workload on Sutra"),
        "hint": "The model to run on Sutra and the rate it needs",
        "pages": [("ip/", "Overview", "cpu")],
    },
]
EMAIL = "hello@zenedgex.in"
TABS = [("", "Home"), ("projects/", "Projects"), ("contact/", "Contact")]

ICONS = {
    "home": '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    "grid": '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    "sparkles": '<path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z"/><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z"/>',
    "cpu": '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
    "server": '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6"/>',
    "bot": '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 4h6"/><circle cx="9" cy="14" r="1.2"/><circle cx="15" cy="14" r="1.2"/>',
    "chart": '<path d="M3 3v18h18"/><path d="M8 17v-5M13 17V8M18 17V9"/>',
    "layers": '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    "play": '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5.5 3.5-5.5 3.5z"/>',
    "message": '<path d="M21 12a8 8 0 0 1-11.8 7L4 20.5l1.5-5A8 8 0 1 1 21 12z"/>',
    "mail": '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    "ext": '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    "menu": '<path d="M4 7h16M4 12h16M4 17h16"/>',
    "search": '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    "left": '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    "right": '<path d="M5 12h14M13 6l6 6-6 6"/>',
}
LOGO = ('<svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="{id}" x1="10" y1="54" x2="54" y2="10" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#6A9A2C"/><stop offset="1" stop-color="#A9CC72"/></linearGradient></defs><rect x="1" y="1" width="62" height="62" rx="15" fill="#F3F5EF"/>'
        + "".join(f'<rect x="{x + .9}" y="{y + .9}" width="10.2" height="10.2" rx="2" fill="none" stroke="#C3C9D1" stroke-width="1.8"/>' if not on else f'<rect x="{x}" y="{y}" width="12" height="12" rx="2.5" fill="url(#{{id}})"/>'
                  for (x, y, on) in [(10, 10, 0), (26, 10, 0), (42, 10, 1), (10, 26, 0), (26, 26, 1), (42, 26, 0), (10, 42, 1), (26, 42, 0), (42, 42, 0)])
        + "</svg>")


def svg(name, cls=""):
    c = f' class="{cls}"' if cls else ""
    return f'<svg{c} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICONS[name]}</svg>'


def logo(gid):
    return LOGO.replace("{id}", gid)


# Every page, in reading order: (path, title for the pager and search, tab it belongs to)
ORDER = [("projects/", "Projects", "projects/")]
for p in PROJECTS:
    for path, label, _ in p["pages"]:
        ORDER.append((path, p["name"] if label == "Overview" else f'{p["name"]} · {label}', "projects/"))
ORDER.append(("contact/", "Contact", "contact/"))
TITLE = {path: title for path, title, _ in ORDER} | {"": "Home"}
TAB_OF = {path: tab for path, _, tab in ORDER} | {"": ""}


def href(rel, path):
    return rel + path or "./"


def header(rel, here, progress):
    cur = ' aria-current="page"'
    tabs = "".join(f'<a href="{href(rel, p)}"{cur if TAB_OF[here] == p else ""}>{n}</a>' for p, n in TABS)
    prog = '\n  <div class="progress" id="progress" aria-hidden="true"></div>' if progress else ""
    return f'''<header class="zx-header">
  <div class="zx-header__row">
    <button class="zx-icon-btn zx-menu" type="button" aria-label="Open navigation" aria-controls="zx-side" aria-expanded="false">{svg("menu")}</button>
    <a class="zx-logo" href="{href(rel, "")}">{logo("mkg")}<span>ZenEdgeX</span></a>
    <div class="zx-header__end">
      <button class="zx-search-btn" type="button" data-zx-search aria-label="Search">{svg("search")}<span>Search</span><kbd>⌘K</kbd></button>
      <a class="zx-pill" href="{href(rel, "contact/")}">Contact us</a>
    </div>
  </div>{prog}
</header>
<nav class="zx-tabs" aria-label="Main"><div class="zx-tabs__in">{tabs}</div></nav>'''


def side(rel, here):
    def link(path, label, icon, page):
        cur = ' aria-current="page"' if path == here else ""
        return f'    <a class="zx-nav__link" href="{href(rel, path)}" data-zx-page="{page}"{cur}>{svg(icon)}<span>{label}</span></a>'
    rows = [link("", "Home", "home", "Home"), link("projects/", "All projects", "grid", "Projects")]
    for p in PROJECTS:
        rows.append(f'    <p class="zx-nav__group">{p["name"]}</p>')
        rows += [link(path, label, icon, TITLE[path]) for path, label, icon in p["pages"]]
    rows += ['    <p class="zx-nav__group">Company</p>', link("contact/", "Contact", "message", "Contact"),
             f'    <a class="zx-nav__link" href="mailto:{EMAIL}">{svg("mail")}<span>{EMAIL}</span>{svg("ext", "ext")}</a>']
    return (f'<aside class="zx-side" id="zx-side" aria-label="Site">\n'
            f'  <div class="zx-side__head"><a class="zx-logo" href="{href(rel, "")}">{logo("mkg-side")}<span>ZenEdgeX</span></a></div>\n'
            f'  <nav class="zx-nav" aria-label="Pages">\n' + "\n".join(rows) + "\n  </nav>\n</aside>")


def pager(rel, here):
    i = [p for p, _, _ in ORDER].index(here)
    out = []
    if i > 0:
        p, t, _ = ORDER[i - 1]
        out.append(f'<a class="prev" href="{href(rel, p)}">{svg("left")}<span><small>Previous</small><b>{t}</b></span></a>')
    if i < len(ORDER) - 1:
        p, t, _ = ORDER[i + 1]
        out.append(f'<a class="next" href="{href(rel, p)}"><span><small>Next</small><b>{t}</b></span>{svg("right")}</a>')
    return '<nav class="zx-pager" aria-label="Pages">' + "".join(out) + "</nav>"


def footnav(rel):
    return (f'<nav aria-label="Footer"><a href="{href(rel, "projects/")}">Projects</a>'
            f'<a href="{href(rel, "contact/")}">Contact</a><a href="mailto:{EMAIL}">{EMAIL}</a></nav>')


def project_cards(rel):
    cards = []
    for p in PROJECTS:
        links = "".join(f'<li><a href="{href(rel, path)}">{label}</a></li>' for path, label, _ in p["pages"])
        cards.append(f'''  <article class="zx-card" id="{p["id"]}">
    <div class="zx-card__head">{svg(p["icon"])}<h2><a href="{href(rel, p["pages"][0][0])}">{p["name"]}</a></h2></div>
    <p class="zx-card__meta">{p["area"]} · {p["status"]}</p>
    <p>{p["blurb"]}</p>
    <ul class="zx-card__links">{links}</ul>
  </article>''')
    return '<div class="zx-cards">\n' + "\n".join(cards) + "\n</div>"


def contact_cards(rel):
    cards = []
    for p in PROJECTS:
        path, label = p["contact"]
        target = "#" + path.split("#")[1] if path.startswith("contact/") else href(rel, path)
        cards.append(f'  <a class="zx-card zx-card--link" href="{target}"><div class="zx-card__head">{svg(p["icon"])}<b>{p["name"]}</b></div>'
                     f'<p class="zx-card__meta">{p["area"]}</p><p>{label} →</p></a>')
    return '<div class="zx-cards zx-cards--compact">\n' + "\n".join(cards) + "\n</div>"


def project_options():
    # the first project is the default choice
    return "\n".join(f'        <option value="{p["id"]}" data-hint="{p["hint"]}"{" selected" if i == 0 else ""}>{p["name"]}</option>'
                     for i, p in enumerate(PROJECTS))


def fill(s, name, body):
    pat = re.compile(rf"<!--zx:{name}-->.*?<!--/zx:{name}-->", re.S)
    if not pat.search(s):
        return s
    return pat.sub(lambda _: f"<!--zx:{name}-->\n{body}\n<!--/zx:{name}-->", s)


def main():
    for path in [""] + [p for p, _, _ in ORDER]:
        f = SITE / path / "index.html"
        s = f.read_text()
        rel = "../" * path.count("/")
        progress = 'id="progress"' in re.search(r"<!--zx:header-->.*?<!--/zx:header-->", s, re.S).group(0)
        s = fill(s, "header", header(rel, path, progress))
        s = fill(s, "side", side(rel, path))
        if path:
            s = fill(s, "pager", pager(rel, path))
        s = fill(s, "footnav", footnav(rel))
        s = fill(s, "projects", project_cards(rel))
        s = fill(s, "contacts", contact_cards(rel))
        s = fill(s, "projopts", project_options())
        f.write_text(s)
        print("built", f.relative_to(SITE))


if __name__ == "__main__":
    main()
