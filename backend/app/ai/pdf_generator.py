"""
PDF generator — converts AI research report markdown to a styled PDF.

Pipeline: markdown → HTML (Jinja2 template + CSS) → PDF (WeasyPrint)
"""
import markdown2
from weasyprint import HTML as WeasyprintHTML
from datetime import datetime

PDF_CSS = """
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

@page {
    size: A4;
    margin: 2.5cm 2.4cm 2.5cm 2.4cm;
    @bottom-center {
        content: counter(page) " / " counter(pages);
        font-size: 8.5pt;
        color: #aaa;
    }
}

body {
    font-family: Liberation Sans, Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.75;
    color: #111;
}

.header {
    margin-bottom: 28pt;
}

.ticker {
    font-family: Liberation Sans, Arial, sans-serif;
    font-size: 30pt;
    font-weight: 700;
    color: #111;
    letter-spacing: -0.5px;
    line-height: 1;
}

.company-name {
    font-family: Liberation Sans, Arial, sans-serif;
    font-size: 12pt;
    color: #555;
    margin-top: 3pt;
}

.meta-row {
    margin-top: 10pt;
    font-family: Liberation Sans, Arial, sans-serif;
    font-size: 9pt;
    color: #777;
}

.meta-row span {
    margin-right: 18pt;
}

.divider {
    border: none;
    border-top: 1.5px solid #111;
    margin: 14pt 0 0 0;
}

h1 {
    font-family: Liberation Sans, Arial, sans-serif;
    font-size: 17pt;
    font-weight: 700;
    color: #111;
    margin-top: 28pt;
    margin-bottom: 10pt;
}

h2 {
    font-family: Liberation Sans, Arial, sans-serif;
    font-size: 12pt;
    font-weight: 700;
    color: #111;
    margin-top: 22pt;
    margin-bottom: 7pt;
}

h3 {
    font-family: Liberation Sans, Arial, sans-serif;
    font-size: 10.5pt;
    font-weight: 600;
    font-style: italic;
    color: #444;
    margin-top: 14pt;
    margin-bottom: 5pt;
}

p {
    margin-bottom: 8pt;
    text-align: justify;
}

ul, ol {
    margin: 5pt 0 10pt 16pt;
}

li {
    margin-bottom: 3pt;
}

strong {
    font-weight: 700;
    color: #111;
}

blockquote {
    border-left: 2px solid #ccc;
    margin: 12pt 0;
    padding: 5pt 12pt;
    color: #555;
    font-style: italic;
}

hr {
    display: none;
}

table {
    width: 100%;
    border-collapse: collapse;
    margin: 12pt 0;
    font-family: Liberation Sans, Arial, sans-serif;
    font-size: 9.5pt;
}

thead {
    border-bottom: 1.5px solid #111;
}

th {
    text-align: left;
    padding: 5pt 8pt 5pt 0;
    font-weight: 600;
    color: #111;
}

td {
    padding: 4pt 8pt 4pt 0;
    color: #222;
    border-bottom: 0.5px solid #e0e0e0;
}

tr:last-child td {
    border-bottom: none;
}

a {
    color: #111;
    text-decoration: underline;
}

.footer {
    margin-top: 32pt;
    padding-top: 10pt;
    border-top: 0.5px solid #ccc;
    font-family: Liberation Sans, Arial, sans-serif;
    font-size: 7.5pt;
    color: #aaa;
}
"""

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<style>{css}</style>
</head>
<body>
<div class="header">
  <div class="ticker">{ticker}</div>
  <div class="company-name">{company_name}</div>
  <div class="meta-row">
    <span>{report_type_label}</span>
    <span>{date}</span>
    <span>${current_price}</span>
  </div>
  <div class="divider"></div>
</div>

<div class="content">
{content_html}
</div>

<div class="footer">
  Vygenerováno AI ({model_used}) · {generated_at} · Neslouží jako investiční poradenství.
</div>
</body>
</html>"""


REPORT_TYPE_LABELS = {
    "briefing": "Kvartální briefing",
    "full_analysis": "Komplexní analýza",
}


def generate_pdf(report: dict) -> bytes:
    """
    Convert a research report dict to PDF bytes.

    Args:
        report: dict with keys: markdown, ticker, company_name, report_type,
                current_price, generated_at, model_used

    Returns:
        PDF as bytes
    """
    import re
    md = report["markdown"]
    # Remove all emoji (WeasyPrint can't render them)
    md = re.sub(r'[\U00002600-\U000027BF]', '', md)  # misc symbols
    md = re.sub(r'[\U0001F000-\U0010FFFF]', '', md)  # supplementary planes
    # Clean up leftover double spaces from removed emoji
    md = re.sub(r'  +', ' ', md)
    md = re.sub(r'- +\n', '', md)  # remove empty list items

    # Convert markdown to HTML
    extras = ["fenced-code-blocks", "tables", "header-ids", "strike", "break-on-newline"]
    content_html = markdown2.markdown(md, extras=extras)

    generated_at = report.get("generated_at", "")
    try:
        dt = datetime.fromisoformat(generated_at)
        generated_at_fmt = dt.strftime("%-d. %-m. %Y %H:%M")
        date_fmt = dt.strftime("%-d. %-m. %Y")
    except Exception:
        generated_at_fmt = generated_at
        date_fmt = generated_at[:10]

    report_type = report.get("report_type", "briefing")

    html = HTML_TEMPLATE.format(
        css=PDF_CSS,
        ticker=report.get("ticker", ""),
        company_name=report.get("company_name", ""),
        report_type_label=REPORT_TYPE_LABELS.get(report_type, report_type),
        date=date_fmt,
        current_price=report.get("current_price", ""),
        model_used=report.get("model_used", ""),
        content_html=content_html,
        generated_at=generated_at_fmt,
    )

    pdf_bytes = WeasyprintHTML(string=html).write_pdf()
    return pdf_bytes
