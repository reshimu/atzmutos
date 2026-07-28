#!/usr/bin/env python3
"""
ATZMUTOS batch elucidation generator.
Interleaved Hebrew / English / elucidation format for Chabad of Parkland.
Spec: ATZMUTOS_elucidate-batch_build-pack.md (repo root).

# DECISION (approved 2026-07-28, Gate 0): the 8 source PDFs are free English
# translations of Rebbe maamarim (Mendy Levy / dvarmalchus.org / insidechassidus.org),
# not parallel Hebrew-original texts. There is no per-clause original Hebrew to
# interleave. Adaptation approved: possuk-anchored units. Each Hebrew Possuk
# quoted in the source is the .heb anchor; its surrounding English translation
# sentence is .en (bold); its paired footnote explanation is .eluc. Connective
# English prose between possukim (and the opening/closing matter) renders as
# plain body text in the main column, outside the 3-part unit stack.

# DECISION: footnote-to-possuk pairing is positional (Nth footnote on a page
# pairs with the Nth possuk-run on that page) since source footnote markers are
# inconsistent (Hebrew letters in most files, arabic numerals in Shoftim/Ki
# Sovoi). Spot-checked correct on samples; flagged for Step 3 QA per file.

# DECISION: source has no internal Ois-style section breaks (continuous maamar
# prose). One ois heading covers the whole maamar body, labeled with the
# maamar's Hebrew opening phrase from the metadata table.

# DECISION: --gold-print #8a6a1e substitutes for #C8A84A (contrast on
# --parchment measures ~1.9:1, illegible in print). Same hue family, print-safe
# luminance. Gold remains reserved for Hebrew text and eyebrow labels only.

# Source-grounding: every Hebrew line traces to extracted source text (pdftotext),
# never reconstructed from memory. Extraction failure on an interior page emits
# a literal [[EXTRACTION GAP -- p.N]] marker. Gematria assertions are verified
# against an independent mispar-hechrachi calculation in this same run; failures
# are labeled UNVERIFIED inline, never silently asserted. daiah.org is never
# fetched by this script.
"""
import argparse
import base64
import json
import re
import subprocess
import sys
import unicodedata
import urllib.request
import html
from html import escape
from pathlib import Path


def esc(s: str) -> str:
    """HTML-escape after stripping nikud -- per Shimon's 2026-07-28 request,
    nekudos are removed from all displayed Hebrew throughout. Safe to apply
    universally: the nikud Unicode range never appears in English text."""
    return escape(strip_nikud(s))

REPO = Path(__file__).resolve().parent.parent
SOURCE_DIR = REPO / "source uploads"
OUTPUT_DIR = REPO / "output"
FONTS_DIR = Path(__file__).resolve().parent / "assets" / "fonts"

# ---------------------------------------------------------------------------
# Gate 0 inventory (approved 2026-07-28) -- do not infer from filename alone;
# these were read from the actual source text.
# ---------------------------------------------------------------------------
DOCS = [
    dict(
        file="46. Eikev 5743 Rebbe's Maamor.pdf", slug="eikev-5743",
        heb_title="וְאָכַלְתָּ וְשָׂבָעְתָּ וּבֵרַכְתָּ אֶת הוי' אֱלֹקֶיךָ",
        en_title="Ve'Ochaltoh VeSovotoh Uveirachtoh Es Havaye Elokechoh",
        genre="Maamor — free translation & elucidation",
        date_parsha="Shabbos Parshas Eikev, 16 Menachem Av 5743",
        mugah="bilti-mugah",
        default_book="Deuteronomy",
    ),
    dict(
        file="47. Re'ay 5748 Rebbe's Maamor.pdf", slug="reeh-5748",
        heb_title="רְאֵה אָנֹכִי נֹתֵן לִפְנֵיכֶם הַיּוֹם בְּרָכָה", en_title="Re'ay Onochi Nossen",
        genre="Maamor — free translation & elucidation",
        date_parsha="Shabbos Parshas Re'eh, Elul 5748",
        mugah="bilti-mugah",
        default_book="Deuteronomy",
    ),
    dict(
        file="48. Shoftim 5729 Rebbe's Maamor.pdf", slug="shoftim-5729",
        heb_title="שֹׁפְטִים וְשֹׁטְרִים תִּתֶּן־לְךָ", en_title="Shoftim VeShotrim Titen Lecho",
        genre="Maamor — free translation & elucidation",
        date_parsha="Shabbos Parshas Shoftim, Elul 5729",
        mugah="bilti-mugah",
        default_book="Deuteronomy",
    ),
    dict(
        file="49. Ki Seitzei 5725 Rebbe's Maamor.pdf", slug="ki-seitzei-5725",
        heb_title="כִּי־תֵצֵא לַמִּלְחָמָה עַל־אֹיְבֶיךָ", en_title="Ki Seitzei LaMilchamah",
        genre="Maamor — free translation & elucidation (brief synopsis)",
        date_parsha="Shabbos Parshas Ki Seitzei, Elul 5725",
        mugah="bilti-mugah",
        default_book="Deuteronomy",
    ),
    dict(
        file="50. Ki Sovoi 5743 - Rebbe's Maamor.pdf", slug="ki-savo-5743",
        heb_title="וְהָיָה כִּי־תָבוֹא אֶל־הָאָרֶץ", en_title="VehHoyoh Ki Sovoi El HoOretz",
        genre="Maamor — free translation & elucidation",
        date_parsha="Shabbos Parshas Ki Savo 5743",
        mugah="bilti-mugah",
        default_book="Deuteronomy",
    ),
    dict(
        file="51. Nitzovim 5748 Rebbe's Maamor.pdf", slug="nitzavim-5748",
        heb_title="אַתֶּם נִצָּבִים הַיּוֹם כֻּלְּכֶם", en_title="Atem Nitzovim Hayom Kulchem",
        genre="Maamor — free translation & elucidation",
        date_parsha="Shabbos Parshas Nitzavim, Tishrei 5748",
        mugah="bilti-mugah",
        default_book="Deuteronomy",
    ),
    dict(
        file="52. Vayeilech 5749 Rebbe's Maamor.pdf", slug="vayeilech-5749",
        heb_title="שׁוּבָה יִשְׂרָאֵל עַד הוי' אֱלֹקֶיךָ", en_title="Shuvoh Yisroel Ad Havaye Elokecho",
        genre="Maamor — free translation & elucidation",
        date_parsha="Shabbos Parshas Vayeilech / Shabbos Shuva, Tishrei 5749",
        mugah="bilti-mugah",
        default_book="Deuteronomy",
    ),
    dict(
        file="53. Haazinu 5725 Rebbe's Maamor.pdf", slug="haazinu-5725",
        heb_title="כְּנֶשֶׁר יָעִיר קִנּוֹ", en_title="KaNesher Yo'ir Kino",
        genre="Maamor — free translation & elucidation (Rebbe Maharash yohrtzeit maamar)",
        date_parsha="Shabbos Parshas Haazinu, Tishrei 5725",
        mugah="bilti-mugah",
        default_book="Deuteronomy",
    ),
]

# ---------------------------------------------------------------------------
# Gematria verification (mispar hechrachi) -- source-grounding requirement:
# no gematria assertion without independent script verification in this run.
# ---------------------------------------------------------------------------
GEMATRIA_VALUES = {
    'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5,
    'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9, 'י': 10,
    'כ': 20, 'ך': 20, 'ל': 30, 'מ': 40, 'ם': 40,
    'נ': 50, 'ן': 50, 'ס': 60, 'ע': 70, 'פ': 80,
    'ף': 80, 'צ': 90, 'ץ': 90, 'ק': 100, 'ר': 200,
    'ש': 300, 'ת': 400,
}
NIKUD_RANGE = (0x0591, 0x05C7)


MAQAF = '־'  # Hebrew word-joining hyphen -- punctuation, not a vowel point;
                   # stripping it fuses adjacent words (e.g. בכל־שעריך -> בכלשעריך)


def strip_nikud(s: str) -> str:
    return ''.join(
        c for c in unicodedata.normalize('NFD', s)
        if c == MAQAF or not (NIKUD_RANGE[0] <= ord(c) <= NIKUD_RANGE[1])
    )


def gematria_value(word: str) -> int:
    return sum(GEMATRIA_VALUES.get(c, 0) for c in strip_nikud(word))


GEMATRIA_MENTION_RE = re.compile(r'gematria|numerical value', re.IGNORECASE)
HEBREW_LETTER = r'א-ת'
HEBREW_RUN_RE = re.compile(rf'[{HEBREW_LETTER}][{HEBREW_LETTER}֑-ׇ\s\'"׳״‘’“”]*[{HEBREW_LETTER}]')


# ---------------------------------------------------------------------------
# Sefaria verification for possuk citations. The source PDFs' own Hebrew
# extraction is corrupted at the syllable level (pdftotext inserts spurious
# spaces between nikud-bearing glyph clusters, a PDF-generation artifact, not
# something introduced here -- see session notes). Since every possuk-anchored
# unit quotes an actual Tanach verse, the correct fix is to verify the citation
# against Sefaria (a canonical, independently-checkable digital Tanach) and use
# ITS text, rather than trying to heuristically un-mangle uncertain spacing.
# Falls back to the extracted text, nikud stripped, when no citation is found
# or the network call fails -- never fabricated, never silently guessed.
# ---------------------------------------------------------------------------
SEFARIA_BOOK_MAP = {
    "bereishis": "Genesis", "beraishis": "Genesis", "bereshis": "Genesis",
    "shmos": "Exodus", "shemos": "Exodus",
    "vayikra": "Leviticus",
    "bamidbor": "Numbers", "bamidbar": "Numbers",
    "devorim": "Deuteronomy", "devarim": "Deuteronomy",
    "yeshaya": "Isaiah", "yeshayahu": "Isaiah",
    "yirmiyahu": "Jeremiah",
    "yechezkel": "Ezekiel",
    "hoshea": "Hosea",
    "zecharia": "Zechariah", "zechariah": "Zechariah",
    "tehillim": "Psalms",
    "mishlei": "Proverbs",
    "koheles": "Ecclesiastes", "kohelet": "Ecclesiastes",
}
CITATION_RE = re.compile(
    r'\((?:([A-Za-z]+)\.?\s+)?(\d{1,3}):(\d{1,3})(?:[-–](\d{1,3}))?\)'
)
SEFARIA_CACHE_PATH = Path(__file__).resolve().parent / "assets" / "sefaria_cache.json"
_sefaria_cache: dict = {}
_sefaria_cache_loaded = False


def _load_sefaria_cache() -> None:
    global _sefaria_cache, _sefaria_cache_loaded
    if _sefaria_cache_loaded:
        return
    if SEFARIA_CACHE_PATH.exists():
        _sefaria_cache = json.loads(SEFARIA_CACHE_PATH.read_text(encoding="utf-8"))
    _sefaria_cache_loaded = True


def _save_sefaria_cache() -> None:
    SEFARIA_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    SEFARIA_CACHE_PATH.write_text(
        json.dumps(_sefaria_cache, ensure_ascii=False, indent=1), encoding="utf-8"
    )


def fetch_sefaria_verse(book_en: str, chap: int, v1: int, v2: int | None) -> str | None:
    """Return verified Hebrew text for book_en chap:v1(-v2), or None if
    unavailable (unknown ref, network failure) -- caller falls back to the
    extracted text rather than blocking or guessing."""
    _load_sefaria_cache()
    ref = f"{book_en}.{chap}.{v1}-{v2}" if v2 else f"{book_en}.{chap}.{v1}"
    if ref in _sefaria_cache:
        return _sefaria_cache[ref] or None
    url = f"https://www.sefaria.org/api/v3/texts/{ref}?version=hebrew"
    try:
        with urllib.request.urlopen(url, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        pieces = []
        for v in data.get("versions", []):
            t = v.get("text")
            if t:
                pieces = t if isinstance(t, list) else [t]
                break
        cleaned = []
        for p in pieces:
            p = re.sub(r'<[^>]+>', '', p)  # strip footnote tags Sefaria embeds inline
            p = html.unescape(p)           # decode &nbsp; / &thinsp; / etc.
            cleaned.append(p)
        text = " ".join(cleaned).strip()
        text = text or None
    except Exception:
        text = None
    _sefaria_cache[ref] = text or ""
    _save_sefaria_cache()
    return text


def verify_possuk_against_sefaria(heb_fallback: str, context_text: str,
                                   default_book: str | None = None) -> str:
    """If context_text (the paired footnote/elucidation) names a parseable
    Tanach citation, return Sefaria's verified text for it; otherwise return
    heb_fallback (the source extraction) unchanged. A citation with no book
    name (e.g. "(16:18)", common when the maamar cites its own weekly
    parsha) falls back to default_book, the document's own parsha."""
    m = CITATION_RE.search(context_text)
    if not m:
        return heb_fallback
    book = SEFARIA_BOOK_MAP.get(m.group(1).lower()) if m.group(1) else default_book
    if not book:
        return heb_fallback
    chap, v1 = int(m.group(2)), int(m.group(3))
    v2 = int(m.group(4)) if m.group(4) else None
    verified = fetch_sefaria_verse(book, chap, v1, v2)
    return verified if verified else heb_fallback


def verify_gematria_mentions(text: str) -> str:
    """Flag any gematria assertion that can't be independently verified this run."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    out = []
    for sentence in sentences:
        if GEMATRIA_MENTION_RE.search(sentence):
            claimed_numbers = [int(n) for n in re.findall(r'\b(\d{1,4})\b', sentence)]
            heb_words = HEBREW_RUN_RE.findall(sentence)
            verified = any(
                gematria_value(w) == n
                for w in heb_words for n in claimed_numbers
            )
            if not verified:
                sentence = sentence.rstrip() + ' [UNVERIFIED — gematria not independently confirmed this run]'
        out.append(sentence)
    return ' '.join(out)


def hebrew_letter_count(s: str) -> int:
    return sum(1 for c in s if 'א' <= c <= 'ת')


# ---------------------------------------------------------------------------
# PDF text extraction (pdftotext, page-split on form-feed)
# ---------------------------------------------------------------------------
class ExtractionError(RuntimeError):
    pass


# pdftotext embeds bidi control chars (RLE/PDF/isolates) around Hebrew runs
# inside LTR sentences. Text is already in logical reading order, so these are
# stripped -- they only carry presentation hints pdftotext itself doesn't need
# for the plain-text case, and they break marker/sentence-boundary matching.
BIDI_CONTROL_RE = re.compile('[‎‏‪-‮⁦-⁩]')


def extract_pages(pdf_path: Path) -> list[str]:
    try:
        result = subprocess.run(
            ["pdftotext", "-enc", "UTF-8", str(pdf_path), "-"],
            capture_output=True, timeout=60,
        )
    except FileNotFoundError as e:
        raise ExtractionError(f"pdftotext not found on PATH: {e}") from e
    if result.returncode != 0:
        raise ExtractionError(result.stderr.decode("utf-8", "replace"))
    text = result.stdout.decode("utf-8", "replace")
    text = BIDI_CONTROL_RE.sub("", text)
    return text.split("\f")


# Footnote markers survive bidi-control stripping with NO trailing space before
# the English word they annotate (e.g. "...Parsha:" + marker + "Of the Possuk"
# -> stripped to "...Parsha:אOf the Possuk"). Match on that adjacency instead.
FOOTNOTE_SPLIT_RE = re.compile(
    rf'(?<![{HEBREW_LETTER}\d])(?:[{HEBREW_LETTER}]|\d{{1,2}})\s?(?=[A-Z][a-z])'
)


PAGE_ARTIFACT_RE = re.compile(
    r'^\s*\d+\s*\|\s*Page\s*$'
    r'|^\s*Page\s*\|\s*\d+\s*$'
    r'|^\s*P\s*a\s*g\s*e\s*\d+\s*$',
    re.IGNORECASE,
)


def split_body_and_footnotes(page_text: str) -> tuple[list[str], list[str]]:
    """Classify each paragraph on a page as body prose, a footnote-definitions
    block, or (in numeric-marker documents like Shoftim/Ki Sovoi) a prose
    paragraph that trails off into a run of footnote definitions -- the source
    layout sometimes doesn't put a blank line between the two. A paragraph
    counts as containing footnote definitions only if it has 2+ marker hits
    (a single inline marker before a capitalized word can occur in ordinary
    prose); when it does, only the text from the first such marker onward is
    treated as footnote content -- text before it stays body prose."""
    paragraphs = [p.strip() for p in re.split(r'\n\s*\n', page_text) if p.strip()]
    body_paragraphs, footnote_blocks = [], []
    for para in paragraphs:
        if PAGE_ARTIFACT_RE.match(para):
            continue  # source page-number watermark artifact, not content
        marker_hits = len(FOOTNOTE_SPLIT_RE.findall(para))
        if marker_hits < 2:
            body_paragraphs.append(para)
            continue
        first = FOOTNOTE_SPLIT_RE.search(para)
        prose_prefix = para[:first.start()].strip()
        if prose_prefix:
            body_paragraphs.append(prose_prefix)
        footnote_blocks.append(para[first.start():])
    return body_paragraphs, footnote_blocks


def split_footnote_entries(footnote_blocks: list[str]) -> list[str]:
    entries = []
    for block in footnote_blocks:
        parts = FOOTNOTE_SPLIT_RE.split(block)
        entries.extend(p.strip() for p in parts if p.strip())
    return entries


# ---------------------------------------------------------------------------
# Unit extraction: possuk-anchored units + connective prose + concept/rail split
# ---------------------------------------------------------------------------
SENTENCE_END_RE = re.compile(r'.*?[.!?”’]["”]?(?=\s|$)')
TRAILING_DEBRIS_RE = re.compile(r'[.…]{2,}\s*\d{0,2}\s*[א-ת֑-ׇ]?\s*$')

# A footnote marker survives as an isolated, unpointed single Hebrew letter (no
# nikud/letter touching it) or a 1-2 digit number glued directly to a letter
# (e.g. "Possuk1 states", "1 Possuk:"). Real Hebrew words in a possuk always
# carry nikud or run multiple letters together, so this reliably distinguishes
# reference markers from possuk text.
INLINE_MARKER_RE = re.compile(
    rf'(?<![{HEBREW_LETTER}֑-ׇ])[{HEBREW_LETTER}](?![֑-ׇ{HEBREW_LETTER}])'
    rf'|(?<=[A-Za-z])\d{{1,2}}(?!\d)'
    rf'|(?<!\d)\d{{1,2}}(?=[A-Z][a-z])'
)


def process_paragraph(para: str, footnote_entries: list[str], cursor: int,
                       blocks: list[dict], seen_concepts: set,
                       default_book: str | None = None) -> int:
    """Walk one body paragraph left to right, pairing each footnote marker with
    the possuk-unit it falls inside (or emitting it as a standalone rail-note /
    concept box when the paragraph has no possuk to attach to). Returns the
    updated footnote_entries cursor."""
    # Quote conventions are inconsistent across this corpus (Hebrew wrapped in
    # curly quotes, English translation quoted instead, or no quotes at all) --
    # too unreliable to gate on. Detection is length-based (8+ Hebrew letters).
    # # DECISION: this occasionally misclassifies a bare Sefer/date citation as
    # a possuk unit (no quote marks to disambiguate); flagged for Step 3 QA.
    LEADING_QUOTE_RE = re.compile(r'^\s*[“"]\s*')

    possuk_matches = []
    for raw in HEBREW_RUN_RE.finditer(para):
        start, end, text = raw.start(), raw.end(), raw.group(0)
        # a footnote marker fused directly onto the possuk's opening edge
        # (no space) is swallowed into the same regex match -- trim it so the
        # marker is still visible to the marker/footnote pairing pass below.
        if INLINE_MARKER_RE.match(para, start):
            start += 1
            text = text[1:]
        qm = LEADING_QUOTE_RE.match(text)
        if qm:  # strip a genuine leading quote when present, but don't require one
            start += qm.end()
            text = text[qm.end():]
        if hebrew_letter_count(text) >= 8:
            possuk_matches.append({"start": start, "end": end, "text": text.strip()})

    def inside_any_possuk(pos: int) -> bool:
        return any(pm["start"] <= pos < pm["end"] for pm in possuk_matches)

    markers = [m for m in INLINE_MARKER_RE.finditer(para) if not inside_any_possuk(m.start())]

    units = []
    for idx, pm in enumerate(possuk_matches):
        # never let a translation span cross into the next possuk on this
        # page -- irregular ellipsis/punctuation in the source (no proper
        # sentence terminator) can otherwise swallow the next quote whole.
        next_start = possuk_matches[idx + 1]["start"] if idx + 1 < len(possuk_matches) else len(para)
        rest = para[pm["end"]:next_start]
        # geresh/gershayim (׳ ״, Hebrew abbreviation marks) trailing the possuk
        # fall outside the letter range HEBREW_RUN_RE stops at -- they belong
        # with the Hebrew, not the English translation that follows.
        rest = re.sub(r'^[׳״]+', '', rest)
        en_match = SENTENCE_END_RE.match(rest)
        en_raw = en_match.group(0) if en_match else rest[:200]
        units.append({
            "heb_start": pm["start"], "heb_end": pm["end"],
            "heb": pm["text"],
            "en_raw": en_raw, "en_end": pm["end"] + len(en_raw),
            "notes": [], "boxes": [],
        })

    def bucket_for(pos: int):
        # A marker inside a unit's possuk+translation span annotates that unit
        # directly. Otherwise it's introductory text for whichever possuk comes
        # next (the common "...of the Possuk:<marker> "<quote>..." pattern) --
        # only a marker after the very last possuk on the page is orphaned.
        for u in units:
            if u["heb_start"] <= pos < u["en_end"]:
                return u
        for u in units:
            if pos < u["heb_start"]:
                return u
        return None

    for mk in markers:
        if cursor >= len(footnote_entries):
            break
        entry = verify_gematria_mentions(footnote_entries[cursor])
        cursor += 1
        word_count = len(entry.split())
        key = entry[:40].lower()
        target = bucket_for(mk.start())
        if word_count > 45:
            if key in seen_concepts:
                continue  # foundational concept already introduced earlier in this document
            seen_concepts.add(key)
            if target is not None:
                target["boxes"].append(entry)
            else:
                blocks.append({"kind": "concept-standalone", "text": entry})
        else:
            if target is not None:
                target["notes"].append(entry)
            else:
                blocks.append({"kind": "rail-standalone", "text": entry})

    last_end = 0
    for u in units:
        prose_before = INLINE_MARKER_RE.sub('', para[last_end:u["heb_start"]]).strip()
        if prose_before:
            blocks.append({"kind": "prose", "text": verify_gematria_mentions(prose_before)})
        en_clean = INLINE_MARKER_RE.sub('', u["en_raw"]).strip()
        # trailing "....4 <stray char>" debris where the source has no real
        # sentence terminator before the next possuk's marker+quote begins
        en_clean = TRAILING_DEBRIS_RE.sub('', en_clean).strip()
        # Only search concept-box text for a citation, and only near its start
        # ("Possuk: (ref) ..." is the consistent pattern) -- notes/rail text
        # can carry an unrelated cross-reference citation (e.g. "With the
        # words: (17:7)...") that must never be mistaken for this unit's own
        # possuk. A wrong match here means a confidently-wrong verse, which is
        # worse than the honest-but-imperfect extracted text.
        citation_context = next((b[:60] for b in u["boxes"] if CITATION_RE.search(b[:60])), "")
        heb_verified = verify_possuk_against_sefaria(u["heb"], citation_context, default_book)
        blocks.append({
            "kind": "unit",
            "heb": heb_verified,
            "en": verify_gematria_mentions(en_clean),
            "eluc": u["notes"][0] if u["notes"] else "",
            "extra_rail": u["notes"][1:],
            "boxes": u["boxes"],
        })
        last_end = u["en_end"]

    tail = INLINE_MARKER_RE.sub('', para[last_end:]).strip()
    if tail:
        blocks.append({"kind": "prose", "text": verify_gematria_mentions(tail)})

    return cursor


# Translator-credit / website-list front matter, per Shimon's 2026-07-28
# request to drop this from every document. It's genuinely in the source
# (not fabricated by removing it) but is administrative boilerplate, not
# maamar content -- repeated almost verbatim across all 8 files.
BOILERPLATE_SIGNATURES = [
    "free translation of maamor",
    "translated by mendy levy",
    "translated by menachem",
    "authored by menachem",
    "typeset by mendel",
    "special thanks to",
    "dvarmalchus.org",
    "hafotzashamaayonus",
    "translation reset",
    "translation republished",
    "help with the footnotes",
    "join a mailing list",
    "please get in touch",
    "text +44",
]


def is_boilerplate(para: str) -> bool:
    low = para.lower()
    if any(sig in low for sig in BOILERPLATE_SIGNATURES):
        return True
    domain_hits = len(re.findall(r'\.(?:org|com|il|co\.uk|net)\b', low))
    return domain_hits >= 3


def merge_adjacent_prose(blocks: list[dict]) -> list[dict]:
    """pdftotext's paragraph breaks often fall mid-sentence (source line/column
    artifacts), producing one-fragment-per-row prose with large visual gaps.
    Merge consecutive "prose" blocks into a single flowing paragraph."""
    merged = []
    for block in blocks:
        if block["kind"] == "prose" and merged and merged[-1]["kind"] == "prose":
            merged[-1] = {"kind": "prose", "text": merged[-1]["text"] + " " + block["text"]}
        else:
            merged.append(dict(block))
    return merged


def possuk_units_for_page(page_text: str, page_num: int, seen_concepts: set,
                           default_book: str | None = None) -> tuple[list[dict], bool]:
    """Return (blocks, had_content). Block kinds: "unit" (heb/en/eluc/extra_rail/
    boxes), "prose", "rail-standalone", "concept-standalone"."""
    body_paragraphs, footnote_blocks = split_body_and_footnotes(page_text)
    footnote_entries = split_footnote_entries(footnote_blocks)
    body_paragraphs = [p for p in body_paragraphs if not is_boilerplate(p)]

    if not body_paragraphs and not footnote_blocks:
        return [], False

    blocks = []
    cursor = 0
    for para in body_paragraphs:
        cursor = process_paragraph(para, footnote_entries, cursor, blocks, seen_concepts, default_book)

    return blocks, True


EXTRACTION_GAP_THRESHOLD = 20  # chars


# ---------------------------------------------------------------------------
# Fonts: base64-embed cached TTFs (converted once from fontsource woff2 via
# build/assets/fonts/_convert_fonts.py; cached offline, no network at build time)
# ---------------------------------------------------------------------------
FONT_FILES = {
    "frank-ruhl-400": "frank-ruhl-libre-hebrew-400-normal.ttf",
    "frank-ruhl-700": "frank-ruhl-libre-hebrew-700-normal.ttf",
    "garamond-400": "eb-garamond-latin-400-normal.ttf",
    "garamond-700": "eb-garamond-latin-700-normal.ttf",
    "garamond-400-italic": "eb-garamond-latin-400-italic.ttf",
    "jetbrains-400": "jetbrains-mono-latin-400-normal.ttf",
}


def font_face_css() -> str:
    faces = []
    specs = [
        ("Frank Ruhl Libre Hebrew", "frank-ruhl-400", 400, "normal"),
        ("Frank Ruhl Libre Hebrew", "frank-ruhl-700", 700, "normal"),
        ("EB Garamond", "garamond-400", 400, "normal"),
        ("EB Garamond", "garamond-700", 700, "normal"),
        ("EB Garamond", "garamond-400-italic", 400, "italic"),
        ("JetBrains Mono", "jetbrains-400", 400, "normal"),
    ]
    for family, key, weight, style in specs:
        path = FONTS_DIR / FONT_FILES[key]
        if not path.exists():
            raise ExtractionError(f"font asset missing: {path}")
        data = base64.b64encode(path.read_bytes()).decode("ascii")
        faces.append(f"""
@font-face {{
  font-family: '{family}';
  font-weight: {weight};
  font-style: {style};
  src: url(data:font/ttf;base64,{data}) format('truetype');
}}""")
    return "\n".join(faces)


# ---------------------------------------------------------------------------
# CSS -- Step 1 layout spec
# ---------------------------------------------------------------------------
def build_css() -> str:
    return font_face_css() + """
:root {
  --parchment:      #faf8f3;
  --parchment-deep: #f2eee2;
  --ink:            #1a1a18;
  --ink-muted:      #4a4844;
  --rule:           #d8d2c4;
  --gold-print:     #8a6a1e;
}

@page {
  size: letter;
  margin: 0.75in;
  @bottom-right {
    content: counter(page);
    font-family: 'EB Garamond';
    font-size: 8pt;
    color: #4a4844;
  }
}

* { box-sizing: border-box; }

body {
  background: var(--parchment);
  color: var(--ink);
  font-family: 'EB Garamond';
  margin: 0;
}

.page-header {
  width: 7.0in;
  margin-bottom: 1.6em;
}
.page-header .org {
  font-family: 'EB Garamond';
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink);
  font-size: 13pt;
  margin-bottom: 0.6em;
}
.page-header .heb-title {
  font-family: 'Frank Ruhl Libre Hebrew';
  direction: rtl;
  unicode-bidi: isolate;
  color: var(--gold-print);
  font-size: 20pt;
  line-height: 1.4;
  margin-bottom: 0.2em;
}
.page-header .en-title {
  font-size: 13pt;
  font-style: italic;
  margin-bottom: 0.5em;
}
.page-header .meta {
  font-size: 9.5pt;
  color: var(--ink-muted);
  letter-spacing: 0.03em;
}

.ois-heading {
  width: 7.0in;
  border-bottom: 1px solid var(--rule);
  padding-bottom: 0.3em;
  margin: 1.6em 0 1.2em 0;
}
.ois-heading .eyebrow {
  font-size: 9pt;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--gold-print);
}
.ois-heading .heb-mark {
  font-family: 'Frank Ruhl Libre Hebrew';
  direction: rtl;
  unicode-bidi: isolate;
  margin-right: 0.4em;
}

.row {
  display: grid;
  grid-template-columns: 1.5in 0.3in 5.2in;
  margin-bottom: 2.0em;
}
.row.prose-row { margin-bottom: 1.1em; }

.rail-cell { grid-column: 1; }
.main-cell { grid-column: 3; }

.unit { break-inside: avoid; }
.unit .heb {
  font-family: 'Frank Ruhl Libre Hebrew';
  direction: rtl;
  unicode-bidi: isolate;
  font-size: 13pt;
  line-height: 1.7;
  font-weight: 400;
  color: var(--gold-print);
  margin-bottom: 1.1em;
}
.unit .en {
  font-family: 'EB Garamond';
  font-size: 11.5pt;
  line-height: 1.45;
  font-weight: 700;
  color: var(--ink);
  margin-bottom: 1.1em;
}
.unit .eluc {
  font-family: 'EB Garamond';
  font-size: 10pt;
  line-height: 1.55;
  font-weight: 400;
  color: var(--ink-muted);
  padding-left: 0.9em;
}

.prose {
  font-family: 'EB Garamond';
  font-size: 10.5pt;
  line-height: 1.5;
  color: var(--ink);
}

.rail-note {
  font-size: 8.5pt;
  line-height: 1.4;
  color: var(--ink-muted);
  border-top: 1px solid var(--rule);
  padding-top: 0.4em;
}

.concept {
  grid-column: 3;
  border: 1px solid var(--rule);
  background: var(--parchment-deep);
  padding: 0.85em;
  border-radius: 0;
  font-size: 9.5pt;
  line-height: 1.5;
  color: var(--ink);
  break-inside: avoid;
}
.concept .eyebrow {
  font-size: 8pt;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--gold-print);
  display: block;
  margin-bottom: 0.4em;
}

.extraction-gap {
  font-family: 'JetBrains Mono';
  font-size: 9pt;
  color: #b00020;
  border: 1px solid #b00020;
  padding: 0.5em;
  grid-column: 3;
}
"""


# ---------------------------------------------------------------------------
# HTML assembly
# ---------------------------------------------------------------------------
def render_row(inner_main_html: str, rail_html: str = "", row_class: str = "") -> str:
    return (
        f'<div class="row {row_class}">'
        f'<div class="rail-cell">{rail_html}</div>'
        f'<div class="main-cell">{inner_main_html}</div>'
        f'</div>'
    )


def build_html(doc: dict, pages: list[str]) -> tuple[str, dict]:
    stats = dict(pages=len(pages), units=0, concept_boxes=0, rail_notes=0,
                 extraction_gaps=0, warnings=[])

    body_parts = []
    body_parts.append(f"""
<div class="page-header">
  <div class="org">Chabad of Parkland</div>
  <div class="heb-title">{esc(doc['heb_title'])}</div>
  <div class="en-title">{esc(doc['en_title'])}</div>
  <div class="meta">{esc(doc['genre'])} · {esc(doc['date_parsha'])} · {esc(doc['mugah'])}</div>
</div>
""")
    body_parts.append(f"""
<div class="ois-heading">
  <span class="heb-mark">א</span>
  <span class="eyebrow">Maamor</span>
</div>
""")

    seen_concepts: set = set()
    for i, page_text in enumerate(pages, start=1):
        blocks, had_content = possuk_units_for_page(page_text, i, seen_concepts, doc.get("default_book"))
        blocks = merge_adjacent_prose(blocks)
        stripped = page_text.strip()
        is_interior = 1 < i < len(pages)
        if is_interior and not had_content and len(stripped) < EXTRACTION_GAP_THRESHOLD:
            body_parts.append(render_row(
                f'<div class="extraction-gap">[[EXTRACTION GAP — p.{i}]]</div>'
            ))
            stats["extraction_gaps"] += 1
            continue

        for block in blocks:
            kind = block["kind"]
            if kind == "prose":
                body_parts.append(render_row(
                    f'<div class="prose">{esc(block["text"])}</div>',
                    row_class="prose-row",
                ))
            elif kind == "rail-standalone":
                stats["rail_notes"] += 1
                body_parts.append(render_row(
                    '<div class="prose"></div>',
                    rail_html=f'<div class="rail-note">{esc(block["text"])}</div>',
                    row_class="prose-row",
                ))
            elif kind == "concept-standalone":
                stats["concept_boxes"] += 1
                body_parts.append(render_row(
                    f'<div class="concept"><span class="eyebrow">Concept</span>{esc(block["text"])}</div>',
                ))
            else:  # unit
                stats["units"] += 1
                main_html = (
                    f'<div class="unit">'
                    f'<div class="heb">{esc(block["heb"])}</div>'
                    f'<div class="en">{esc(block["en"])}</div>'
                )
                if block["eluc"]:
                    main_html += f'<div class="eluc">{esc(block["eluc"])}</div>'
                for box_text in block["boxes"]:
                    stats["concept_boxes"] += 1
                    main_html += (
                        f'<div class="concept">'
                        f'<span class="eyebrow">Concept</span>{esc(box_text)}'
                        f'</div>'
                    )
                main_html += "</div>"
                rail_html = ""
                if block["extra_rail"]:
                    stats["rail_notes"] += len(block["extra_rail"])
                    rail_html = "".join(
                        f'<div class="rail-note">{esc(n)}</div>' for n in block["extra_rail"]
                    )
                body_parts.append(render_row(main_html, rail_html=rail_html))

    html = f"""<!doctype html>
<html><head><meta charset="utf-8"><style>{build_css()}</style></head>
<body>{''.join(body_parts)}</body></html>"""
    return html, stats


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def process_one(doc: dict, dry_run: bool) -> dict:
    pdf_path = SOURCE_DIR / doc["file"]
    if not pdf_path.exists():
        raise ExtractionError(f"source file not found: {pdf_path}")
    pages = extract_pages(pdf_path)
    html, stats = build_html(doc, pages)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    html_path = OUTPUT_DIR / f"{doc['slug']}.html"
    html_path.write_text(html, encoding="utf-8")

    if not dry_run:
        from weasyprint import HTML
        pdf_out = OUTPUT_DIR / f"{doc['slug']}.pdf"
        HTML(string=html, base_url=str(OUTPUT_DIR)).write_pdf(str(pdf_out))
        stats["output"] = str(pdf_out)
    else:
        stats["output"] = str(html_path)
    return stats


def main():
    parser = argparse.ArgumentParser(description="ATZMUTOS batch elucidation generator")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--all", action="store_true", help="process every source PDF")
    group.add_argument("--file", metavar="NAME", help="process a single source PDF by filename")
    parser.add_argument("--dry-run", action="store_true", help="emit HTML only, no PDF")
    args = parser.parse_args()

    if args.all:
        targets = DOCS
    else:
        targets = [d for d in DOCS if d["file"] == args.file]
        if not targets:
            print(f"No known document matches --file {args.file!r}", file=sys.stderr)
            sys.exit(1)

    results = []
    for doc in targets:
        row = {"file": doc["file"], "slug": doc["slug"]}
        try:
            stats = process_one(doc, args.dry_run)
            row.update(stats, status="OK")
        except Exception as e:  # noqa: BLE001 -- continue-on-error is required by spec
            row.update(status="FAILED", error=str(e))
        results.append(row)

    print("\n=== Batch summary ===")
    header = f"{'file':<45} {'status':<8} {'pages':>5} {'units':>5} {'boxes':>5} {'rail':>5} {'gaps':>5}"
    print(header)
    print("-" * len(header))
    for r in results:
        if r["status"] == "OK":
            print(f"{r['slug']:<45} {r['status']:<8} {r.get('pages',0):>5} "
                  f"{r.get('units',0):>5} {r.get('concept_boxes',0):>5} "
                  f"{r.get('rail_notes',0):>5} {r.get('extraction_gaps',0):>5}")
        else:
            print(f"{r['slug']:<45} {r['status']:<8} {'':>5} {'':>5} {'':>5} {'':>5} {'':>5}  -- {r['error']}")

    failures = [r for r in results if r["status"] != "OK"]
    if failures:
        print(f"\n{len(failures)} file(s) failed. See errors above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
