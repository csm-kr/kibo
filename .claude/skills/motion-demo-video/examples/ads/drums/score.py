"""Moments 50s drum ad score: Afrobeat-flavoured live groove composed to the picture's cue list.

usage: python score.py cues.json out.wav [--stems]
100 BPM, 16th = 0.15s. Intro has no rhythm section; a breath at 4.2-4.8; the drop lands on the first UI cut;
the groove muffles under the quiet comment; a real stop at 40.8 with a fill into the 43.2 re-entry; hard silence at 45.0.
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
from audio import SR, Mix, OneShot, Sampler, band, master, mx, rng, sweep  # noqa: E402

SAM = os.path.join(HERE, '..', '..', 'pm', 'samples')
V = os.path.join(SAM, 'vsco')
data = json.load(open(sys.argv[1]))
T, CUES = data['T'], data['cues']
DUR = data['duration']
STEP = 0.15
BAR = 2.4
m = Mix(DUR, tail=2.0)


def c(type_):
    return [x for x in CUES if x['type'] == type_]


def hum(t, ms=8):
    return t + rng.uniform(-ms, ms) / 1000


def vel(v, spread=0.1):
    return v * rng.uniform(1 - spread, 1 + spread)


# ---------------------------------------------------------------- sounds
P = lambda f: os.path.join(V, 'Percussion', f)  # noqa: E731
S = {
    'bd': OneShot(P('BDrumNewhit_v6_rr1_Sum.wav')),
    'bd_big': OneShot(P('BDrumNewhit_v7_rr1_Sum.wav')),
    'sn': OneShot(P('Snare2-HitSN_v7_rr1_Sum.wav')),
    'sn_soft': OneShot(P('Snare2-HitSN_v5_rr1_Sum.wav')),
    'ghost': OneShot(P('afro/Snare2-taps_v2_rr1_Sum.wav')),
    'crash': OneShot(P('cymbal-crash1_ff_rr1.wav')),
    'crash_mf': OneShot(P('cymbal-crash1_mf_rr1.wav')),
    'conga': OneShot(P('afro/Conga-HitN_v2_rr1_Sum.wav')),
    'conga_t': OneShot(P('afro/Conga-Tap1_v1_rr1_Sum.wav')),
    'quinto': OneShot(P('afro/Quinto-HitN_v2_rr1_Sum.wav')),
    'tumba': OneShot(P('afro/Tumba-HitN_v2_rr1_Sum.wav')),
    'bell': OneShot(P('afro/Cowbell1_Hit_v2_rr1_Sum.wav')),
    'clave': OneShot(P('afro/Claves1_Hit_v2_rr1_Sum.wav')),
    'shk': OneShot(P('afro/Tamb1-Shake_v1_rr1_Sum.wav')),
    'impact': OneShot(os.path.join(SAM, 'sfx', 'impact-bass-1.mp3')),
    'whoosh': OneShot(os.path.join(SAM, 'sfx', 'whoosh-short.mp3')),
    'riser': OneShot(os.path.join(SAM, 'sfx', 'riser.mp3')),
    'key': OneShot(os.path.join(SAM, 'sfx', 'key-press.mp3')),
    'click': OneShot(os.path.join(SAM, 'sfx', 'click-soft.mp3')),
    'pop': OneShot(os.path.join(SAM, 'sfx', 'pop.mp3')),
}
tp = Sampler(os.path.join(V, 'Brass', 'Trumpet', 'sus'), layer=r'_v3', octave=1)
hn = Sampler(os.path.join(V, 'Brass', 'F_Horn', 'sus'), layer=r'_v2', octave=1)
glock = Sampler(os.path.join(V, 'Percussion', 'Glock'), loop=False, octave=1)
vc = Sampler(os.path.join(V, 'Strings', 'Cello_Section', 'susvib'), layer=r'_v1', octave=1)
vla = Sampler(os.path.join(V, 'Strings', 'Viola_Section', 'susvib'), layer=r'_v1', octave=1)


def tight(shot, pre=0.04):
    """One-shot trimmed to `pre` seconds before its peak (keeps breaths silent before a hit)."""
    x, pk = shot.at()
    i = max(0, int((pk - pre) * SR))
    y = x[i:].copy()
    y[: int(pre * SR)] *= np.linspace(0, 1, int(pre * SR)) ** 2
    return y, pre


def tt(sec):
    return np.arange(int(sec * SR)) / SR


def hat(v=0.3, open_=False):
    t = tt(0.3 if open_ else 0.06)
    n = band(rng.standard_normal(len(t)), 7000, 15000)
    return n * np.exp(-t / (0.11 if open_ else 0.018)) * v


def kick_sub(v=1.0):
    t = tt(0.4)
    f = 48 + 80 * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22) * v


def bass(mid, dur, v=0.5):
    f = 440 * 2 ** ((mid - 69) / 12)
    t = tt(dur + 0.06)
    y = np.tanh(2.2 * (np.sin(2 * np.pi * f * t) + 0.45 * np.sin(2 * np.pi * 2 * f * t) + 0.2 * np.sin(2 * np.pi * 3 * f * t)))
    env = (1 - np.exp(-t / 0.004)) * (0.6 + 0.4 * np.exp(-t / 0.09)) * np.where(t > dur, np.exp(-(t - dur) / 0.02), 1)
    return band(y * env, 30, 2400) * v


def pluck(mid, v=0.3, decay=0.996):
    """Karplus-Strong muted guitar skank."""
    f = 440 * 2 ** ((mid - 69) / 12)
    p = int(SR / f)
    n = int(0.22 * SR)
    buf = rng.uniform(-1, 1, p)
    out = np.zeros(n)
    for i in range(n):
        out[i] = buf[i % p]
        buf[i % p] = decay * 0.5 * (buf[i % p] + buf[(i + 1) % p])
    t = np.arange(n) / SR
    return band(out * np.exp(-t / 0.05), 300, 5000) * v


def noise_sweep(dur, lo0, lo1, hi0, hi1, v):
    L = int(dur * SR)
    k = np.linspace(0, 1, L)
    return sweep(rng.standard_normal(L), lo0 + (lo1 - lo0) * k, hi0 + (hi1 - hi0) * k) * v


# ---------------------------------------------------------------- groove
D_MIN = [62, 65, 69, 72]       # Dm7 voicing for skank / stabs
G_NIN = [59, 62, 65, 69]       # G9 (no root)
BASS1 = [(0, 38, 2), (3, 50, 1), (6, 48, 1), (7, 45, 1), (10, 38, 2), (13, 41, 1), (14, 43, 1)]
BASS2 = [(0, 43, 2), (3, 50, 1), (6, 41, 1), (8, 43, 2), (11, 45, 1), (13, 48, 1), (14, 45, 1)]
KICK1 = [(0, 1.0), (3, 0.7), (6, 0.85), (10, 0.9), (13, 0.65)]
KICK2 = [(0, 1.0), (6, 0.8), (8, 0.75), (11, 0.85), (14, 0.6)]
CONGA = [(2, 'conga', .45), (3, 'conga_t', .3), (5, 'tumba', .5), (7, 'quinto', .4), (10, 'conga', .45), (11, 'conga_t', .3), (13, 'tumba', .5), (15, 'quinto', .35)]
BELL = [0, 3, 6, 10, 12]


def groove(a, b, energy=1.0, hats=True, bell=False, horns=False):
    bar_i = 0
    t0 = a
    while t0 < b - 1e-6:
        alt = bar_i % 2
        for s_, v in (KICK2 if alt else KICK1):
            t = t0 + s_ * STEP
            if t < b:
                m.hit('drums', hum(t), S['bd'], 0.55 * vel(v) * energy)
                m.add('drums', hum(t, 2), kick_sub(0.5 * v * energy))
                m.duck(t, 0.8 * v)
        for s_ in (4, 12):
            t = t0 + s_ * STEP
            if t < b:
                m.hit('drums', hum(t), S['sn'], 0.5 * vel(1) * energy, pan=0.05, send=0.12)
        for s_ in (7, 9, 15):
            t = t0 + s_ * STEP
            if t < b:
                m.hit('drums', hum(t, 12), S['ghost'], 0.18 * vel(1, .3) * energy, pan=0.1)
        if hats:
            for s_ in range(0, 16, 2):
                t = t0 + s_ * STEP
                if t < b:
                    op = (s_ == 14 and alt)
                    m.add('drums', hum(t, 5), hat(0.22 * (1.0 if s_ % 4 == 0 else 0.7) * energy, op), pan=0.35)
        for s_ in range(16):
            t = t0 + s_ * STEP
            if t < b:
                m.hit('drums', hum(t, 6), S['shk'], 0.07 * (1.4 if s_ % 2 else 1.0) * energy, pan=-0.4)
        for s_, k, v in CONGA:
            t = t0 + s_ * STEP
            if t < b:
                m.hit('perc', hum(t, 10), S[k], v * 0.8 * vel(1, .2) * energy, pan=0.45 if 'quinto' in k else -0.3, send=0.1)
        if bell:
            for s_ in BELL:
                t = t0 + s_ * STEP
                if t < b:
                    m.hit('perc', hum(t, 4), S['bell'], 0.16 * energy, pan=0.55)
        for s_, mid, ln in (BASS2 if alt else BASS1):
            t = t0 + s_ * STEP
            if t < b:
                m.add('music', hum(t, 4), bass(mid, ln * STEP * 0.85, 0.32 * energy))
        chord = G_NIN if alt else D_MIN
        for s_ in (2, 3, 6, 10, 11, 14):
            t = t0 + s_ * STEP
            if t < b:
                for j, mid in enumerate(chord[1:3] if s_ % 2 else chord[:3]):
                    m.add('music', hum(t, 3), pluck(mid, 0.12 * energy), pan=0.3 - 0.15 * j, send=0.08)
        if horns:
            for s_ in (0, 3, 6, 10):
                t = t0 + s_ * STEP
                if t < b:
                    stab(t, 0.5 * energy, chord)
        bar_i += 1
        t0 += BAR


def stab(t, v=0.6, chord=D_MIN, long=False):
    d = 0.5 if long else 0.16
    for mid in chord[:3]:
        m.add('horns', hum(t, 3), tp(mid, d, 0.32 * v, release=0.12), pan=0.15, send=0.18)
    m.add('horns', hum(t, 3), hn(chord[0] - 12, d, 0.4 * v, release=0.15), pan=-0.15, send=0.18)


# sections (from the picture's own constants)
DROP, STOP, RE, END = T['drop'], T['stop'], T['reentry'], T['end']
QUIET0, QUIET1 = T['statPeel'], T['whip1']
groove(DROP, QUIET0, 1.0)
groove(QUIET0, QUIET1, 0.7, hats=False)                      # muffled below during the quiet comment
groove(QUIET1, T['collage'], 1.0, bell=True)
groove(T['collage'], STOP, 1.1, bell=True, horns=True)
groove(RE, END, 1.1, bell=True)

# intro: no rhythm section, a low string drone and foley; then a breath
m.add('music', 0.0, vc(50, T['breath'] - 0.1, 0.09, attack=0.8, release=0.5), send=0.4)
m.add('music', 0.0, vla(57, T['breath'] - 0.1, 0.06, attack=1.2, release=0.5), send=0.4)
for x in c('ecu'):
    t, i = x['t'], x['id']
    if i == '#e1':
        m.add('sfx', t, noise_sweep(0.9, 300, 300, 1500, 900, 0.05) * np.hanning(int(0.9 * SR)), send=0.3)   # candle breath
    elif i == '#e2':
        cr = np.zeros(int(1.1 * SR))
        for _ in range(40):
            j = int(rng.uniform(0, len(cr) - 300))
            cr[j:j + 200] += rng.standard_normal(200) * np.exp(-np.arange(200) / 30) * rng.uniform(.2, 1)
        m.add('sfx', t, band(cr, 1500, 9000) * 0.12, pan=0.2)                                               # crackle
    elif i == '#e3':
        sp = noise_sweep(0.7, 300, 200, 6000, 2500, 0.3) * np.exp(-np.linspace(0, 5, int(0.7 * SR)))
        m.add('sfx', t + 0.05, sp, send=0.2)                                                                  # splash
    elif i in ('#e5', '#e6', '#e7', '#e8', '#e9', '#e10') and t > DROP:
        pass                                                                                                  # cuts ride the groove
m.add('sfx', T['breath'] + 0.15, noise_sweep(0.45, 200, 600, 1200, 5000, 0.02) * np.linspace(0, 1, int(0.45 * SR)) ** 2, send=0.3)

# ---------------------------------------------------------------- accents tied to cues
for x in c('dot'):
    m.add('sfx', x['t'], glock(86, 0.6, 0.22), send=0.5)
for x in c('drop'):                                   # the biggest hit = first Moments screen
    t = x['t']
    y, pre = tight(S['impact'])
    m.add('sfx', t - pre, y, 0.38, send=0.2)
    m.hit('drums', t, S['crash'], 0.45, send=0.2)
    m.hit('drums', t, S['bd_big'], 0.6)
    stab(t, 1.0, D_MIN, long=True)
# nothing but the dot in the breath: cut every bus between breath and drop - 10 ms
for k in ('burst', 'results', 'collage'):
    for x in c(k):
        m.hit('drums', x['t'], S['crash_mf'], 0.32, send=0.2)
        stab(x['t'], 0.8, D_MIN)
for x in c('lastKey'):
    m.hit('drums', x['t'], S['sn'], 0.55, send=0.2)
    stab(x['t'], 0.7, G_NIN)
for x in c('stat'):
    stab(x['t'], 0.8, G_NIN)
for x in c('bigPunch'):                               # top accent
    m.hit('drums', x['t'], S['crash'], 0.4, send=0.2)
    m.hit('drums', x['t'], S['bd_big'], 0.5)
    stab(x['t'], 1.0, D_MIN, long=True)
for x in c('ring') + c('select'):
    m.add('sfx', x['t'], glock(86, 0.5, 0.16), send=0.5)
for x in c('send'):
    m.add('sfx', x['t'], glock(81, 0.5, 0.12), send=0.6)
for x in c('whip'):
    m.hit('sfx', x['t'] + 0.06, S['whoosh'], 0.35, pan=-0.2, send=0.15)
    m.hit('drums', x['t'], S['crash_mf'], 0.25, send=0.2)
for x in c('peel'):                                   # sticker peel: a short, bright paper rip
    L = x['dur'] + 0.05
    y = noise_sweep(L, 2500, 1200, 9000, 5000, 0.1) * np.exp(-np.linspace(0, 3, int(L * SR)))
    m.add('sfx', x['t'], y, pan=0.3)
for x in c('pop'):
    m.hit('sfx', x['t'], S['pop'], 0.07, semis=(x['i'] % 5) * 1.5 - 2, pan=0.1)
for x in c('note'):
    y = noise_sweep(0.12, 300, 200, 2500, 1500, 0.25) * np.exp(-np.linspace(0, 6, int(0.12 * SR)))
    m.add('sfx', x['t'], y, pan=0.2)
for x in c('key'):
    m.hit('sfx', x['t'], S['key'], 0.22 * vel(1, .15), semis=rng.uniform(-1, 1), pan=0.1)
for x in c('keySoft'):
    m.hit('sfx', x['t'], S['click'], 0.12 * vel(1, .15), semis=rng.uniform(-3, -1.5), pan=0.3, send=0.1)

# the floating last bar rises into the stop
fl = c('float')[0]
rx, pk = S['riser'].at()
L = int((STOP - fl['t']) * SR)
seg = rx[max(0, int(pk * SR) - L):int(pk * SR)] * np.linspace(0.3, 1, min(L, int(pk * SR))) ** 1.5
m.add('sfx', STOP - 0.1 - len(seg) / SR, seg * np.linspace(1, 0.6, len(seg)), 0.16, send=0.3)

# STOP: one hit, then the kick is gone; fill 41.7 -> 43.2; re-entry hit
m.hit('drums', STOP, S['crash_mf'], 0.22, send=0.15)
m.hit('drums', STOP, S['bd_big'], 0.6)
stab(STOP, 1.0, D_MIN)
m.add('music', STOP, bass(38, 0.3, 0.35))
for k in range(int((T['fill'] - STOP) / STEP)):
    t = STOP + 0.6 + k * STEP
    if t < T['fill']:
        m.hit('drums', hum(t, 6), S['shk'], 0.05, pan=-0.4)
fill_t = T['fill']
n = int(round((RE - fill_t) / STEP))
for k in range(n):
    t = fill_t + k * STEP
    g = 0.25 + 0.6 * k / n
    kind = ['sn_soft', 'tumba', 'conga', 'quinto'][k % 4] if k < n - 4 else 'sn'
    m.hit('drums' if kind.startswith('sn') else 'perc', hum(t, 5), S[kind], g * (0.6 if kind.startswith('sn') else 0.8), pan=0.4 * np.sin(k), send=0.15)
    if k >= n - 4:
        stab(t, 0.5 + 0.2 * (k - n + 4), D_MIN)
m.hit('drums', RE, S['crash'], 0.5, send=0.3)
m.hit('drums', RE, S['bd_big'], 0.6)
m.hit('sfx', RE, S['impact'], 0.3)
stab(RE, 1.0, D_MIN, long=True)

# muffle the groove under the quiet comment (lowpass closes, opens again on the whip)
i0, i1 = int(QUIET0 * SR), int(QUIET1 * SR)
Lq = i1 - i0
k = np.linspace(0, 1, Lq)
hi = 900 + 7000 * np.clip((k - 0.92) / 0.08, 0, 1) ** 2
for name in ('drums', 'perc', 'music'):
    bus = m.bus(name)
    for ch in range(2):
        bus[ch, i0:i1] = sweep(bus[ch, i0:i1], np.full(Lq, 20.0), hi) * 1.15

# the breath before the drop: only the dot's glock and the faint swell may sound (zero everything else 4.25 -> drop-0.04)
b0, b1 = int((T['breath'] + 0.05) * SR), int((DROP - 0.04) * SR)
for name in ('drums', 'perc', 'music', 'horns'):
    m.bus(name)[:, b0:b1] *= 0.0

tmp = os.path.join(HERE, 'out', '_score_raw.wav')
os.makedirs(os.path.dirname(tmp), exist_ok=True)
m.render(tmp, duck_buses=('music', 'perc', 'horns'), duck_amount=0.15, wet=0.35, rt=1.6, fade=0, stems='--stems' in sys.argv)
# hard silence at the end card
gated = os.path.join(HERE, 'out', '_score_gated.wav')
os.system(f"ffmpeg -v error -y -i {tmp} -af 'afade=t=out:st={END}:d=0.06' {gated}")
mastered = os.path.join(HERE, 'out', '_score_mastered.wav')
measured = master(gated, mastered, lufs=-16.0, limit=0.84)
os.system(f"ffmpeg -v error -y -i {mastered} -af 'alimiter=limit=0.8:attack=0.3:release=30:level=false' {sys.argv[2]}")
print('wrote', sys.argv[2], 'pre-master LUFS', measured)
