# -*- coding: utf-8 -*-
"""生成卡通地球 PWA 图标（192 / 512），保存到脚本所在目录。"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))


def make(size, path):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = size / 2
    R = size * 0.46

    # 海洋
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(63, 169, 245, 255))

    # 陆地（绿色团块）
    def blob(bx, by, rw, rh):
        d.ellipse([bx - rw, by - rh, bx + rw, by + rh], fill=(87, 204, 106, 255))

    blob(cx - R * 0.60, cy - R * 0.55, R * 0.40, R * 0.28)
    blob(cx + R * 0.48, cy - R * 0.40, R * 0.28, R * 0.38)
    blob(cx - R * 0.40, cy + R * 0.58, R * 0.44, R * 0.24)
    blob(cx + R * 0.52, cy + R * 0.48, R * 0.24, R * 0.20)

    # 表情
    ex = R * 0.30
    ey = cy - R * 0.06
    er = R * 0.11
    d.ellipse([cx - ex - er, ey - er, cx - ex + er, ey + er], fill=(21, 58, 94, 255))
    d.ellipse([cx + ex - er, ey - er, cx + ex + er, ey + er], fill=(21, 58, 94, 255))
    d.arc([cx - R * 0.26, cy + R * 0.00, cx + R * 0.26, cy + R * 0.42],
          start=20, end=160, fill=(21, 58, 94, 255), width=max(2, int(R * 0.10)))

    # 高光
    d.ellipse([cx - R * 0.74, cy - R * 0.74, cx - R * 0.36, cy - R * 0.36],
              fill=(255, 255, 255, 65))

    img.save(path)


make(192, os.path.join(HERE, "icon-192.png"))
make(512, os.path.join(HERE, "icon-512.png"))
print("earth icons ->", HERE)
