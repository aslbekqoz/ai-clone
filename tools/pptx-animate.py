"""build-pptx.js yozgan PPTX'ga bosish animatsiyalari, slayd o'tishi va grafik tuzatishlarini qo'shadi.

- Nomi "k<qadam>|..." bo'lgan har bir shakl/grafik/jadval <qadam>-bosishda paydo bo'ladi (fade, 0,4 s).
  Bir qadamdagi elementlar birga ochiladi. Nomdagi "k<qadam>|" prefiksi olib tashlanadi.
- Har bir slaydga 0,5 s fade o'tishi qo'yiladi.
- Grafiklardagi "_asos" qatori (maydonni ikki chiziq orasiga qo'yish uchun yordamchi qatlam) ko'rinmas qilinadi.

Ishlatish: python3 tools/pptx-animate.py pptx/aqsh-taqdimot.pptx
"""
import re
import sys
import zipfile
from xml.sax.saxutils import escape

STEP = re.compile(r'<p:cNvPr id="(\d+)" name="k(\d+)\|([^"]*)"')


def effect(ids, spid, first):
    """Bitta element uchun fade kirish effekti."""
    a, b, c = ids(), ids(), ids()
    node = 'clickEffect' if first else 'withEffect'
    return (
        f'<p:par><p:cTn id="{a}" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="{node}">'
        f'<p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>'
        f'<p:set><p:cBhvr><p:cTn id="{b}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>'
        f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr>'
        f'<p:to><p:strVal val="visible"/></p:to></p:set>'
        f'<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="{c}" dur="400"/>'
        f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl></p:cBhvr></p:animEffect>'
        f'</p:childTnLst></p:cTn></p:par>'
    )


def timing(steps, kinds):
    counter = iter(range(3, 100000))
    ids = lambda: next(counter)
    clicks = []
    for k in sorted(steps):
        inner = ''.join(effect(ids, spid, i == 0) for i, spid in enumerate(steps[k]))
        o, i2 = ids(), ids()
        clicks.append(
            f'<p:par><p:cTn id="{o}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst>'
            f'<p:par><p:cTn id="{i2}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>{inner}'
            f'</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>'
        )
    bld = ''.join(
        f'<p:bldGraphic spid="{spid}" grpId="0"><p:bldAsOne/></p:bldGraphic>' if kinds[spid] == 'graphicFrame'
        else f'<p:bldP spid="{spid}" grpId="0" animBg="1"/>'
        for k in sorted(steps) for spid in steps[k] if kinds[spid] in ('graphicFrame', 'sp')
    )
    return (
        '<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>'
        '<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>'
        + ''.join(clicks) +
        '</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>'
        '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>'
        '</p:childTnLst></p:cTn></p:par></p:tnLst>'
        + (f'<p:bldLst>{bld}</p:bldLst>' if bld else '') +
        '</p:timing>'
    )


TRANSITION = '<p:transition spd="med"><p:fade/></p:transition>'


def process_slide(xml):
    steps, kinds = {}, {}
    # har bir cNvPr qaysi element turiga tegishli ekanini aniqlash
    for m in re.finditer(r'<p:(sp|graphicFrame|pic|cxnSp)>\s*<p:nv\w+Pr>\s*<p:cNvPr id="(\d+)" name="([^"]*)"', xml):
        kinds[m.group(2)] = m.group(1)
    for m in STEP.finditer(xml):
        steps.setdefault(int(m.group(2)), []).append(m.group(1))
    xml = STEP.sub(lambda m: f'<p:cNvPr id="{m.group(1)}" name="{escape(m.group(3))}"', xml)
    missing = [s for k in steps for s in steps[k] if s not in kinds]
    if missing:
        raise SystemExit(f'element turi aniqlanmadi: {missing}')
    extra = TRANSITION + (timing(steps, kinds) if steps else '')
    if '</p:clrMapOvr>' in xml:
        xml = xml.replace('</p:clrMapOvr>', '</p:clrMapOvr>' + extra, 1)
    else:
        xml = xml.replace('</p:cSld>', '</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>' + extra, 1)
    return xml, sum(len(v) for v in steps.values()), len(steps)


def hide_base_series(xml):
    def fix(m):
        ser = m.group(0)
        if '<c:v>_asos</c:v>' in ser:
            return re.sub(r'<c:spPr>.*?</c:spPr>', '<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>', ser, count=1, flags=re.S)
        # nomi "— " bilan boshlangan tarqoq (scatter) qator: nuqtasiz, uzluksiz chiziq
        if re.search(r'<c:v>\u2014 [^<]*</c:v>', ser):
            col = re.search(r'<a:srgbClr val="([0-9A-Fa-f]{6})"', ser)
            col = col.group(1) if col else '0A84C1'
            ser = re.sub(r'<c:spPr>.*?</c:spPr>', f'<c:spPr><a:ln w="31750" cap="rnd"><a:solidFill><a:srgbClr val="{col}"/></a:solidFill><a:round/></a:ln></c:spPr>', ser, count=1, flags=re.S)
            return re.sub(r'<c:marker>.*?</c:marker>', '<c:marker><c:symbol val="none"/></c:marker>', ser, count=1, flags=re.S)
        return ser
    return re.sub(r'<c:ser>.*?</c:ser>', fix, xml, flags=re.S)


def main(path):
    zin = zipfile.ZipFile(path)
    items = [(i, zin.read(i.filename)) for i in zin.infolist()]
    zin.close()
    report = []
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as zout:
        for info, data in items:
            name = info.filename
            if re.match(r'ppt/slides/slide\d+\.xml$', name):
                xml, nel, nst = process_slide(data.decode('utf-8'))
                data = xml.encode('utf-8')
                report.append((int(re.search(r'(\d+)', name.split('/')[-1]).group(1)), nst, nel))
            elif re.match(r'ppt/charts/chart\d+\.xml$', name):
                data = hide_base_series(data.decode('utf-8')).encode('utf-8')
            zout.writestr(info, data)
    for n, nst, nel in sorted(report):
        print(f'{n:2d}-slayd: {nst} bosish, {nel} element')


if __name__ == '__main__':
    main(sys.argv[1])
