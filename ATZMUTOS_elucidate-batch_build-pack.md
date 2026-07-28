# BUILD PACK — Batch Elucidation Pipeline (Interleaved Format)

**Repo:** `C:\dev\atzmutos`
**Branch:** `feat/elucidate-batch-parkland`
**Session-atomic.** Do not proceed past a failing gate.

Load `nafs-dev-system` and `source-grounding` before writing anything.

---

## DO NOT TOUCH

`atzmutos` is a shipped MCP server (11/11 tests, `dist/index.js`, npm publish deferred). This build adds a
sibling document pipeline. It must not modify:

- `src/**`, `dist/**`, `test/**`
- `package.json`, `tsconfig.json`, MCP tool definitions
- anything under version control that predates this branch

New work lives only in `build/`, `output/`, and `STATE.md`.

---

## STEP 0 — READ THE ACTUAL SOURCE. GENERATE NOTHING.

Read `STATE.md`. Summarize where the last session left off. Surface any orphaned `opened:` line.

Then inventory `C:\dev\atzmutos\source uploads\` (note the space — quote every path).

For **each** PDF, report a row:

| file | pages | text layer? | Hebrew reversed? | custom font encoding? | genre | date/parsha | mugah? |
|---|---|---|---|---|---|---|---|

Detection rules:

- **Text layer** — `pdftotext -f 1 -l 1`. Empty or garbage → scanned.
- **Hebrew reversal** — extract a line, test for reversed high-frequency tokens (`רשא` for `אשר`,
  `הרותה` for `התורה`, `ה"בקה` for `הקב"ה`). If found, the whole document needs `[::-1]` per line.
- **Custom font encoding** — extracted glyphs are Latin/mojibake where Hebrew is visually present.
  Route to rasterize-first: `pdftoppm -r 400 -png` → Tesseract `-l heb`.
- **Genre** — read the source. Sicha ≠ maamar. Never infer from the folder name or filename.
- **Mugah** — look for the מוגה mark or the absence of it. Label honestly; `bilti-mugah` when
  unmarked.

**GATE 0.** Print the table. Print the proposed output filenames. Stop. Wait for approval.
Do not write a single line of the generator until this table is confirmed.

---

## STEP 1 — LAYOUT SPEC (this is the change from the prior format)

The two-column Hebrew-right / English-left table is **retired for this format**. Replaced by a
single-column interleaved flow modeled on *Lessons in Tanya*: Hebrew leads, English translation
answers it in bold, elucidation follows in a lighter register.

### Page geometry

Letter, margins `0.75in`. Usable width `7.0in`, divided as a CSS grid:

```
rail 1.5in | gutter 0.3in | main 5.2in
```

One grid row per unit. Rail is **left on every page** — not mirrored.
`# DECISION:` fixed rail rather than recto/verso mirroring, because WeasyPrint resolves page breaks
after grid layout and cannot flip column order per page.

### The unit

A unit is a **clause group of 2–3 lines of Hebrew** — a complete thought, broken at natural syntactic
seams, never mid-clause. Three stacked children in the main column:

| element | font | size / leading | weight | color |
|---|---|---|---|---|
| `.heb` | Frank Ruhl Libre **-hebrew-** variant | 13pt / 1.7 | 400 | `--gold-print` |
| `.en` | EB Garamond | 11.5pt / 1.45 | **700** | `--ink` |
| `.eluc` | EB Garamond | 10pt / 1.55 | 400 | `--ink-muted` |

- `.heb` requires `direction: rtl; unicode-bidi: isolate;`
- `.eluc` gets `padding-left: 0.9em` — a quiet indent, not a border
- `.unit { break-inside: avoid; }` — a unit never splits across a page
- Vertical rhythm: `1.1em` between the three children, `2.0em` between units

### Ois headings

Eyebrow label: Hebrew ois letter + small-caps Latin, letterspaced `0.08em`, `--gold-print`, hairline
rule beneath. Spans the full 7.0in (rail + gutter + main).

### Rail notes — general ideas

`.rail-note` in the rail cell of the unit it annotates. 8.5pt / 1.4, `--ink-muted`, hairline rule
above (`1px solid var(--rule)`), no box, no fill.

**Hard cap 45 words.** Anything longer is not a rail note — promote it to a concept box.

### Concept boxes — foundational ideas

`.concept` in the main column, inline at the **first appearance** of the concept. Full main-column
width, `1px solid var(--rule)`, fill `--parchment-deep`, padding `0.85em`, zero border-radius.
Eyebrow label inside. 9.5pt body.

Never defer a foundational concept to a trailing glossary.

### Page-1 header block

```
CHABAD OF PARKLAND        ← bold, letterspaced, --ink, above everything
[Hebrew title]            ← Frank Ruhl Libre, --gold-print
[English title]
[genre] · [date / parsha] · [mugah | bilti-mugah]
```

Bold and unmistakable. Not a running header, not a footer — page 1 only, as specified.

### Footer

Page number, right-aligned, 8pt `--ink-muted`. Nothing else.
**Yaffe / YF must not appear in the colophon, footer, or any printed surface.** Public name is
OpenChassidus, and only if attribution is warranted at all.

### Tokens (light mode)

```css
--parchment:      #faf8f3;
--parchment-deep: #f2eee2;
--ink:            #1a1a18;
--ink-muted:      #4a4844;
--rule:           #d8d2c4;
--gold-print:     #8a6a1e;
```

`# DECISION:` `--gold-print: #8a6a1e` substitutes for the `#C8A84A` token. `#C8A84A` on `#faf8f3`
measures ~1.9:1 — illegible in print, and this document's entire purpose is readability for people
with limited Hebrew. Same hue family, print-safe luminance. Gold remains reserved exclusively for
Hebrew text and eyebrow labels. Flag this in the commit message; revert if rejected.

No Tailwind arbitrary values. CSS custom properties only. Zero border-radius. No emoji.

---

## STEP 2 — GENERATOR

`build/elucidate_batch.py`. Stack: WeasyPrint + base64-embedded TTF converted from woff2 via
fontTools. Cache fonts in `build/assets/fonts/`; acquire from the fontsource GitHub mirror once,
then work offline.

Fonts: Frank Ruhl Libre (**`-hebrew-` variants required for RTL**), EB Garamond, JetBrains Mono
(monospace only where genuinely needed).

Bilingual or aligned structures use HTML `<table>`. Not CSS flex. Not grid. The rail is the one
grid exception and it is a single top-level container.

### Source-grounding constraints — non-negotiable

- Every Hebrew line traces to extracted source text. **Never reconstruct from memory.**
- Extraction failure on a line emits a literal `[[EXTRACTION GAP — p.N]]` marker in the output.
  Do not paper over it. Do not guess the missing words.
- No gematria assertion without an independent script verification in the same run. Unverified →
  omit, or label `UNVERIFIED` inline.
- Citation taxonomy applies: VERIFIED / UNVERIFIED / ERRONEOUS. Misattribution is a substantive
  wrong, not a formatting defect.
- Do not fetch daiah.org. If a source gap needs filling, print the exact search string and what to
  copy, and stop.

### CLI

```
python build/elucidate_batch.py --all
python build/elucidate_batch.py --file "<name>.pdf"
python build/elucidate_batch.py --all --dry-run     # HTML only, no PDF
```

Sequential. Continue on error, collect failures, print a summary table at the end.
Output: `C:\dev\atzmutos\output\<slug>.pdf`, one per source.

---

## STEP 3 — QA

For every generated PDF: `pdftoppm -r 120 -png` page 1 plus two interior pages. Inspect and confirm:

1. Hebrew reads right-to-left, correct character order, no reversal artifacts
2. Bold English is visibly heavier than the elucidation at reading distance
3. **CHABAD OF PARKLAND** is unmistakable on page 1
4. No unit split across a page break
5. Rail notes align vertically with the unit they annotate
6. Concept boxes sit at first appearance, not clustered at the end
7. Gold is legible on parchment
8. No `[[EXTRACTION GAP]]` markers left unreported

**GATE 3.** Report results per file. Any failure on 1, 2, or 8 blocks the batch.

---

## STEP 4 — CLOSE

- One concern per commit. `# DECISION:` comments wherever implementation diverges from this spec.
- `gh auth switch -u reshimu` before any push. Per-repo `user.name=reshimu`,
  `email=shimon@reshimu.ai`.
- No merge to `main` without review.
- Update `STATE.md` — all 10 fields, append the closed session line. Show the diff. Write only
  after approval.

---

## OUT OF SCOPE

- Shabbos-table dvar Torah section (that is the `Go` register, not `elucidate`)
- Trailing glossary
- Dark mode
- Anything touching the MCP server
