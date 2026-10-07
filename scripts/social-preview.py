"""Render the social card: the scoresheet behind, the report the app produces in front.

Both pictures come from the sample files in the repository root (a fictional match): the
scoresheet PDF and the report PDF exported by the app. Crops avoid the federation logo and the
signatures at the bottom of the scoresheet. Colors and fonts are the app's (theme.js, index.css).

Requires Python Pillow and Poppler's pdftoppm; not needed by the app or normal builds.
Run `npm run tauri -- icon webapp/public/favicon.svg` before regenerating.
"""
import subprocess
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

root = Path(__file__).resolve().parents[1]
W, H, S = 1200, 630, 2  # drawn at 2x, then downscaled for smooth text and edges
DPI = 200
navy, orange, teal = '#011627', '#E65100', '#028090'
heading, text_gray = '#383838', '#505050'
image = Image.new('RGB', (W * S, H * S), '#F4F4F4')
draw = ImageDraw.Draw(image)


def s(*values):
    return tuple(round(v * S) for v in values)


def font(family, size, weight):
    face = ImageFont.truetype(str(root / f'webapp/public/fonts/{family}.ttf'), size * S)
    axes = face.get_variation_axes()
    face.set_variation_by_axes([weight if axis['name'] == b'Weight' else axis['default'] for axis in axes])
    return face


def text(pos, value, size, color=navy, weight=500, family='roboto', anchor='la'):
    face = font(family, size, weight)
    draw.text(s(*pos), value, font=face, fill=color, anchor=anchor)
    return draw.textlength(value, font=face) / S


def render(pdf_name, page):
    """Render one page of a sample PDF; crop boxes below are in 150 dpi pixels."""
    pdf = next(root.glob(pdf_name))
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['pdftoppm', '-r', str(DPI), '-png', '-f', str(page), '-l', str(page),
                        '-singlefile', str(pdf), f'{tmp}/page'], check=True)
        return Image.open(f'{tmp}/page.png').convert('RGB')


def crop(page, box):
    return page.crop(tuple(round(v * DPI / 150) for v in box))


def fit_width(picture, width):
    return picture.resize((width, round(picture.height * width / picture.width)), Image.Resampling.LANCZOS)


def drop(picture, pos, angle=0, radius=0):
    """Paste a picture with rounded corners and a soft shadow, optionally rotated."""
    mask = Image.new('L', picture.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *picture.size), radius=radius, fill=255)
    layer = picture.convert('RGBA')
    layer.putalpha(mask)
    if angle:
        layer = layer.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    shadow = Image.new('RGBA', layer.size, (1, 22, 39, 0))
    shadow.putalpha(layer.getchannel('A').point(lambda a: a * 0.22))
    shadow = shadow.filter(ImageFilter.GaussianBlur(14 * S))
    x, y = s(*pos)
    image.paste(shadow, (x + 4 * S, y + 12 * S), shadow)
    image.paste(layer, (x, y), layer)


# Behind: the scoresheet (match header and the first sets), tilted like a sheet on the table.
sheet = crop(render('Referto_*.pdf', 1), (20, 60, 2186, 1000))
drop(fit_width(sheet, 860 * S), (590, 0), angle=5)

# In front: the report exported by the app (header, match, rotation and set charts).
report = render('Report-*.pdf', 1)
parts = [crop(report, (25, 20, 1216, 96)), crop(report, (25, 104, 1216, 226)),
         crop(report, (25, 1000, 1216, 1530))]
front = Image.new('RGB', (parts[0].width + 60, sum(p.height for p in parts) + 50), 'white')
y = 25
for part in parts:
    front.paste(part, (30, y))
    y += part.height
drop(fit_width(front, 590 * S), (640, 292), radius=14 * S)

# Brand stripe on the left edge, navy above and orange below.
draw.rectangle(s(0, 0, 14, 420), fill=navy)
draw.rectangle(s(0, 420, 14, H), fill=orange)

# Title, logo and message.
logo = Image.open(root / 'src-tauri/icons/icon.png').convert('RGBA')
logo.thumbnail(s(84, 84), Image.Resampling.LANCZOS)
image.paste(logo, s(64, 58), logo)
text((166, 100), 'Referto Volley', 54, weight=800, family='montserrat', anchor='lm')
text((64, 186), 'Dal referto di gara', 40, color=heading, weight=800, family='montserrat')
x = 64 + text((64, 238), 'a ', 40, color=heading, weight=800, family='montserrat')
text((x, 238), 'rotazioni e grafici', 40, color=orange, weight=800, family='montserrat')
text((64, 312), 'Carichi il PDF del referto: l’app ricostruisce', 21, color=text_gray, weight=400)
text((64, 342), 'la gara e analizza break point e cambio palla', 21, color=text_gray, weight=400)
text((64, 372), 'in ognuna delle sei rotazioni.', 21, color=text_gray, weight=400)
x = 64
for label in ('PDF del referto', 'Rotazioni P1–P6', 'Open source'):
    width = draw.textlength(label, font=font('roboto', 18, 600)) / S
    draw.rounded_rectangle(s(x, 424, x + width + 32, 466), radius=21 * S, fill=navy)
    text((x + 16, 445), label, 18, color='white', weight=600, anchor='lm')
    x += width + 44
text((64, 562), 'refertogara.volleyserve.it', 28, color=teal, weight=700, family='montserrat')

image = image.resize((W, H), Image.Resampling.LANCZOS)
output = root / 'webapp/public/social-preview.png'
image.save(output, optimize=True)
print(output)
