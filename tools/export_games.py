#!/usr/bin/env python3
"""Exportera games-DB → games.json för Nordplay Games-sajten.
Inkluderar ALLA thumbnail-versioner per spel (toggle i UI:t)."""
import os, sqlite3, json, re
from collections import defaultdict

db = sqlite3.connect('/Users/smalmberg/Nordplay/catalog/nordplay-games.db')
db.row_factory = sqlite3.Row
SZ = {'1200x1200': 'sq', '1200x750': 'ls', '1000x1350': 'pt'}
VLAB = {'1': 'Logo', '2': 'Hero 1.5', '3': 'Hero', '4': 'Split', '5': 'Boost', '6': 'Roulette', '8': 'Live'}
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'games.json')

vers = defaultdict(lambda: defaultdict(dict))
for l in open('/tmp/r2-thumbs-list.txt'):
    p = l.strip().split('/')
    if len(p) < 4 or not p[-1].endswith('.jpg'):
        continue
    m = re.match(r'^(\d+)-.*-(\d+x\d+)\.jpg$', p[-1])
    if not m or m.group(2) not in SZ:
        continue
    vers[p[2]][m.group(1)][SZ[m.group(2)]] = 'https://thumbs.nordplay.com/' + l.strip()

attrs = defaultdict(dict); feats = defaultdict(list); themes = defaultdict(list)
brands = defaultdict(list); copy = {}
for r in db.execute("select game_id, attr_key, attr_value from game_attrs where length(trim(coalesce(attr_value,'')))>0"):
    attrs[r[0]][r[1]] = r[2]
for r in db.execute("select gf.game_id, f.name from game_features gf join features f on f.id=gf.feature_id"):
    feats[r[0]].append(r[1])
for r in db.execute("select gt.game_id, t.name from game_themes gt join themes t on t.id=gt.theme_id"):
    themes[r[0]].append(r[1])
for r in db.execute("select ga.game_id, b.name from game_availability ga join brands b on b.id=ga.brand_id where ga.status='active'"):
    brands[r[0]].append(r[1])
for r in db.execute("select * from game_copy"):
    c = dict(r)
    if r['game_id'] not in copy or (c.get('long_description') and not copy[r['game_id']].get('long_description')):
        copy[r['game_id']] = c

KEEP = ['rtp', 'volatility', 'max_win_x', 'max_win', 'hit_rate', 'reels', 'rows', 'paylines',
        'ways', 'bonus_buy', 'bonus_buy_max_x', 'min_bet', 'max_bet', 'hit_frequency',
        'game_format', 'features_list', 'default_bet']
out = []
for g in db.execute("select g.*, p.name as pname from games g left join providers p on p.id=g.provider_id where g.status!='removed' order by g.title"):
    slug = g['slug']; c = copy.get(slug) or {}
    fcj = usp = None
    try: fcj = json.loads(c.get('features_copy_json') or 'null')
    except Exception: pass
    try: usp = json.loads(c.get('usp_bullets_json') or 'null')
    except Exception: pass
    v = vers.get(slug) or {}
    best = None
    for pref in sorted(v, key=lambda x: -int(x)):
        if 'sq' in v[pref]:
            best = v[pref]; break
    if not best and v:
        best = v[sorted(v, key=lambda x: -int(x))[0]]
    rec = {'id': slug, 't': g['title'], 'p': g['pname'] or g['provider_name'] or '', 'gt': g['game_type'],
           'live': bool(g['is_live']), 'jp': bool(g['is_jackpot']), 'rd': g['release_date'],
           'th': best or None,
           'vers': {VLAB.get(k, 'v' + k): v[k] for k in sorted(v, key=lambda x: int(x))} or None,
           'theme': g['primary_theme'], 'themes': themes.get(slug, []), 'feat': feats.get(slug, []),
           'br': sorted(set(brands.get(slug, []))), 'desc': g['description'],
           'attrs': {k: attrs[slug][k] for k in KEEP if k in attrs.get(slug, {})},
           'copy': {'tag': c.get('tagline'), 'short': c.get('short_pitch'), 'med': c.get('medium_pitch'),
                    'long': c.get('long_description'), 'features': fcj, 'usp': usp, 'src': c.get('source')}}
    rec = {k: v2 for k, v2 in rec.items() if v2 not in (None, '', [], {})}
    if 'copy' in rec:
        rec['copy'] = {k: v2 for k, v2 in rec['copy'].items() if v2 not in (None, '', [], {})}
    out.append(rec)
json.dump(out, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
multi = sum(1 for g in out if len(g.get('vers') or {}) > 1)
print(len(out), 'spel ·', multi, 'med flera thumbnail-versioner')
