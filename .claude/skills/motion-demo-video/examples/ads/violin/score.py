"""Solo-violin score for the 40s Moments ad, written against the composition's cues.

python score.py cues.json out.wav [--stems]
Shape (from Sony "Music Bridges Us"): rubato, no grid. Phrases start on the cuts INTO the warm world and the
violin breathes before cuts OUT; the quietest phrase is where the two worlds first meet (17.5); a rising line
with a portamento into the highest note held over the single peak shot (30.0); a descent; the music ends,
0.5 s of silence, then one note on the frame the orange period becomes the logo's (38.3).
Samples: VSCO-2-CE solo violin / string sections / harp (CC0), Salamander piano (CC-BY 3.0, credit it).
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from audio import SR, Mix, Sampler, master, rng  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
V = os.path.join(HERE, '..', '..', 'pm', 'samples', 'vsco')
data = json.load(open(sys.argv[1]))
T, DUR, CUES = data['T'], data['duration'], data['cues']

vln = Sampler(f'{V}/Strings/Solo_Violin/Arco_Vib', layer=r'_f$')            # solo violin is labelled correctly
vla = Sampler(f'{V}/Strings/Viola_Section/susvib', layer='_v1', octave=1)
vc = Sampler(f'{V}/Strings/Cello_Section/susvib', layer='_v1', octave=1)
cb = Sampler(f'{V}/Strings/Solo_Contrabass/SusVib', layer='_v1', octave=1)
harp = Sampler(f'{V}/Strings/Harp', loop=False)
piano = Sampler(os.path.join(HERE, '..', '..', 'pm', 'samples', 'piano'), loop=False)
M = Mix(DUR)

# ---------------------------------------------------------------- the violin line: (start, midi, dur, vel)
PHRASES = [
    [(0.45, 76, 1.9, .40), (2.5, 79, 1.1, .46), (3.6, 77, 0.6, .40)],                                  # breath → A cut 4.5
    [(4.5, 76, 0.9, .40), (5.4, 74, 1.25, .40), (6.75, 72, 1.4, .46), (8.15, 74, 0.6, .40)],          # breath → 9.0
    [(9.0, 76, 1.1, .45), (10.1, 77, 0.8, .45), (11.0, 79, 1.4, .52), (12.4, 81, 0.4, .48)],          # breath → 13.0
    [(13.0, 79, 0.9, .46), (13.9, 77, 0.6, .42), (14.5, 76, 0.65, .42), (15.25, 74, 1.5, .48), (16.75, 72, 0.5, .38)],
    [(17.5, 72, 1.4, .30), (18.9, 76, 1.0, .30), (19.9, 79, 1.5, .33)],                               # quietest: the worlds meet
    [(21.5, 77, 1.1, .48), (22.6, 79, 0.8, .50), (23.4, 81, 1.3, .55), (24.7, 79, 0.6, .50), (25.3, 77, 0.6, .48)],
    [(26.0, 76, 0.75, .52), (26.75, 79, 0.75, .56), (27.5, 81, 0.75, .60), (28.25, 83, 0.75, .64), (29.0, 84, 0.62, .68)],
    [(30.0, 88, 3.4, .80)],                                                                            # the peak, held
    [(33.5, 86, 0.8, .62), (34.3, 84, 0.7, .56), (35.0, 83, 0.9, .54), (35.9, 81, 0.5, .46), (36.4, 79, 0.38, .42)],
    [(36.85, 76, 0.95, .34)],                                                                          # cadence, gone by 37.8
]
PEAK = T['peak']


def glide(x, semis_from, glide_s):
    """Portamento: start `semis_from` away and slide to pitch over glide_s (time-varying resample)."""
    n = len(x)
    t = np.arange(n) / SR
    semis = np.where(t < glide_s, semis_from * (1 - t / glide_s) ** 1.5, 0.0)
    pos = np.cumsum(2 ** (semis / 12))
    pos = pos[pos < n - 1]
    return np.interp(pos, np.arange(n), x)


for p, phrase in enumerate(PHRASES):
    for k, (t0, m, d, v) in enumerate(phrase):
        first, last = k == 0, k == len(phrase) - 1
        x = vln(m, d + (0.0 if last else 0.06), v, attack=0.16 if first else 0.05, release=0.35 if last else 0.12)
        if t0 == PEAK:
            x = glide(x, -4.0, 0.28)                                          # slide up from C6 into the E6
            x *= np.minimum(1, 0.75 + 0.25 * np.arange(len(x)) / SR / 1.2)     # bloom on the held note
        if p == len(PHRASES) - 1:
            x *= np.linspace(1, 0.15, len(x))                                 # the cadence dies away
        M.add('violin', t0 + rng.normal(0, 0.006), x, pan=0.05, send=0.55)

# ---------------------------------------------------------------- strings underneath (pp), following the line
HARM = [  # (start, root, voicing)
    (0.45, 36, [55, 60, 64]), (2.5, 41, [57, 60, 65]), (4.5, 33, [57, 60, 64]), (5.4, 31, [55, 59, 62]),
    (6.75, 29, [57, 60, 65]), (8.15, 31, [55, 59, 62]), (9.0, 36, [55, 60, 64]), (10.1, 38, [57, 62, 65]),
    (11.0, 40, [55, 59, 64]), (12.4, 41, [57, 60, 65]), (13.0, 40, [55, 59, 64]), (14.5, 33, [57, 60, 64]),
    (15.25, 31, [55, 59, 62]), (16.75, 36, [55, 60, 64]), (17.5, 33, [57, 60, 64]), (18.9, 36, [55, 60, 64]),
    (21.5, 41, [57, 60, 65]), (24.7, 31, [55, 59, 62]), (26.0, 36, [55, 60, 64]), (27.5, 41, [57, 60, 65]),
    (28.25, 31, [55, 59, 62]), (29.0, 33, [57, 60, 64]), (30.0, 36, [55, 60, 64, 67]), (31.7, 41, [57, 60, 64, 69]),
    (33.5, 31, [55, 59, 62]), (34.3, 33, [57, 60, 64]), (35.0, 40, [55, 59, 64]), (35.9, 41, [57, 60, 65]),
    (36.4, 31, [55, 59, 62]), (36.85, 36, [55, 60, 64]),
]
END_MUSIC = T['silence']


def bed_level(t):
    if t < T['mix']:
        return 0.16
    if t < T['open1']:
        return 0.11                                                           # quietest
    if t < PEAK:
        return 0.14 + 0.12 * (t - T['open1']) / (PEAK - T['open1'])
    if t < T['comment']:
        return 0.3
    return 0.18


for i, (s, root, voic) in enumerate(HARM):
    e = HARM[i + 1][0] if i + 1 < len(HARM) else END_MUSIC - 0.1
    d = e - s
    lv = bed_level(s)
    rel = 0.25 if i + 1 < len(HARM) else 0.35
    M.add('bed', s, vc(root + 12, d + 0.05, lv * 1.2, attack=0.3, release=rel), pan=-0.3, send=0.45)
    for k, m in enumerate(voic):
        M.add('bed', s, vla(m, d + 0.05, lv * 0.75, attack=0.35, release=rel), pan=-0.2 + 0.15 * k, send=0.5)
    if PEAK <= s < T['comment']:
        M.add('bed', s, cb(root, d + 0.05, 0.25, attack=0.3, release=rel), pan=-0.1, send=0.3)

# soft harp on the meeting and on the peak
for t0, notes in [(T['mix'], [48, 55, 60, 64, 67]), (PEAK, [48, 55, 60, 64, 67, 72])]:
    for j, m in enumerate(notes):
        M.add('bed', t0 + 0.11 * j, harp(m + 12, 2.0, 0.16), pan=-0.3 + 0.12 * j, send=0.6)

# the logo: one note, after half a second of silence (the reference's sound logo)
L = T['logo']
M.add('logo', L, piano(84, 2.2, 0.5), send=0.55)
M.add('logo', L, harp(84, 2.0, 0.35), pan=0.1, send=0.55)
M.add('logo', L + 0.004, piano(72, 2.2, 0.22), pan=-0.1, send=0.5)

tmp = sys.argv[2] + '.raw.wav'
M.render(tmp, duck_buses=(), wet=0.6, rt=3.2, fade=0.8, stems='--stems' in sys.argv)
# true silence between the last note and the logo note (the reference's 0.5 s gap): gate the reverb tail
gated = sys.argv[2] + '.gated.wav'
g0, g1 = T['silence'] - 0.05, T['logo'] - 0.02
import subprocess  # noqa: E402
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-af',
                f"volume='if(between(t,{g0},{g1}),max(0,1-(t-{g0})/0.3),1)':eval=frame", gated], check=True)
os.replace(gated, tmp)
print('LUFS before', master(tmp, sys.argv[2], lufs=-17.0))
os.remove(tmp)
