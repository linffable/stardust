from PIL import Image, ImageDraw, ImageFilter
import sys

S = 512
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([24, 24, S - 24, S - 24], radius=112, fill=(6, 12, 22, 255))

glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.polygon([(S * 0.5, S * 0.22), (S * 0.74, S * 0.82), (S * 0.5, S * 0.66), (S * 0.26, S * 0.82)],
           fill=(110, 231, 255, 255))
glow = glow.filter(ImageFilter.GaussianBlur(34))
img = Image.alpha_composite(img, glow)

d = ImageDraw.Draw(img)
d.polygon([(S * 0.5, S * 0.22), (S * 0.72, S * 0.80), (S * 0.5, S * 0.64), (S * 0.28, S * 0.80)],
          fill=(205, 250, 255, 255))
d.line([(S * 0.5, S * 0.26), (S * 0.5, S * 0.44)], fill=(255, 255, 255, 255), width=7)

out_ico = sys.argv[1]
out_png = sys.argv[2]
img.save(out_png)
img.save(out_ico, sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
print('icon ok')
