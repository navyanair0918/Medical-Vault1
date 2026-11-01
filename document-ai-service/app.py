import io
import re
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from PIL import Image
from pypdf import PdfReader
import pytesseract
from pdf2image import convert_from_bytes

app = FastAPI(title="MedVault Document AI", version="1.0.0")

SECTION_NAMES = ["impression", "findings", "conclusion", "diagnosis", "summary", "opinion"]


def clean_text(text: str) -> str:
    text = text.replace("\x00", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def pdf_text(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    return clean_text("\n".join((page.extract_text() or "") for page in reader.pages))


def image_text(data: bytes) -> str:
    image = Image.open(io.BytesIO(data)).convert("RGB")
    return clean_text(pytesseract.image_to_string(image))


def extract_sections(text: str):
    lower = text.lower()
    positions = []
    for name in SECTION_NAMES:
        for match in re.finditer(rf"(?im)^\s*{re.escape(name)}\s*[:\-]?\s*", text):
            positions.append((match.start(), match.end(), name))
    positions.sort()
    sections = {}
    for i, (start, content_start, name) in enumerate(positions):
        end = positions[i + 1][0] if i + 1 < len(positions) else len(text)
        body = text[content_start:end].strip()
        if body:
            sections[name] = body[:4000]
    if not sections and lower:
        sections["summary"] = text[:2000]
    return sections


def extract_metrics(text: str):
    metrics = []
    seen = set()
    # Conservative line parser: label + numeric value + optional unit + optional reference range.
    pattern = re.compile(
        r"^\s*([A-Za-z][A-Za-z0-9 /()_%+\-]{2,55}?)\s*[:\-]?\s+"
        r"(-?\d+(?:\.\d+)?)\s*"
        r"([A-Za-z%/µμ0-9.\-^]+)?"
        r"(?:\s+(?:ref(?:erence)?\s*)?[:\-]?\s*\(?\s*(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)\s*\)?)?\s*$",
        re.IGNORECASE,
    )
    for raw in text.splitlines():
        line = raw.strip()
        if not line or len(line) > 120:
            continue
        match = pattern.match(line)
        if not match:
            continue
        name, value, unit, ref_min, ref_max = match.groups()
        name = re.sub(r"\s+", " ", name).strip(" :-")
        if len(name) < 3 or name.lower() in {"date", "age", "page", "phone", "mobile"}:
            continue
        key = (name.lower(), unit or "")
        if key in seen:
            continue
        seen.add(key)
        metric = {"name": name, "value": float(value), "unit": unit or None}
        if ref_min is not None:
            metric["referenceMin"] = float(ref_min)
        if ref_max is not None:
            metric["referenceMax"] = float(ref_max)
        metrics.append(metric)
        if len(metrics) >= 100:
            break
    return metrics


def guess_date(text: str) -> Optional[str]:
    patterns = [
        r"\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b",
        r"\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b",
    ]
    for index, pattern in enumerate(patterns):
        m = re.search(pattern, text)
        if not m:
            continue
        try:
            if index == 0:
                y, mo, d = map(int, m.groups())
            else:
                d, mo, y = map(int, m.groups())
            return datetime(y, mo, d).date().isoformat()
        except ValueError:
            pass
    return None


@app.get("/health")
def health():
    return {"ok": True, "extractors": ["digital-pdf-text", "image-ocr", "numeric-line-parser", "section-parser"]}


@app.post("/extract-report")
async def extract_report(file: UploadFile = File(...), reportType: str = Form("other")):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    mime = file.content_type or ""
    method = "unknown"
    try:
        if mime == "application/pdf" or file.filename.lower().endswith(".pdf"):
            text = pdf_text(data)
            method = "pypdf-text"
            if len(text) < 40:
                pages = convert_from_bytes(data, dpi=180, first_page=1, last_page=10)
                text = clean_text("\n".join(pytesseract.image_to_string(page.convert("RGB")) for page in pages))
                method = "pdf-page-tesseract-ocr"
        elif mime.startswith("image/") or file.filename.lower().endswith((".png", ".jpg", ".jpeg", ".tif", ".tiff")):
            text = image_text(data)
            method = "tesseract-ocr"
        elif mime.startswith("text/"):
            text = clean_text(data.decode("utf-8", errors="ignore"))
            method = "plain-text"
        else:
            raise HTTPException(status_code=415, detail="Local extractor supports digital PDFs, images and text. Other formats can use a production document-AI adapter.")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not extract document text: {exc}")

    sections = extract_sections(text)
    metrics = extract_metrics(text)
    impression = sections.get("impression") or sections.get("conclusion") or sections.get("opinion")
    findings_text = sections.get("findings") or sections.get("diagnosis")
    findings = [{"label": "Extracted findings", "value": findings_text[:3000], "severity": "info"}] if findings_text else []
    summary = sections.get("summary") or (text[:1500] if text else "")

    # OCR/document parsing confidence is intentionally conservative; clinical verification is expected.
    confidence = 0.78 if method == "pypdf-text" else 0.62 if "tesseract" in method else 0.7
    return {
        "title": file.filename,
        "reportType": reportType,
        "reportDate": guess_date(text),
        "metrics": metrics,
        "findings": findings,
        "impression": impression,
        "summary": summary,
        "method": method,
        "confidence": confidence,
        "modelVersion": "medvault-local-extractor-1.0",
        "disclaimer": "Text and measurements were extracted automatically and must be verified against the source document. No diagnosis is generated."
    }
