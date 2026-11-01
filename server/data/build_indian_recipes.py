"""Convert the Anuvaad INDB workbook to the small runtime JSON used by MedVault.

Uses only Python's standard library so the app does not need an XLSX dependency.
Run from the repository root with:
    python server/data/build_indian_recipes.py
"""

from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[2]
WORKBOOK = ROOT / "server" / "data" / "Anuvaad_INDB_2024.11.xlsx"
OUTPUT = ROOT / "server" / "data" / "indian-recipes.json"
MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"


def column_index(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference).group(0)
    value = 0
    for letter in letters:
        value = value * 26 + ord(letter) - ord("A") + 1
    return value - 1


def shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    return [
        "".join(node.text or "" for node in item.findall(f".//{{{MAIN_NS}}}t"))
        for item in root.findall(f"{{{MAIN_NS}}}si")
    ]


def cell_value(cell: ET.Element, strings: list[str]):
    kind = cell.attrib.get("t", "")
    if kind == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(f".//{{{MAIN_NS}}}t"))
    value = cell.find(f"{{{MAIN_NS}}}v")
    if value is None or value.text is None:
        return None
    if kind == "s":
        return strings[int(value.text)]
    if kind == "b":
        return value.text == "1"
    try:
        return float(value.text)
    except ValueError:
        return value.text


def sheet_path(archive: zipfile.ZipFile) -> str:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {
        relation.attrib["Id"]: relation.attrib["Target"]
        for relation in relationships.findall(f"{{{PACKAGE_REL_NS}}}Relationship")
    }
    first_sheet = workbook.find(f"{{{MAIN_NS}}}sheets/{{{MAIN_NS}}}sheet")
    if first_sheet is None:
        raise ValueError("The workbook has no worksheets.")
    target = targets[first_sheet.attrib[f"{{{REL_NS}}}id"]].lstrip("/")
    return target if target.startswith("xl/") else f"xl/{target}"


def rows_from_sheet(root: ET.Element, strings: list[str]):
    for row in root.findall(f".//{{{MAIN_NS}}}sheetData/{{{MAIN_NS}}}row"):
        values = {}
        for cell in row.findall(f"{{{MAIN_NS}}}c"):
            values[column_index(cell.attrib["r"])] = cell_value(cell, strings)
        if values:
            yield [values.get(index) for index in range(max(values) + 1)]


def clean_number(value):
    if value is None or value == "":
        return None
    number = float(value)
    return round(number, 3)


def main() -> None:
    if not WORKBOOK.exists():
        raise SystemExit(f"Workbook not found: {WORKBOOK}")
    with zipfile.ZipFile(WORKBOOK) as archive:
        strings = shared_strings(archive)
        sheet = ET.fromstring(archive.read(sheet_path(archive)))
        rows = iter(rows_from_sheet(sheet, strings))
        headers = next(rows)
        records = []
        for row in rows:
            data = {header: row[index] if index < len(row) else None for index, header in enumerate(headers)}
            code = str(data.get("food_code") or "").strip()
            name = str(data.get("food_name") or "").strip()
            values = {
                "calories": clean_number(data.get("energy_kcal")),
                "proteinG": clean_number(data.get("protein_g")),
                "carbsG": clean_number(data.get("carb_g")),
                "fatG": clean_number(data.get("fat_g")),
                "fiberG": clean_number(data.get("fibre_g")),
            }
            if not code or not name or any(values[key] is None for key in ("calories", "proteinG", "carbsG", "fatG")):
                continue
            if not 0 <= values["calories"] <= 900 or any(not 0 <= values[key] <= 100 for key in ("proteinG", "carbsG", "fatG")):
                continue
            records.append({
                "sourceId": f"indb:{code}",
                "name": name,
                "primarySource": str(data.get("primarysource") or "INDB"),
                "dataType": "Indian Nutrient Databank (INDB)",
                "per100g": values,
            })

    OUTPUT.write_text(
        json.dumps({"source": "Anuvaad Indian Nutrient Databank", "foods": records}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(records)} INDB recipes to {OUTPUT}")


if __name__ == "__main__":
    main()
