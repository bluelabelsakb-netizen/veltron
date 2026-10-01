#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Excel'deki puan/maas hesaplama kurallarini okur. Cikti UTF-8 dosyaya yazilir."""
import os
import openpyxl

ARSIV = r"C:\Users\pc-n\Documents\Veltron-Excel-arsiv"
XLSX = os.path.join(ARSIV, "Veltron_Is_Takip_Sistemi.xlsx")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "puan-maas-kurallari.txt")

wb = openpyxl.load_workbook(XLSX, data_only=False)
lines = []


def w(text=""):
    lines.append(text)


def dump(sheet, max_row=None, cols=14):
    if sheet not in wb.sheetnames:
        w(f"--- {sheet}: YOK ---")
        w()
        return
    ws = wb[sheet]
    end = max_row or ws.max_row
    w(f"--- {sheet}  ({ws.max_row} satir) ---")
    for r in range(1, end + 1):
        vals = []
        for c in range(1, cols + 1):
            v = ws.cell(r, c).value
            if v is None:
                continue
            s = str(v).replace("\n", " ")
            if len(s) > 70:
                s = s[:70] + "..."
            vals.append(f"{c}:{s}")
        if vals:
            w(f"  r{r}: " + " | ".join(vals))
    w()


w("=" * 72)
w("AYARLAR - butun hesaplama kurallari")
w("=" * 72)
dump("Ayarlar", cols=6)

w("=" * 72)
w("PUANLAR - periyodik puanlama (ilk 12 satir)")
w("=" * 72)
dump("Puanlar", max_row=14, cols=11)

w("=" * 72)
w("MAAS - bordro hesabi (ilk 10 satir)")
w("=" * 72)
dump("Maaş", max_row=10, cols=13)

w("=" * 72)
w("LISTELER - sabit degerler")
w("=" * 72)
dump("Listeler", cols=12)

w("=" * 72)
w("GENELPERFORMANS - rapor")
w("=" * 72)
dump("GenelPerformans", max_row=30, cols=10)

with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(f"Curtiler: {OUT}")
print(f"Satir sayisi: {len(lines)}")
