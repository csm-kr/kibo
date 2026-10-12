"""Grades a learned skill catalog against the blind kiosk answer key. Usage: python3 grade_catalog.py <skill.json>"""
import json, sys, os
key = json.load(open(os.path.join(os.path.dirname(__file__), '../answer-key/answer-key.json')))
skill = json.load(open(sys.argv[1]))
groups = key['optionGroups']
norm = lambda s: ''.join(str(s).split())

learned = {norm(i['name']): i for i in skill.get('catalog', [])}
r = dict(items=len(key['items']), found=0, price=0, category=0, soldOut=0, optionItems=0, optionItemsExact=0)
missing, wrong = [], []
for it in key['items']:
    li = learned.get(norm(it['name']))
    if not li:
        missing.append(it['name']); continue
    r['found'] += 1
    r['price'] += li.get('price') == it['basePrice']
    r['category'] += norm(li.get('category')) == norm(it['category'])
    r['soldOut'] += bool(li.get('soldOut')) == bool(it['soldOut'])
    # option labels with price deltas, as a set, compared to the truth for this item
    truth = set()
    for g in it.get('optionGroups', []):
        gid = g.split(' ')[0]
        for o in groups.get(gid, {}).get('options', []):
            truth.add((norm(o['label']), o.get('priceDelta', 0)))
    got = {(norm(o['name']), o.get('priceDelta', 0)) for g in li.get('optionGroups', []) for o in g.get('options', [])}
    if truth:
        r['optionItems'] += 1
        if truth == got: r['optionItemsExact'] += 1
        else: wrong.append((it['name'], sorted(truth - got)[:4], sorted(got - truth)[:4]))
extra = [n for n in learned if n not in {norm(i['name']) for i in key['items']}]
print(json.dumps(r, ensure_ascii=False))
print('missing:', missing)
print('extra:', extra)
for w in wrong[:8]: print('options mismatch:', w[0], '| missing', w[1], '| extra', w[2])
