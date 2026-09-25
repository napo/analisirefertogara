"""Render the social card from the app's existing logo and bundled fonts.

Requires Python Pillow; not needed by the app or normal builds.
Run `npm run tauri -- icon webapp/public/favicon.svg` before regenerating.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
image = Image.new('RGB', (1200, 630), '#F4F4F4')
draw = ImageDraw.Draw(image)
navy, orange, teal = '#011627', '#E65100', '#028090'

def font(family, size, weight):
    face = ImageFont.truetype(str(root / f'webapp/public/fonts/{family}.ttf'), size)
    axes = face.get_variation_axes()
    face.set_variation_by_axes([weight if axis['name'] == b'Weight' else axis['default'] for axis in axes])
    return face

def text(pos, value, size=25, color=navy, weight=500, family='roboto'):
    draw.text(pos, value, font=font(family, size, weight), fill=color)

# Existing brand mark, reused without redesign.
logo = Image.open(root / 'src-tauri/icons/icon.png').convert('RGBA')
logo.thumbnail((102, 102), Image.Resampling.LANCZOS)
image.paste(logo, (64, 58), logo)
text((186, 76), 'Referto Volley', 49, weight=800, family='montserrat')
draw.rounded_rectangle((64, 197, 142, 205), radius=4, fill=orange)
text((64, 235), 'Il rendimento', 51, weight=800, family='montserrat')
text((64, 297), 'della squadra,', 51, weight=800, family='montserrat')
text((64, 359), 'dal referto di gara.', 44, weight=700, family='montserrat')
text((66, 442), 'Rotazioni · Break point · Cambio palla', 26)
text((66, 552), 'Analisi locale. I dati restano sul tuo dispositivo.', 22, color='#505050')
# Schematic six-position court, not a statistical chart.
draw.rounded_rectangle((760, 194, 1136, 514), radius=22, fill=navy)
text((802, 220), 'ROTAZIONI P1–P6', 22, color='white', weight=600, family='rubik')
draw.rectangle((792, 272, 1104, 482), outline='#597080', width=2)
draw.line((792, 377, 1104, 377), fill='#597080', width=2)
for x in (896, 1000):
    draw.line((x, 272, x, 482), fill='#597080', width=2)
for number, x, y in [(4,844,324),(3,948,324),(2,1052,324),(5,844,430),(6,948,430),(1,1052,430)]:
    draw.ellipse((x-31,y-31,x+31,y+31), fill=orange if number==1 else teal)
    label=f'P{number}'
    face=font('rubik',24,600)
    draw.text((x,y),label,font=face,fill='white',anchor='mm')
draw.rectangle((0, 616, 1200, 630), fill=orange)
output=root/'webapp/public/social-preview.png'
image.save(output, optimize=True)
print(output)
