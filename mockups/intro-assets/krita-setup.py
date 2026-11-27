#!/usr/bin/env python3
import subprocess
import uuid
import zipfile
from pathlib import Path

W, H = 1280, 720
NAME = "YouTube thumbnail"
share = Path.home() / ".local/share/krita"

subprocess.run(["kwriteconfig6", "--file", "kritarc", "--group", "KisToolTransform", "--key", "filterId", "NearestNeighbor"], check=True)

sizes = share / "predefined_image_sizes"
sizes.mkdir(parents=True, exist_ok=True)
(sizes / "YouTube_thumbnail.predefinedimage").write_text(f"""<!DOCTYPE params>
<params>
 <param name="height">{H}</param>
 <param name="name"><![CDATA[{NAME}]]></param>
 <param name="resolution">72</param>
 <param name="width">{W}</param>
 <param name="x-unit">7</param>
 <param name="y-unit">7</param>
</params>
""")

samples = [
    ("Jersey 20", 170, "#ffc468", 10, 40, 200, "5 DAYS"),
    ("Jacquard 24", 96, "#ffffff", 6, 40, 330, "Fantasia"),
    ("Jersey 10", 64, "#ffffff", 4, 40, 420, "Jersey 10"),
    ("Pixelify Sans", 64, "#ffffff", 4, 40, 510, "Pixelify Sans"),
    ("VT323", 64, "#ffffff", 4, 40, 600, "VT323"),
]
texts = "\n".join(
    f'<text id="shape{i}" transform="translate({x}, {y})" fill="{fill}" stroke="#140c06" stroke-width="{sw}" stroke-linejoin="miter" paint-order="stroke" font-family="{font}" font-size="{size}">{label}</text>'
    for i, (font, size, fill, sw, x, y, label) in enumerate(samples)
)
svg = f"""<?xml version="1.0" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:krita="http://krita.org/namespaces/svg/krita" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" width="{W}pt" height="{H}pt" viewBox="0 0 {W} {H}">
{texts}
</svg>
"""


def layer(name, filename, nodetype, **extra):
    attrs = dict(visible="1", uuid="{%s}" % uuid.uuid4(), compositeop="normal", locked="0", filename=filename, colorlabel="0",
                 opacity="255", nodetype=nodetype, y="0", x="0", collapsed="0", channelflags="", name=name, **extra)
    return "   <layer " + " ".join(f'{k}="{v}"' for k, v in attrs.items()) + "/>"


maindoc = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE DOC PUBLIC '-//KDE//DTD krita 2.0//EN' 'http://www.calligra.org/DTD/krita-2.0.dtd'>
<DOC xmlns="http://www.calligra.org/DTD/krita" syntaxVersion="2" editor="Krita">
 <IMAGE height="{H}" description="" y-res="72" width="{W}" profile="sRGB-elle-V2-srgbtrc.icc" x-res="72" name="thumbnail" mime="application/x-kra" colorspacename="RGBA">
  <layers>
{layer("text", "layer3", "shapelayer", selected="true")}
{layer("art", "layer2", "paintlayer", colorspacename="RGBA", channellockflags="")}
{layer("background", "layer1", "paintlayer", colorspacename="RGBA", channellockflags="")}
  </layers>
  <ProjectionBackgroundColor ColorData="AAAAAA=="/>
 </IMAGE>
</DOC>
"""
empty = "VERSION 2\nTILEWIDTH 64\nTILEHEIGHT 64\nPIXELSIZE 4\nDATA 0\n"

src = share / "templates/fantasia4x/.source"
src.mkdir(parents=True, exist_ok=True)
(src.parent / ".directory").write_text("[Desktop Entry]\nName=Fantasia4x\n")
kra = src / "youtube-thumbnail.kra"
with zipfile.ZipFile(kra, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr(zipfile.ZipInfo("mimetype"), "application/x-krita", compress_type=zipfile.ZIP_STORED)
    z.writestr("maindoc.xml", maindoc)
    z.writestr("documentinfo.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE document-info PUBLIC \'-//KDE//DTD document-info 1.1//EN\' \'http://www.calligra.org/DTD/document-info-1.1.dtd\'>\n<document-info xmlns="http://www.calligra.org/DTD/document-info"><about><title>YouTube thumbnail</title></about></document-info>\n')
    for n, pixel in (("layer1", bytes([0, 0, 0, 255])), ("layer2", bytes(4))):
        z.writestr(f"thumbnail/layers/{n}", empty)
        z.writestr(f"thumbnail/layers/{n}.defaultpixel", pixel)
    z.writestr("thumbnail/layers/layer3.shapelayer/content.svg", svg)
(src.parent / "youtube-thumbnail.desktop").write_text(
    f"[Desktop Entry]\nIcon=template_ratio_169\nName={NAME}\nType=Link\nURL[$e]=.source/youtube-thumbnail.kra\nX-KDE-Hidden=false\n")
work = Path.home() / "Pictures/fantasia4x-intro/work"
work.mkdir(parents=True, exist_ok=True)
start = work / "youtube-thumbnail.kra"
if not start.exists():
    start.write_bytes(kra.read_bytes())
print("krita: transform filter NearestNeighbor, template", kra, "start file", start)
