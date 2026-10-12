"""Option accuracy that only counts what the UI lets a learner see: skips sold-out items (their option
sheet cannot be opened), the ice group (shown only after choosing ICED) and greyed-out temperatures.
Usage: python3 grade_fair.py <skill.json>"""
import json, sys, os
key = json.load(open(os.path.join(os.path.dirname(__file__), '../answer-key/answer-key.json')))
G = key['optionGroups']; norm = lambda s: ''.join(str(s).split())
L = {norm(i['name']): i for i in json.load(open(sys.argv[1]))['catalog']}
total = exact = 0; diffs = []
for it in key['items']:
    if it['soldOut'] or not it.get('optionGroups') or norm(it['name']) not in L: continue
    truth = set()
    for g in it['optionGroups']:
        gid = g.split(' ')[0]
        if gid == 'ice': continue
        for o in G[gid].get('options', []):
            if gid == 'temp' and o['label'] not in (it.get('temperatures') or []): continue
            truth.add((norm(o['label']), o.get('priceDelta', 0)))
    got = {(norm(o['name']), o.get('priceDelta', 0)) for g in L[norm(it['name'])].get('optionGroups', []) for o in g.get('options', []) if norm(o['name']) not in ('많이', '보통', '적게')}
    total += 1
    if truth == got: exact += 1
    else: diffs.append((it['name'], sorted(truth - got), sorted(got - truth)))
print(json.dumps({'openableItemsWithOptions': total, 'exact': exact}, ensure_ascii=False))
for d in diffs: print('diff:', d[0], '| missing', d[1], '| extra', d[2])
