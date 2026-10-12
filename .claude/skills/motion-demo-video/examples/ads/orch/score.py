"""Orchestral score for the 60s Moments ad, composed against the composition's own cues.

python score.py cues.json out.wav [--stems]
Shape (from the Google Photos "Best Picture" reference): quiet low strings + harp intro, entry hit when the
search results land (16.0), a steady spiccato build, beat accents under the photo montage, a pull-back on the
hero photo, a 2-bar IV swell, and IV→I on the exact frame the orange period lands on the logo (53.333).
Samples: VSCO-2-CE (CC0), Pixabay SFX. C major, 90 BPM.
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from audio import SR, Mix, OneShot, Sampler, master, mx, rng  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
V = os.path.join(HERE, '..', '..', 'pm', 'samples', 'vsco')
X = os.path.join(HERE, '..', '..', 'pm', 'samples', 'sfx')
data = json.load(open(sys.argv[1]))
T, DUR, CUES = data['T'], data['duration'], data['cues']
B = 2 / 3
BAR = 4 * B
bar = lambda k: k * BAR  # noqa: E731

vc = Sampler(f'{V}/Strings/Cello_Section/susvib', layer='_v3', octave=1)
cb = Sampler(f'{V}/Strings/Solo_Contrabass/SusVib', layer='_v3', octave=1)
vla = Sampler(f'{V}/Strings/Viola_Section/susvib', layer='_v2', octave=1)
vln = Sampler(f'{V}/Strings/Violin_Section/susVib', layer='_v2', octave=1)
spic = Sampler(f'{V}/Strings/Cello_Section/spic', layer='_v2_RR1', octave=1, loop=False)
vspic = Sampler(f'{V}/Strings/Violin_Section/Spic', layer='_v2_rr1', octave=1, loop=False)
hn = Sampler(f'{V}/Brass/F_Horn/sus', layer='_v2', octave=1)
tp = Sampler(f'{V}/Brass/Trumpet/sus', layer='_v3', octave=1)
harp = Sampler(f'{V}/Strings/Harp', loop=False)
glock = Sampler(f'{V}/Percussion/Glock', octave=1, loop=False)
P = f'{V}/Percussion'
timp_hit = OneShot(f'{P}/Timpani/Timpani1_Hit_v3_rr1_Sum.wav')
timp_soft = OneShot(f'{P}/Timpani/Timpani1_Hit_v1_rr1_Sum.wav')
timp_roll = OneShot(sorted(__import__('glob').glob(f'{P}/Timpani/Rolls/*v5*'))[0])
bdrum = OneShot(f'{P}/BDrumNewhit_v6_rr1_Sum.wav')
crash = OneShot(f'{P}/cymbal-crash1_ff_rr1.wav')
crash_soft = OneShot(f'{P}/cymbal-crash1_mf_rr1.wav')
cym_swell = OneShot(f'{P}/susCymb1-cresc-Short_v1.wav')
cym_swell_med = OneShot(f'{P}/susCymb1-cresc-Median_v1.wav')
key = OneShot(f'{X}/key-press.mp3')
click = OneShot(f'{X}/click-soft.mp3')
whoosh = OneShot(f'{X}/whoosh.mp3')
whoosh_c = OneShot(f'{X}/whoosh-cinematic.mp3')
chime = OneShot(f'{X}/chime.mp3')

M = Mix(DUR)

# ---------------------------------------------------------------- harmony
# chord: (bass root, mid voicing for viola/cello, top voicing for violins/horns)
CH = {
    'C': (36, [48, 55, 60, 64], [67, 72, 76]), 'Am': (33, [45, 52, 57, 60], [64, 69, 72]),
    'F': (29, [41, 48, 53, 57], [65, 69, 72]), 'G': (31, [43, 50, 55, 59], [62, 67, 71]),
    'G/B': (35, [47, 50, 55, 62], [62, 67, 71]), 'Fmaj7': (29, [41, 48, 52, 57], [64, 69, 72]),
    'Gsus': (31, [43, 50, 55, 60], [62, 67, 72]),
}
PROG = [  # (start, chord)
    (bar(0), 'C'), (bar(1), 'Am'), (bar(2), 'F'), (bar(3), 'G'), (bar(4), 'Am'), (bar(5), 'Fmaj7'), (bar(5.5), 'Gsus'),
    (bar(6), 'C'), (bar(7), 'G/B'), (bar(8), 'Am'), (bar(9), 'F'), (bar(10), 'C'), (bar(11), 'G'), (bar(12), 'Am'),
    (bar(13), 'F'), (bar(14), 'C'), (bar(15), 'G'), (bar(16), 'Am'), (bar(16.5), 'F'), (bar(17), 'F'), (bar(18), 'G'),
    (bar(19), 'Am'), (bar(19.25), 'F'), (T['land'], 'C'),
]
HIT, LAND = T['hit'], T['land']


def chord_at(t):
    c = PROG[0][1]
    for s, k in PROG:
        if s <= t + 1e-6:
            c = k
    return c


def ramp(x, a, b, shape=1.0):
    """Multiply by a linear gain ramp a→b over the whole signal (crescendo/decrescendo on sustained samples)."""
    return x * (a + (b - a) * np.linspace(0, 1, len(x)) ** shape)


def level(t):
    """Section dynamics 0..1 for the sustained bed."""
    if t < T['ask']:
        return 0.2
    if t < HIT:
        return 0.2 + 0.45 * (t - T['ask']) / (HIT - T['ask'])
    if t < T['whip']:
        return 0.5 if not (T['cmtPan'] <= t < T['send']) else 0.36
    if t < T['montage']:
        return 0.45 + 0.3 * (t - T['whip']) / (T['montage'] - T['whip'])
    if t < T['hero']:
        return 0.78
    if t < T['zoom']:
        return 0.22
    if t < LAND:
        return 0.22 + 0.85 * ((t - T['zoom']) / (LAND - T['zoom'])) ** 1.6
    return 1.05


# sustained strings bed, chord by chord
for i, (s, c) in enumerate(PROG):
    e = PROG[i + 1][0] if i + 1 < len(PROG) else DUR - 0.2
    d = e - s
    root, mid, top = CH[c]
    l0, l1 = level(s), level(e - 0.01)
    rel = 0.6 if s < LAND else 4.0
    if s >= LAND:
        d = DUR - s - 1.8
    M.add('music', s, ramp(cb(root, d, 0.55, attack=0.12, release=rel), l0, l1), pan=-0.1, send=0.25)
    M.add('music', s, ramp(vc(root + 12, d, 0.45, attack=0.15, release=rel), l0, l1), pan=-0.35, send=0.3)
    for k, m in enumerate(mid[1:]):
        M.add('music', s, ramp(vla(m, d, 0.22, attack=0.2, release=rel), l0, l1), pan=-0.15 + 0.1 * k, send=0.35)
    if s >= T['ask'] - 0.01:                        # violins enter as the photo folds into the search box
        for k, m in enumerate(top):
            M.add('music', s, ramp(vln(m, d, 0.2, attack=0.25 if s < HIT else 0.08, release=rel), l0, l1), pan=0.25 + 0.1 * k, send=0.4)
    if HIT - 0.01 <= s < T['cmtPan'] or T['titles'] - 0.01 <= s < T['hero'] or s >= T['zoom'] - 0.01:   # horns
        for k, m in enumerate(mid[1:3]):
            M.add('music', s, ramp(hn(m, d, 0.3, attack=0.1, release=rel), l0, l1), pan=-0.4 + 0.2 * k, send=0.45)
    if T['invite'] - 0.01 <= s < T['hero'] or s >= T['zoom'] - 0.01:                               # trumpets join late
        for k, m in enumerate(top[:2]):
            M.add('music', s, ramp(tp(m, d, 0.16, attack=0.12, release=rel), l0, l1), pan=0.35 - 0.1 * k, send=0.45)

# harp: an arpeggio at every intro cut, eighth-note arps through the B section, a run into the tagline
ARP = [0, 1, 2, 3, 2, 3, 1, 2]
for k in range(5):
    t0 = bar(k)
    _, mid, top = CH[chord_at(t0)]
    for j, m in enumerate(mid + top[:2]):
        M.add('music', t0 + 0.09 * j, harp(m + 12, 1.5, 0.17), pan=-0.3 + 0.1 * j, send=0.5)
t = HIT
while t < T['cmtPan'] - 0.01:
    _, mid, top = CH[chord_at(t)]
    notes = mid[1:] + top
    M.add('music', t, harp(notes[ARP[int(round((t - HIT) / (B / 2))) % 8] % len(notes)] + 12, 0.6, 0.3), pan=0.3, send=0.45)
    t += B / 2

# the build: spiccato eighths (the reference's 0.355 s pulse) from the whip to the hero photo
t = T['whip']
while t < T['hero'] - 0.01:
    c = chord_at(t)
    root, mid, top = CH[c]
    k = int(round((t - T['whip']) / (B / 2)))
    acc = 1.0 if k % 2 == 0 else 0.7
    lv = 0.5 + 0.5 * (t - T['whip']) / (T['hero'] - T['whip'])
    M.add('music', t + rng.normal(0, 0.004), spic([root + 12, root + 19][k % 2], 0.25, 0.42 * acc * lv), pan=-0.3, send=0.2)
    if t >= T['titles']:
        M.add('music', t + rng.normal(0, 0.004), vspic(top[k % 3], 0.2, 0.3 * acc * lv), pan=0.35, send=0.25)
    t += B / 2

# ---------------------------------------------------------------- percussion and hits
roll, rpk = timp_roll.at()
seg = roll[: int((HIT - T['ask'] - 0.6) * SR)]
M.add('music', HIT - len(seg) / SR - 0.02, seg * np.linspace(0.05, 0.6, len(seg)) ** 2, send=0.35)
x, pk = cym_swell.at()
M.add('music', HIT - pk, x, 0.28, send=0.4)                          # swell peaks exactly on the hit
for b in range(6, 19):
    if bar(b) in (T['hero'],):
        continue
    if bar(b) >= T['whip']:
        M.hit('music', bar(b), timp_soft, 0.32 + 0.25 * (bar(b) - T['whip']) / (T['hero'] - T['whip']), send=0.3)
x, pk = cym_swell_med.at()
M.add('music', T['montage'] - pk, x, 0.25, send=0.4)                 # into the montage
x, pk = cym_swell.at()
M.add('music', LAND - pk, x, 0.4, send=0.5)                          # the IV swell crests on the logo
seg = roll[: int((LAND - T['zoom']) * SR)]
M.add('music', LAND - len(seg) / SR, seg * np.linspace(0.05, 0.9, len(seg)) ** 2, send=0.4)

for c in CUES:
    t, ty, i = c['t'], c['type'], c.get('i', 0)
    if ty == 'hit':                                                  # entry hit: results land
        M.hit('music', t, timp_hit, 0.9, send=0.4)
        M.hit('music', t, bdrum, 0.7, send=0.3)
        M.hit('music', t, crash_soft, 0.35, send=0.5)
        M.duck(t, 0.8, 0.5)
    elif ty == 'mcut':                                               # a photo on every beat
        M.hit('music', t, timp_soft if i % 2 else timp_hit, 0.35 + 0.05 * i, send=0.3)
        if i % 4 == 0:
            M.hit('music', t, bdrum, 0.45, send=0.3)
    elif ty == 'land':                                               # IV → I, the period lands
        M.hit('music', t, timp_hit, 1.2, send=0.5)
        M.hit('music', t, bdrum, 1.1, send=0.4)
        M.hit('music', t, crash, 0.5, send=0.7)
        M.add('sfx', t, glock(84, 2.5, 0.55), send=0.6)
        M.duck(t, 1.0, 0.3, 0.08)
    elif ty == 'cut' and t < T['ask']:
        pass                                                         # intro cuts ride the harp arpeggios
    elif ty == 'swap':                                               # titles in place: their dots ping
        M.add('sfx', t, glock([79, 81, 84, 86][i % 4], 1.0, 0.16), pan=0.2, send=0.5)
    elif ty == 'ding':
        M.add('sfx', t, glock(84, 1.5, 0.3), send=0.6)
    elif ty == 'key':
        M.hit('sfx', t, key, 0.16 * rng.uniform(0.8, 1.0), semis=rng.uniform(-1, 1), pan=0.1)
    elif ty == 'keySoft':
        M.hit('sfx', t, click, 0.08 * rng.uniform(0.8, 1.0), semis=rng.uniform(-3, -1.5), pan=0.3)
    elif ty == 'enter':
        M.hit('sfx', t, click, 0.2, semis=-4)
    elif ty == 'send':
        M.hit('sfx', t, chime, 0.13, send=0.5)
    elif ty == 'click':
        M.hit('sfx', t, click, 0.2, semis=-2)
    elif ty == 'fold':
        x, pk = whoosh.at(3)
        M.add('sfx', t + c['dur'] * 0.5 - pk, x, 0.1, send=0.3)
    elif ty == 'fly':
        x, pk = whoosh_c.at()
        M.add('sfx', t + c['dur'] * 0.5 - pk, x, 0.12, send=0.35)
    elif ty == 'whip':
        x, pk = whoosh.at(-1)
        M.add('sfx', t + 0.3 - pk, x, 0.22, send=0.2)
    elif ty == 'cam' and c['dur'] <= 1.5 and not 0.8 < c['zr'] < 1.25:
        x, pk = whoosh.at(2 if c['zr'] < 1 else -2)
        M.add('sfx', t + c['dur'] * 0.5 - pk, x, 0.06, send=0.3)
    elif ty == 'tag':
        _, mid, top = CH['C']
        for j, m in enumerate((mid + top)[: 6]):
            M.add('music', t + 0.07 * j, harp(m + 12, 2.0, 0.28), pan=-0.2 + 0.08 * j, send=0.6)
        M.add('sfx', t, glock([79, 76][i], 1.6, 0.2), send=0.6)
    elif ty == 'cta':
        M.add('sfx', t, glock(72, 2.0, 0.14), send=0.7)

tmp = sys.argv[2] + '.raw.wav'
M.render(tmp, duck_buses=('music',), duck_amount=0.35, wet=0.55, rt=3.0, fade=2.0, stems='--stems' in sys.argv)
print('LUFS before', master(tmp, sys.argv[2]))
os.remove(tmp)
