from datetime import datetime
from typing import List, Optional
import numpy as np
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LinearRegression
from starlette.concurrency import run_in_threadpool
from food_vision import FoodVisionError, analyze_food_image, analyze_recipe_details

app = FastAPI(title="MedVault Health Analytics", version="2.0.0")

class Point(BaseModel):
    date: datetime
    value: float
    referenceMin: Optional[float] = None
    referenceMax: Optional[float] = None
    status: Optional[str] = None

class Series(BaseModel):
    name: str
    unit: Optional[str] = None
    points: List[Point]

class SeriesPayload(BaseModel):
    series: List[Series]

class RecipePayload(BaseModel):
    name: str
    description: str
    cookingMethod: str = ""

@app.get("/health")
def health():
    return {
        "ok": True,
        "models": ["Gemini/OpenAI structured food vision and recipe ingredient interpretation", "linear-regression", "isolation-forest"],
        "foodAnalysis": "vision provider key is supplied by the authenticated API server per request",
        "scope": "food recognition and portion ranges; recipe nutrition is grounded by the API server in local INDB and USDA FoodData Central ingredient records",
    }

def analyze(payload: SeriesPayload):
    results = []
    for series in payload.series:
        points = sorted(series.points, key=lambda p: p.date)
        if not points:
            continue
        base = points[0].date
        x = np.array([[(p.date - base).total_seconds() / 86400] for p in points], dtype=float)
        y = np.array([p.value for p in points], dtype=float)

        slope = 0.0
        forecast_30d = float(y[-1])
        if len(points) >= 2 and np.ptp(x) > 0:
            model = LinearRegression().fit(x, y)
            slope = float(model.coef_[0])
            forecast_30d = float(model.predict([[float(x[-1][0] + 30)]])[0])

        anomaly_indexes = []
        if len(points) >= 5 and len(set(y.tolist())) > 2:
            features = np.column_stack([x.flatten(), y])
            labels = IsolationForest(contamination="auto", random_state=42).fit_predict(features)
            anomaly_indexes = [i for i, label in enumerate(labels) if label == -1]

        latest = points[-1]
        reference_flag = "within_range"
        if latest.referenceMin is not None and latest.value < latest.referenceMin:
            reference_flag = "low"
        if latest.referenceMax is not None and latest.value > latest.referenceMax:
            reference_flag = "high"
        if latest.referenceMin is None and latest.referenceMax is None:
            reference_flag = latest.status or "unknown"

        results.append({
            "name": series.name,
            "unit": series.unit,
            "slopePerDay": round(slope, 6),
            "forecast30Days": round(forecast_30d, 3),
            "referenceFlag": reference_flag,
            "anomalyIndexes": anomaly_indexes,
            "modelNote": "Exploratory longitudinal signal only; not a diagnostic model."
        })
    return {"results": results, "disclaimer": "Do not use automated output as a medical diagnosis or to change treatment without a qualified clinician."}

@app.post("/analyze-series")
def analyze_series(payload: SeriesPayload):
    return analyze(payload)

# Backward-compatible endpoint used by the original lab page.
@app.post("/analyze-labs")
def analyze_labs(payload: SeriesPayload):
    return analyze(payload)

@app.post("/analyze-food")
async def analyze_food(
    image: UploadFile = File(...),
    description: str = Form(default=""),
    provider: str = Header(default="gemini", alias="x-food-vision-provider"),
    api_key: str = Header(default="", alias="x-food-vision-api-key"),
    model: str = Header(default="gemini-3.5-flash-lite", alias="x-food-vision-model"),
):
    if image.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="Upload a JPEG, PNG, or WebP food photo.")

    image_bytes = await image.read(10 * 1024 * 1024 + 1)
    await image.close()
    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Food photos must be 10 MB or smaller.")
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Choose a food photo to estimate.")

    description = description.strip()[:400]

    try:
        estimate = await run_in_threadpool(
            analyze_food_image,
            image_bytes,
            description,
            api_key,
            provider.strip().lower() or "gemini",
            model.strip()[:100] or ("gemini-3.5-flash-lite" if provider.strip().lower() != "openai" else "gpt-4o-mini"),
        )
        if not estimate["isFood"] or not estimate["foods"]:
            raise HTTPException(status_code=422, detail="This photo does not appear to contain an identifiable meal. Try a closer food photo.")
        return {
            **estimate,
            "modelVersion": model.strip()[:100] or ("gemini-3.5-flash-lite" if provider.strip().lower() != "openai" else "gpt-4o-mini"),
            "userDescription": description,
        }
    except FoodVisionError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error

@app.post("/analyze-recipe")
async def analyze_recipe(
    payload: RecipePayload,
    provider: str = Header(default="gemini", alias="x-food-vision-provider"),
    api_key: str = Header(default="", alias="x-food-vision-api-key"),
    model: str = Header(default="gemini-3.5-flash-lite", alias="x-food-vision-model"),
):
    try:
        return await run_in_threadpool(
            analyze_recipe_details,
            payload.name,
            payload.description,
            payload.cookingMethod,
            api_key,
            provider.strip().lower() or "gemini",
            model.strip()[:100] or "gemini-3.5-flash-lite",
        )
    except FoodVisionError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error
