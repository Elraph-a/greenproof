"""Convert a Markdown file to a Word .docx document.

Built for sharing GreenProof docs with teammates who won't open a .md file.

Handles: headings, bold/italic/code, pipe tables, bullet and numbered lists,
blockquotes, horizontal rules, and links.

Run:  python tools/md_to_docx.py GreenProof_CONTEXT.md TEAM_BRIEF.md
"""

import re
import sys
import os
from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH

INLINE = re.compile(r"(\*\*.+?\*\*|(?<!\*)\*[^*\n]+?\*(?!\*)|`[^`\n]+?`|\[[^\]\n]+\]\([^)\n]+\)|~~.+?~~)")
LINK = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")


def add_runs(par, text):
    """Write text into a paragraph, honouring inline markdown."""
    for tok in INLINE.split(text):
        if not tok:
            continue
        if tok.startswith("**") and tok.endswith("**"):
            par.add_run(tok[2:-2]).bold = True
        elif tok.startswith("~~") and tok.endswith("~~"):
            r = par.add_run(tok[2:-2])
            r.font.strike = True
            r.font.color.rgb = RGBColor(0x80, 0x80, 0x80)
        elif tok.startswith("*") and tok.endswith("*") and len(tok) > 2:
            par.add_run(tok[1:-1]).italic = True
        elif tok.startswith("`") and tok.endswith("`"):
            r = par.add_run(tok[1:-1])
            r.font.name = "Consolas"
            r.font.size = Pt(10)
            r.font.color.rgb = RGBColor(0xB0, 0x30, 0x30)
        elif tok.startswith("["):
            m = LINK.match(tok)
            if m:
                label, url = m.group(1), m.group(2)
                add_runs(par, label)
                if url.startswith("http"):
                    r = par.add_run(f" ({url})")
                    r.font.size = Pt(8)
                    r.font.color.rgb = RGBColor(0x60, 0x60, 0x60)
            else:
                par.add_run(tok)
        else:
            par.add_run(tok)


def flush_table(doc, rows):
    """rows: list of lists of cell strings. First row is the header."""
    if not rows:
        return
    ncols = max(len(r) for r in rows)
    table = doc.add_table(rows=0, cols=ncols)
    table.style = "Table Grid"
    for i, row in enumerate(rows):
        cells = table.add_row().cells
        for j in range(ncols):
            text = row[j] if j < len(row) else ""
            par = cells[j].paragraphs[0]
            add_runs(par, text)
            if i == 0:
                for run in par.runs:
                    run.bold = True
    doc.add_paragraph()


def split_row(line):
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [c.strip() for c in line.split("|")]


def is_sep(line):
    return bool(re.fullmatch(r"\|?[\s:|-]+\|?", line.strip())) and "-" in line


def convert(src, dst):
    lines = open(src, encoding="utf-8").read().split("\n")
    doc = Document()

    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)
    style.paragraph_format.space_after = Pt(6)
    for s in doc.sections:
        s.left_margin = s.right_margin = Inches(0.9)

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # blank
        if not stripped:
            i += 1
            continue

        # horizontal rule
        if re.fullmatch(r"(-{3,}|\*{3,}|_{3,})", stripped):
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            add_runs(p, "―" * 40)
            for r in p.runs:
                r.font.color.rgb = RGBColor(0xCC, 0xCC, 0xCC)
            i += 1
            continue

        # fenced code
        if stripped.startswith("```"):
            i += 1
            buf = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.3)
            r = p.add_run("\n".join(buf))
            r.font.name = "Consolas"
            r.font.size = Pt(9)
            continue

        # heading
        m = re.match(r"(#{1,6})\s+(.*)", stripped)
        if m:
            level = len(m.group(1))
            text = m.group(2).strip()
            h = doc.add_heading("", level=min(level, 4))
            add_runs(h, text)
            for r in h.runs:
                r.font.color.rgb = RGBColor(0x1B, 0x4D, 0x3E)   # deep forest green
            i += 1
            continue

        # table
        if stripped.startswith("|") and i + 1 < len(lines) and is_sep(lines[i + 1]):
            rows = [split_row(stripped)]
            i += 2
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(split_row(lines[i]))
                i += 1
            flush_table(doc, rows)
            continue

        # blockquote
        if stripped.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip().lstrip(">").strip())
                i += 1
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.35)
            p.paragraph_format.space_before = Pt(6)
            p.paragraph_format.space_after = Pt(6)
            add_runs(p, " ".join(x for x in buf if x))
            for r in p.runs:
                r.italic = True
                if r.font.color.rgb is None:
                    r.font.color.rgb = RGBColor(0x33, 0x55, 0x44)
            continue

        # bullet / numbered list
        mb = re.match(r"[-*+]\s+(.*)", stripped)
        mn = re.match(r"(\d+)[.)]\s+(.*)", stripped)
        if mb or mn:
            text = mb.group(1) if mb else mn.group(2)
            indent = (len(line) - len(line.lstrip())) // 2
            style_name = "List Bullet" if mb else "List Number"
            if indent >= 1:
                style_name += " 2" if indent == 1 else " 3"
            try:
                p = doc.add_paragraph(style=style_name)
            except KeyError:
                p = doc.add_paragraph(style="List Bullet")
            add_runs(p, text)
            i += 1
            # continuation lines
            while (i < len(lines) and lines[i].strip()
                   and not re.match(r"([-*+]|\d+[.)]|#{1,6})\s", lines[i].strip())
                   and lines[i].startswith(" ")):
                add_runs(p, " " + lines[i].strip())
                i += 1
            continue

        # paragraph (join wrapped lines)
        buf = [stripped]
        i += 1
        while (i < len(lines) and lines[i].strip()
               and not re.match(r"(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||```)", lines[i].strip())
               and not re.fullmatch(r"(-{3,}|\*{3,}|_{3,})", lines[i].strip())):
            buf.append(lines[i].strip())
            i += 1
        p = doc.add_paragraph()
        add_runs(p, " ".join(buf))

    doc.save(dst)
    return dst


if __name__ == "__main__":
    srcs = sys.argv[1:] or ["GreenProof_CONTEXT.md", "TEAM_BRIEF.md"]
    for src in srcs:
        if not os.path.exists(src):
            print(f"skip (not found): {src}")
            continue
        dst = os.path.splitext(os.path.basename(src))[0] + ".docx"
        convert(src, dst)
        print(f"{src}  ->  {dst}  ({os.path.getsize(dst)//1024} KB)")
