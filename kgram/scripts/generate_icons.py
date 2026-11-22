import math
import os
from PIL import Image, ImageDraw, ImageFilter

def create_kgram_icon(size=512, is_round=False):
    # High resolution canvas with supersampling for crisp anti-aliasing
    scale = 4
    canvas_size = size * scale
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    pad = int(canvas_size * 0.08)
    corner_radius = int(canvas_size * 0.24)
    bounds = [pad, pad, canvas_size - pad, canvas_size - pad]

    # 1. Base shape mask (Squircle or Round)
    base_mask = Image.new("L", (canvas_size, canvas_size), 0)
    bdraw = ImageDraw.Draw(base_mask)
    if is_round:
        bdraw.ellipse(bounds, fill=255)
    else:
        bdraw.rounded_rectangle(bounds, radius=corner_radius, fill=255)

    # 2. Gradient Onyx Background (#0A0A0C to #181720)
    bg = Image.new("RGBA", (canvas_size, canvas_size), (10, 10, 12, 255))
    bg_draw = ImageDraw.Draw(bg)
    center_x, center_y = canvas_size // 2, canvas_size // 2
    max_radius = int(canvas_size * 0.6)
    for r in range(max_radius, 0, -scale * 2):
        factor = (r / max_radius)
        # Gradient from #1F1D2B (center) to #0A0A0C (edge)
        cr = int(31 * (1 - factor) + 10 * factor)
        cg = int(29 * (1 - factor) + 10 * factor)
        cb = int(43 * (1 - factor) + 12 * factor)
        bg_draw.ellipse(
            [center_x - r, center_y - r, center_x + r, center_y + r],
            fill=(cr, cg, cb, 255)
        )

    # 3. Glass Rim / Border (#7E6FC4 subtle border)
    border_layer = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    border_draw = ImageDraw.Draw(border_layer)
    border_width = int(canvas_size * 0.015)
    if is_round:
        border_draw.ellipse(bounds, outline=(126, 111, 196, 160), width=border_width)
    else:
        border_draw.rounded_rectangle(bounds, radius=corner_radius, outline=(126, 111, 196, 160), width=border_width)

    # 4. Icon Emblem (Lavender #B8A7F0 Telegram Plane + 'k' dynamic accents)
    emblem_layer = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    edraw = ImageDraw.Draw(emblem_layer)

    # Plane geometry
    p_center_x = int(canvas_size * 0.48)
    p_center_y = int(canvas_size * 0.52)
    s = canvas_size * 0.40

    # Main wing
    p1 = (p_center_x + s * 0.50, p_center_y - s * 0.45) # nose tip
    p2 = (p_center_x - s * 0.48, p_center_y - s * 0.05) # left wing tip
    p3 = (p_center_x - s * 0.12, p_center_y + s * 0.38) # tail tip

    # Lavender gradient colors
    lav_light = (217, 207, 253, 255) # #D9CFFD
    lav_main = (184, 167, 240, 255)  # #B8A7F0
    lav_deep = (142, 122, 218, 255)  # #8E7ADA
    lav_shade = (95, 78, 160, 255)   # #5F4EA0

    # Top wing fold
    edraw.polygon([p1, p2, (p_center_x + s * 0.02, p_center_y + s * 0.08)], fill=lav_light)
    # Right wing fold
    edraw.polygon([p1, (p_center_x + s * 0.02, p_center_y + s * 0.08), p3], fill=lav_main)
    # Under wing fold
    p_under = (p_center_x - s * 0.22, p_center_y + s * 0.15)
    edraw.polygon([p2, (p_center_x + s * 0.02, p_center_y + s * 0.08), p_under], fill=lav_deep)
    # Keel / fold connection
    edraw.polygon([p_under, (p_center_x + s * 0.02, p_center_y + s * 0.08), p3], fill=lav_shade)

    # Dynamic "k" accent curve in the background of the plane (fluid trail)
    trail_pts = [
        (int(canvas_size * 0.24), int(canvas_size * 0.30)),
        (int(canvas_size * 0.24), int(canvas_size * 0.72)),
    ]
    edraw.line(trail_pts, fill=(184, 167, 240, 220), width=int(canvas_size * 0.038))

    trail_arm1 = [
        (int(canvas_size * 0.24), int(canvas_size * 0.52)),
        (int(canvas_size * 0.38), int(canvas_size * 0.36)),
    ]
    edraw.line(trail_arm1, fill=(184, 167, 240, 220), width=int(canvas_size * 0.034))

    trail_arm2 = [
        (int(canvas_size * 0.29), int(canvas_size * 0.46)),
        (int(canvas_size * 0.41), int(canvas_size * 0.68)),
    ]
    edraw.line(trail_arm2, fill=(184, 167, 240, 220), width=int(canvas_size * 0.034))

    # Dot caps for modern tech aesthetic
    edraw.ellipse([int(canvas_size * 0.24 - canvas_size * 0.019), int(canvas_size * 0.30 - canvas_size * 0.019),
                   int(canvas_size * 0.24 + canvas_size * 0.019), int(canvas_size * 0.30 + canvas_size * 0.019)], fill=(217, 207, 253, 255))
    edraw.ellipse([int(canvas_size * 0.24 - canvas_size * 0.019), int(canvas_size * 0.72 - canvas_size * 0.019),
                   int(canvas_size * 0.24 + canvas_size * 0.019), int(canvas_size * 0.72 + canvas_size * 0.019)], fill=(217, 207, 253, 255))
    edraw.ellipse([int(canvas_size * 0.38 - canvas_size * 0.017), int(canvas_size * 0.36 - canvas_size * 0.017),
                   int(canvas_size * 0.38 + canvas_size * 0.017), int(canvas_size * 0.36 + canvas_size * 0.017)], fill=(217, 207, 253, 255))
    edraw.ellipse([int(canvas_size * 0.41 - canvas_size * 0.017), int(canvas_size * 0.68 - canvas_size * 0.017),
                   int(canvas_size * 0.41 + canvas_size * 0.017), int(canvas_size * 0.68 + canvas_size * 0.017)], fill=(217, 207, 253, 255))

    # Assemble layers
    final_img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    final_img.paste(bg, (0, 0), mask=base_mask)
    final_img.alpha_composite(border_layer)
    final_img.alpha_composite(emblem_layer)

    # Downsample with Lanczos filter for crisp rendering
    return final_img.resize((size, size), Image.Resampling.LANCZOS)

def main():
    out_dir = r"C:\Users\ДДД\Desktop\s\kgram\assets"
    os.makedirs(out_dir, exist_ok=True)

    # Master store icon
    icon_512 = create_kgram_icon(512, is_round=False)
    icon_512.save(os.path.join(out_dir, "kgram_icon_512.png"))

    # Mipmap densities
    densities = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }

    for folder, dim in densities.items():
        folder_path = os.path.join(out_dir, folder)
        os.makedirs(folder_path, exist_ok=True)

        # Standard squircle launcher
        sq = create_kgram_icon(dim, is_round=False)
        sq.save(os.path.join(folder_path, "ic_launcher.png"))
        sq.save(os.path.join(folder_path, "ic_launcher_sa.png"))

        # Round launcher
        rd = create_kgram_icon(dim, is_round=True)
        rd.save(os.path.join(folder_path, "ic_launcher_round.png"))
        rd.save(os.path.join(folder_path, "ic_launcher_sa_round.png"))

    print("Successfully generated all kGram branding assets!")

if __name__ == "__main__":
    main()
