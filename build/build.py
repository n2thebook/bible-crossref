import json, os, re, csv, collections, sys
sys.path.insert(0, os.path.dirname(__file__))
from books import BOOKS
SRC = '/workspace/data'
OUT = os.path.join(os.path.dirname(__file__), '..', 'data')
OSIS = {b[0]: i for i, b in enumerate(BOOKS)}
def w(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f: json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))

# ---------- texts: each loader returns {(bi,c,v): text}
def load_scrollmapper(fn):
    d = json.load(open(os.path.join(SRC, fn)))
    out = {}
    assert len(d['books']) == 66
    for bi, b in enumerate(d['books']):
        for ch in b['chapters']:
            for v in ch['verses']:
                t = re.sub(r'\s+', ' ', v['text']).strip()
                out[(bi, ch['chapter'], v['verse'])] = t
    return out
NAME2I = {b[1]: i for i, b in enumerate(BOOKS)}; NAME2I['Psalm'] = NAME2I['Psalms']
def load_bsb():
    out = {}
    for line in open(os.path.join(SRC, 'bsb.txt'), encoding='utf-8-sig'):
        m = re.match(r'^(.+?) (\d+):(\d+)\t(.*)$', line.rstrip('\n'))
        if not m: continue
        out[(NAME2I[m.group(1)], int(m.group(2)), int(m.group(3)))] = m.group(4).strip()
    return out
VPL = {b[3]: i for i, b in enumerate(BOOKS)}
def load_web():
    out = {}
    for line in open(os.path.join(SRC, 'web/engwebp_vpl.txt'), encoding='utf-8-sig'):
        m = re.match(r'^(\w+) (\d+):(\d+) (.*)$', line.rstrip('\n'))
        if not m or m.group(1) not in VPL: continue
        out[(VPL[m.group(1)], int(m.group(2)), int(m.group(3)))] = m.group(4).strip()
    return out

VERSIONS = json.load(open(os.path.join(os.path.dirname(__file__), 'versions.src.json')))
LOADERS = {'scrollmapper': lambda v: load_scrollmapper(v['file']), 'bsb': lambda v: load_bsb(), 'ebible_vpl': lambda v: load_web()}
kjv_counts = None
for ver in VERSIONS:
    data = LOADERS[ver['loader']](ver)
    chap = collections.defaultdict(dict)
    for (bi, c, v), t in data.items(): chap[(bi, c)][v] = t
    for (bi, c), vs in chap.items():
        arr = [vs.get(i) for i in range(1, max(vs) + 1)]
        w(f"{OUT}/text/{ver['id']}/{BOOKS[bi][0]}/{c}.json", arr)
    print(ver['id'], len(data), 'verses')
    if ver['id'] == 'KJV':
        counts = collections.defaultdict(dict)
        for (bi, c), vs in chap.items(): counts[bi][c] = max(vs)
        kjv_counts = counts
w(f"{OUT}/versions.json", [{k: v for k, v in ver.items() if k not in ('loader', 'file')} for ver in VERSIONS])

books = []
for i, b in enumerate(BOOKS):
    cc = kjv_counts[i]
    books.append({'id': b[0], 'name': b[1], 'usfm': b[2], 'genre': b[4], 'testament': 'OT' if i < 39 else 'NT',
                  'aliases': b[5].split(), 'verses': [cc[c] for c in range(1, max(cc) + 1)]})
w(f"{OUT}/books.json", books)

# ---------- cross references
def pref(s):
    p = s.split('.'); return OSIS[p[0]], int(p[1]), int(p[2])
xr = collections.defaultdict(lambda: collections.defaultdict(list))
n = 0; stats = collections.Counter()
with open(os.path.join(SRC, 'cross_references.txt')) as f:
    next(f)
    for line in f:
        a, b, votes = line.rstrip('\n').split('\t')
        fb, fc, fv = pref(a)
        if '-' in b:
            s, e = b.split('-'); tb, tc, tv = pref(s); eb, ec, ev = pref(e)
            if eb != tb: ec, ev = 0, 0  # cross-book range: rare, keep start only
        else:
            tb, tc, tv = pref(b); ec, ev = 0, 0
        xr[fb][f"{fc}:{fv}"].append([tb, tc, tv, ec, ev, int(votes)])
        n += 1; stats[('OT' if fb < 39 else 'NT') + '>' + ('OT' if tb < 39 else 'NT')] += 1
for bi, m in xr.items():
    for k in m: m[k].sort(key=lambda r: -r[5])
    w(f"{OUT}/xref/{BOOKS[bi][0]}.json", m)
print('xrefs', n, dict(stats))

# ---------- Nave's topics
USFM = {b[2]: i for i, b in enumerate(BOOKS)}; USFM['1JHN'] = USFM['1JN']
rows = list(csv.reader(open(os.path.join(SRC, 'naves.csv'), encoding='utf-8-sig')))[1:]
topics = []  # names
vt = collections.defaultdict(lambda: collections.defaultdict(set))  # bi -> "c:v" -> topic idx
topic_refs = collections.defaultdict(dict)
skipped = 0; nrefs = 0
tok = re.compile(r'\b([1-3]?[A-Z]{2,3}) (?=\d)|(\d+):([\d,\-\s]+)|(\d+)(?=\s*[;\n]|$)')
for sec, subj, entry in rows:
    ti = len(topics); topics.append(subj.title())
    refs = []
    for line in entry.split('\n'):
        book = None
        for m in re.finditer(r'\b([1-3]?[A-Z]{2,3}) (?=\d)|(\d+):(\d+(?:\s*[-,]\s*\d+)*)|;\s*(\d+)\b(?!:)', line):
            if m.group(1):
                book = USFM.get(m.group(1));
                continue
            if book is None: continue
            if m.group(4): skipped += 1; continue
            c = int(m.group(2)); vs = set()
            for part in re.split(r'\s*,\s*', m.group(3)):
                if '-' in part:
                    x, y = [int(t) for t in part.split('-')]
                    if y < x or y - x > 40: y = x
                    vs.update(range(x, y + 1))
                else: vs.add(int(part))
            for v in sorted(vs):
                vt[book][f"{c}:{v}"].add(ti); nrefs += 1
            refs.append([book, c, min(vs), max(vs) if len(vs) > 1 else 0])
    topic_refs[sec][subj.title()] = refs
w(f"{OUT}/topics/names.json", topics)
for bi in range(66):
    m = vt.get(bi, {})
    w(f"{OUT}/topics/verse/{BOOKS[bi][0]}.json", {k: sorted(v) for k, v in m.items()})
for sec, m in topic_refs.items():
    w(f"{OUT}/topics/list/{sec}.json", m)
print('topics', len(topics), 'verse-topic links', nrefs, 'chapter-only refs skipped', skipped)
json.dump({'xrefs': n, 'directions': dict(stats), 'topics': len(topics), 'topicLinks': nrefs}, open(f"{OUT}/stats.json", 'w'))
