"""Render the social card from the app's logo, bundled fonts and report visual language.

The card mirrors what the app produces: the report header (logo, title, orange rule), the
"Rendimento per rotazione" bars (BP navy, CP orange) and the "Andamento della gara" strip
(difference line, Fase BP/CP and P1–P6 identity colors). Colors come from webapp/src/theme.js.

Requires Python Pillow; not needed by the app or normal builds.
Run `npm run tauri -- icon webapp/public/favicon.svg` before regenerating.
"""
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
W, H, S = 1200, 630, 2  # drawn at 2x, then downscaled for smooth lines and curves
image = Image.new('RGB', (W * S, H * S), '#F4F4F4')
draw = ImageDraw.Draw(image)

# webapp/src/theme.js and index.css
navy, orange = '#011627', '#E65100'
heading, text_gray, muted = '#383838', '#505050', '#7D7D7D'
border = '#E1E3E5'
positive, negative = '#2E7D32', '#C62828'
rotation = {
    1: ('#2a78d6', '#FFFFFF'), 2: ('#eda100', navy), 3: ('#4a3aa7', '#FFFFFF'),
    4: ('#1baf7a', navy), 5: ('#9085e9', navy), 6: ('#e87ba4', navy),
}


def s(*values):
    return tuple(v * S for v in values)


def font(family, size, weight):
    face = ImageFont.truetype(str(root / f'webapp/public/fonts/{family}.ttf'), size * S)
    axes = face.get_variation_axes()
    face.set_variation_by_axes([weight if axis['name'] == b'Weight' else axis['default'] for axis in axes])
    return face


def text(pos, value, size=25, color=navy, weight=500, family='roboto', anchor='la'):
    draw.text(s(*pos), value, font=font(family, size, weight), fill=color, anchor=anchor)


def card(box, accent=None):
    draw.rounded_rectangle(s(*box), radius=12 * S, fill='white', outline=border, width=S)
    if accent:
        x0, y0, x1, _ = box
        draw.rounded_rectangle(s(x0, y0, x1, y0 + 4), radius=2 * S, fill=accent)


# Report header: logo, title, orange rule.
logo = Image.open(root / 'src-tauri/icons/icon.png').convert('RGBA')
logo.thumbnail(s(64, 64), Image.Resampling.LANCZOS)
image.paste(logo, s(56, 30), logo)
text((136, 62), 'Analisi Referto Volley', 34, weight=800, family='montserrat', anchor='lm')
draw.rectangle(s(56, 110, 1144, 113), fill=orange)

# Message.
text((56, 160), 'Il rendimento', 50, weight=800, family='montserrat')
text((56, 222), 'della squadra,', 50, weight=800, family='montserrat')
text((56, 290), 'dal referto di gara.', 36, color=heading, weight=700, family='montserrat')
text((58, 362), 'Rotazioni P1–P6 · Break point · Cambio palla', 22, color=text_gray)

# KPI cards, as in the report's first page.
for x, label, value, accent in [(56, 'PUNTI IN BREAK POINT', '50', navy),
                                (256, 'PUNTI IN CAMBIO PALLA', '58', orange)]:
    card((x, 414, x + 184, 528), accent)
    text((x + 16, 434), label, 13, color=text_gray, weight=600, family='rubik')
    text((x + 16, 456), value, 42, weight=800, family='montserrat')
text((58, 568), 'Analisi locale. I dati restano sul tuo dispositivo.', 19, color=muted)

# "Rendimento per rotazione (P1–P6)": BP won vs CP lost per rotation.
card((560, 140, 1144, 352))
text((580, 158), 'Rendimento per rotazione (P1–P6)', 19, color=heading, weight=700, family='montserrat')
for x, label, color in [(580, 'Punti BP', navy), (680, 'Subiti CP', orange)]:
    draw.rectangle(s(x, 191, x + 12, 203), fill=color)
    text((x + 18, 197), label, 14, color=text_gray, anchor='lm')
bp, cp = [10, 12, 4, 6, 12, 6], [7, 9, 5, 13, 7, 3]
base, scale, step = 322, 7.5, 89
for level in (5, 10):
    draw.line(s(580, base - level * scale, 1124, base - level * scale), fill='#EEF0F2', width=S)
for i in range(6):
    x = 600 + i * step
    draw.rectangle(s(x, base - bp[i] * scale, x + 24, base), fill=navy)
    draw.rectangle(s(x + 26, base - cp[i] * scale, x + 50, base), fill=orange)
    text((x + 25, base + 15), f'P{i + 1}', 14, color=text_gray, anchor='mm')
draw.line(s(580, base, 1124, base), fill=muted, width=S)

# "Andamento della gara": difference line over a simulated set, with Fase and P strips.
card((560, 368, 1144, 590))
text((580, 386), 'Andamento della gara', 19, color=heading, weight=700, family='montserrat')


def simulate(seed):
    rng = random.Random(seed)
    serving, rot, diff, rallies = True, 1, 0, []
    while len(rallies) < 46:
        won = rng.random() < (0.45 if serving else 0.6)
        rallies.append(('BP' if serving else 'CP', rot, diff))
        diff += 1 if won else -1
        if won and not serving:
            rot = rot % 6 + 1
        serving = won
    return rallies + [rallies[-1][:2] + (diff,)]


# First seed giving a balanced set: within ±5, both above and below parity, won at the end.
rallies = next(r for r in map(simulate, range(1000))
               if max(abs(d) for *_, d in r) <= 5 and min(d for *_, d in r) <= -3 and r[-1][2] >= 2)

x0, x1, mid = 610, 1124, 466
dx = (x1 - x0) / (len(rallies) - 1)
text((598, mid), '0', 12, color=muted, anchor='rm')
draw.line(s(x0, mid, x1, mid), fill=navy, width=S)
for k in range(len(rallies) - 1):
    a, b = rallies[k][2], rallies[k + 1][2]
    color = positive if a + b > 0 or (a + b == 0 and b > 0) else negative
    draw.line(s(x0 + k * dx, mid - a * 9, x0 + (k + 1) * dx, mid - b * 9), fill=color, width=3 * S)
for row, y in [('Fase', 524), ('P', 550)]:
    text((598, y + 8), row, 12, color=muted, anchor='rm')
    k = 0
    while k < len(rallies) - 1:
        phase, rot_k, _ = rallies[k]
        end = k
        key = phase if row == 'Fase' else rot_k
        while end + 1 < len(rallies) - 1 and (rallies[end + 1][0] if row == 'Fase' else rallies[end + 1][1]) == key:
            end += 1
        fill, ink = ((navy, 'white') if key == 'BP' else (orange, 'white')) if row == 'Fase' else rotation[key]
        left, right = x0 + k * dx, x0 + (end + 1) * dx
        draw.rectangle(s(left, y, right - 1, y + 16), fill=fill)
        if right - left > 22:
            text(((left + right) / 2, y + 8), key if row == 'Fase' else f'P{key}', 10, color=ink, weight=700, anchor='mm')
        k = end + 1

image = image.resize((W, H), Image.Resampling.LANCZOS)
output = root / 'webapp/public/social-preview.png'
image.save(output, optimize=True)
print(output)
