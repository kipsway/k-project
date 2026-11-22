import os
from PIL import Image, ImageDraw

def create_ktube_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    scale = size / 512.0

    # Background squircle / rounded rect
    corner_radius = int(112 * scale)
    pad = int(16 * scale)
    draw.rounded_rectangle(
        [(pad, pad), (size - pad, size - pad)],
        radius=corner_radius,
        fill="#0A0A0C",
        outline="#2C2B32",
        width=max(1, int(4 * scale))
    )

    # Subtle inner ambient rim
    draw.rounded_rectangle(
        [(pad + int(8 * scale), pad + int(8 * scale)), (size - pad - int(8 * scale), size - pad - int(8 * scale))],
        radius=max(1, corner_radius - int(8 * scale)),
        outline="#15141A",
        width=max(1, int(2 * scale))
    )

    # Play symbol geometry
    # Body points: (190, 150) -> (360, 256) -> (190, 362)
    p_top = (190 * scale, 150 * scale)
    p_right = (360 * scale, 256 * scale)
    p_center = (260 * scale, 256 * scale)
    p_bottom = (190 * scale, 362 * scale)

    # Upper facet (Lavender #B8A7F0)
    draw.polygon([p_top, p_right, p_center], fill="#B8A7F0")

    # Lower-back facet (Deep Lavender #7E6FC4)
    draw.polygon([p_top, p_center, p_bottom], fill="#7E6FC4")

    # Lower-front facet (Accent Dark #2A2442)
    draw.polygon([p_center, p_right, p_bottom], fill="#2A2442")

    # Upper edge optical highlight (#D9CFFD)
    draw.line([p_top, p_right], fill="#D9CFFD", width=max(1, int(6 * scale)))

    # Mosaic satellite pixels
    # Pixel 1: top satellite
    px1 = (330 * scale, 140 * scale)
    sz1 = 28 * scale
    draw.rectangle([px1, (px1[0] + sz1, px1[1] + sz1)], fill="#B8A7F0")

    # Pixel 2: bottom satellite
    px2 = (345 * scale, 335 * scale)
    sz2 = 24 * scale
    draw.rectangle([px2, (px2[0] + sz2, px2[1] + sz2)], fill="#7E6FC4")

    # Pixel 3: left satellite
    px3 = (145 * scale, 244 * scale)
    sz3 = 20 * scale
    draw.rectangle([px3, (px3[0] + sz3, px3[1] + sz3)], fill="#D9CFFD")

    return img

def main():
    base_dir = r"C:\Users\ДДД\Desktop\s\ktube\branding"
    res_dir = os.path.join(base_dir, "res")

    targets = {
        os.path.join(base_dir, "icon.png"): 512,
        os.path.join(res_dir, "mipmap-mdpi", "ic_launcher.png"): 48,
        os.path.join(res_dir, "mipmap-hdpi", "ic_launcher.png"): 72,
        os.path.join(res_dir, "mipmap-xhdpi", "ic_launcher.png"): 96,
        os.path.join(res_dir, "mipmap-xxhdpi", "ic_launcher.png"): 144,
        os.path.join(res_dir, "mipmap-xxxhdpi", "ic_launcher.png"): 192,
    }

    for path, size in targets.items():
        os.makedirs(os.path.dirname(path), exist_ok=True)
        img = create_ktube_icon(size)
        img.save(path, "PNG")
        print(f"Generated: {path} ({size}x{size})")

if __name__ == "__main__":
    main()
