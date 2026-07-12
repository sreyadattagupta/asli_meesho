from PIL import Image, ImageDraw, ImageFont
import os, sys
D = sys.argv[1]
os.makedirs(D, exist_ok=True)
def font(sz):
    for n in ("arialbd.ttf","arial.ttf","DejaVuSans-Bold.ttf"):
        try: return ImageFont.truetype(n, sz)
        except OSError: pass
    return ImageFont.load_default()
def shirt(path, color, code=None):
    im = Image.new("RGB",(500,500),(240,240,240)); d = ImageDraw.Draw(im)
    d.polygon([(150,120),(200,90),(300,90),(350,120),(390,180),(340,210),(330,420),(170,420),(160,210),(110,180)], fill=color)
    if code:
        d.rectangle([360,300,495,385], fill=(255,255,255), outline=(0,0,0), width=3)
        d.text((372,326), code, fill=(0,0,0), font=font(36))
    im.save(path,"JPEG")
shirt(os.path.join(D,"catalog_real.jpg"),(30,90,200))
shirt(os.path.join(D,"live_genuine.jpg"),(30,90,200),"7X3K")
shirt(os.path.join(D,"live_wrongcode.jpg"),(30,90,200),"9ZZZ")
shirt(os.path.join(D,"live_otheritem.jpg"),(200,40,40),"7X3K")
# flatlay with A4 sheet for scale
im=Image.new("RGB",(700,500),(235,235,235)); d=ImageDraw.Draw(im)
d.rectangle([40,120,250,420],fill=(255,255,255),outline=(0,0,0),width=2)  # A4
d.polygon([(330,120),(390,90),(520,90),(580,120),(620,200),(560,230),(545,430),(365,430),(350,230),(290,200)],fill=(30,90,200))
im.save(os.path.join(D,"flatlay_real.jpg"),"JPEG")
print("wrote to", D)
