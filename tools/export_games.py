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
# Två locales per spel: providerns text (en-EN) och vår genererade annons-/sidtext
# (sv-SE). Slå ihop dem i stället för att välja en, annars tappar sajten det ena.
for r in db.execute("select * from game_copy order by locale"):
    c = dict(r)
    cur = copy.setdefault(r['game_id'], {})
    for k, v in c.items():
        if v not in (None, '') and not cur.get(k):
            cur[k] = v

KEEP = ['rtp', 'volatility', 'max_win_x', 'max_win', 'hit_rate', 'reels', 'rows', 'paylines',
        'ways', 'bonus_buy', 'bonus_buy_max_x', 'bonus_buy_min_x', 'min_bet', 'max_bet',
        'hit_frequency', 'game_format', 'features_list', 'default_bet',
        # härledda mekanikflaggor + numeriska fält (derive_mechanic_flags / derive_numeric_attrs)
        'free_spins_yn', 'free_spins_count', 'free_spins_retrigger_yn', 'hold_and_win_yn',
        'cascading_wins_yn', 'sticky_wilds_yn', 'expanding_reels_yn', 'gamble_feature_yn',
        'jackpot_yn', 'megaways_yn', 'cluster_pays_yn', 'multiplier_yn', 'multipliers_max',
        'super_bonus_yn']
out = []
for g in db.execute("select g.*, p.name as pname from games g left join providers p on p.id=g.provider_id where g.status!='removed' order by g.title"):
    # Thumbnails i R2 ligger under slug, men game_copy/game_attrs/game_themes m.fl.
    # pekar på games.id. För 449 spel skiljer de sig — nyckla varje uppslag rätt.
    slug = g['slug']; gid = g['id']; c = copy.get(gid) or {}
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
           'theme': g['primary_theme'], 'themes': themes.get(gid, []), 'feat': feats.get(gid, []),
           'br': sorted(set(brands.get(gid, []))), 'desc': g['description'],
           'attrs': {k: attrs[gid][k] for k in KEEP if k in attrs.get(gid, {})},
           'copy': {'tag': c.get('tagline'), 'short': c.get('short_pitch'), 'med': c.get('medium_pitch'),
                    'long': c.get('long_description'), 'features': fcj, 'usp': usp, 'src': c.get('source')}}
    rec = {k: v2 for k, v2 in rec.items() if v2 not in (None, '', [], {})}
    if 'copy' in rec:
        rec['copy'] = {k: v2 for k, v2 in rec['copy'].items() if v2 not in (None, '', [], {})}
    out.append(rec)
json.dump(out, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
multi = sum(1 for g in out if len(g.get('vers') or {}) > 1)
print(len(out), 'spel ·', multi, 'med flera thumbnail-versioner')
