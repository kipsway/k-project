import os
from PIL import Image, ImageDraw

def create_base_icon(size=128):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    corner = int(size * 0.25)
    pad = 4
    # Onyx background
    draw.rounded_rectangle([(pad, pad), (size - pad, size - pad)], radius=corner, fill="#0F0F12", outline="#2C2B32", width=2)
    return img, draw

def generate_ktube(path):
    img, draw = create_base_icon()
    # Lavender Play Triangle
    draw.polygon([(46, 36), (92, 64), (46, 92)], fill="#B8A7F0")
    draw.polygon([(46, 64), (92, 64), (46, 92)], fill="#7E6FC4")
    # Mosaic accent pixel
    draw.rectangle([(88, 32), (96, 40)], fill="#D9CFFD")
    img.save(path, "PNG")

def generate_ktok(path):
    img, draw = create_base_icon()
    # Music note / 'd' shape
    draw.rectangle([(64, 34), (74, 82)], fill="#B8A7F0")
    draw.ellipse([(40, 68), (68, 92)], fill="#B8A7F0")
    draw.rectangle([(64, 34), (88, 48)], fill="#7E6FC4")
    draw.rectangle([(32, 40), (40, 48)], fill="#D9CFFD")
    img.save(path, "PNG")

def generate_kgram(path):
    img, draw = create_base_icon()
    # Paper plane
    draw.polygon([(32, 62), (94, 34), (68, 94)], fill="#B8A7F0")
    draw.polygon([(56, 70), (94, 34), (68, 94)], fill="#7E6FC4")
    draw.polygon([(56, 70), (62, 86), (68, 76)], fill="#D9CFFD")
    img.save(path, "PNG")

def generate_kwitch(path):
    img, draw = create_base_icon()
    # Twitch bubble with 2 eye slits
    draw.polygon([(36, 34), (92, 34), (92, 82), (76, 82), (68, 94), (56, 94), (56, 82), (36, 82)], fill="#B8A7F0")
    draw.rectangle([(50, 48), (56, 68)], fill="#0F0F12")
    draw.rectangle([(72, 48), (78, 68)], fill="#0F0F12")
    draw.rectangle([(94, 60), (102, 68)], fill="#7E6FC4")
    img.save(path, "PNG")

def main():
    assets_dir = r"C:\Users\ДДД\Desktop\s\kstore\assets"
    os.makedirs(assets_dir, exist_ok=True)
    generate_ktube(os.path.join(assets_dir, "ktube_icon.png"))
    generate_ktok(os.path.join(assets_dir, "ktok_icon.png"))
    generate_kgram(os.path.join(assets_dir, "kgram_icon.png"))
    generate_kwitch(os.path.join(assets_dir, "kwitch_icon.png"))
    print("All store icons generated in:", assets_dir)

if __name__ == "__main__":
    main()
