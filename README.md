# Bible Cross References (personal study app)

Static, phone-friendly web app: look up any verse, see every OpenBible.info cross reference
(344,799 in total) with its text, sorted by votes, filterable by strength, book type and
OT/NT direction, with Nave's topics and an arc map. No server code: any static host works.

## Run locally
    python3 -m http.server 8765    # then open http://localhost:8765/

## Rebuild the data
Source files live in /workspace/data (download URLs below). Then:
    python3 build/build.py

## Add another Bible version
1. Get a public-domain / freely licensed text.
2. Add an entry to build/versions.src.json (id, name, license, source, url, loader).
   - scrollmapper/bible_databases JSON: `"loader":"scrollmapper","file":"XYZ.json"` (drop the file in /workspace/data).
   - Other formats: add a small loader function in build/build.py returning {(bookIndex, chapter, verse): text}.
3. Run build/build.py. The dropdown is generated from data/versions.json automatically.
Copyrighted versions (NLT, NASB, NIV, ESV, NKJV, CSB) are NOT embedded; the app links to Bible Gateway instead
(edit OPEN_IN at the top of app.js to change that list).

## Data layout
- data/books.json – 66 books: id, name, genre, testament, aliases, verse counts
- data/versions.json – built-in versions + licenses
- data/text/<VER>/<Book>/<chapter>.json – array of verse strings
- data/xref/<Book>.json – {"c:v": [[toBook, c, v, endC, endV, votes], ...]} sorted by votes
- data/topics/… – Nave's topic names, per-verse topic ids, per-letter topic → verses

## Sources & licenses
- Cross references: OpenBible.info, https://www.openbible.info/labs/cross-references/ (CC BY). File dated 2026-10-19, 344,799 rows.
- KJV, ASV, YLT, Darby: scrollmapper/bible_databases (public domain texts).
- BSB: https://bereanbible.com/bsb.txt – public domain since April 30, 2023 (https://berean.bible/terms.htm).
- WEB: eBible.org engwebp_vpl.zip – public domain; "World English Bible" is an eBible.org trademark.
- Nave's Topical Bible (1897, public domain) via BradyStephenson/bible-data NavesTopicalDictionary.csv (CC BY 4.0).
  Note: that CSV has no verse references for Song of Solomon or Jude, so those books show no topics.
