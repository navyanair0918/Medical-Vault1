"""Vision-only food recognition and portion estimation for meal photos."""

from __future__ import annotations

import base64
from io import BytesIO
import json
import logging
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from PIL import Image, ImageOps, UnidentifiedImageError


logger = logging.getLogger(__name__)
OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"
GEMINI_GENERATE_CONTENT_URL = "https://generativelanguage.googleapis.com/v1beta/models"
MAX_IMAGE_PIXELS = 24_000_000
MAX_IMAGE_EDGE = 1536
MAX_FOODS = 12
FOOD_CATEGORIES = [
    "staple", "protein or legumes", "vegetable", "fruit", "dairy",
    "condiment or side", "dessert", "beverage", "prepared dish",
]

_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "is_food": {"type": "boolean"},
        "items": {
            "type": "array",
            "maxItems": MAX_FOODS,
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "category": {"type": "string", "enum": FOOD_CATEGORIES},
                    "estimated_grams": {"type": "integer", "minimum": 1, "maximum": 5000},
                    "grams_range": {
                        "type": "object",
                        "properties": {
                            "min_grams": {"type": "integer", "minimum": 1, "maximum": 5000},
                            "max_grams": {"type": "integer", "minimum": 1, "maximum": 5000},
                        },
                        "required": ["min_grams", "max_grams"],
                        "additionalProperties": False,
                    },
                    "cooking_method": {"type": "string"},
                    "portion_hint": {"type": "string"},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "needs_clarification": {"type": "boolean"},
                    "clarification_question": {"type": "string"},
                },
                "required": [
                    "name", "category", "estimated_grams", "grams_range",
                    "cooking_method", "portion_hint", "confidence",
                    "needs_clarification", "clarification_question",
                ],
                "additionalProperties": False,
            },
        },
        "notes": {"type": "string"},
        "needs_clarification": {"type": "boolean"},
    },
    "required": ["is_food", "items", "notes", "needs_clarification"],
    "additionalProperties": False,
}

_SYSTEM_PROMPT = """You identify visible foods in meal photos and estimate visible portions. Return only the requested structured data.

Rules:
- Identify each visually distinct food separately. When the image or user's description supports it, prefer familiar Indian names and regional spellings (for example roti/chapati, dosa, idli, poha, dal, sambar, chutney, sabzi, paneer, biryani, khichdi, raita, and kheer) over a generic label. Do not call a mixed plate one dish, and do not invent hidden ingredients.
- Identify visible cashews, pistachios, and other nuts separately when their shapes are distinguishable; do not combine them as mixed nuts if the photo shows separate types. Estimate a small garnish differently from a handful by using visible count and area.
- Use the user's short description only as context. If it conflicts with the image, say so in notes and rely on visible evidence.
- Estimate grams for each separate food from its visible area, height/depth cues, count, plate or bowl scale, and common Indian serving sizes. For countable items such as roti, idli, dosa, puri, or pakora, estimate the count and typical cooked size; for dal, curry, rice, or chutney, use visible bowl/katori volume only when the container gives a usable scale. Do not assume a standard plate or katori size when it is not visible. A single photo cannot measure depth or hidden food, so return a realistic low/high gram range around the best estimate and widen it when scale, depth, oil, or contents are unclear.
- Do not estimate or return calories, macros, or nutrient values. A separate nutrition database supplies those.
- For each item whose visible identity or recipe type is ambiguous enough to change its nutrition match, set needs_clarification=true and ask one short, specific question about only that item. For an unclear creamy dip, ask which sauce it is. Ask whether white sauce is thick or thin only when the sauce itself is the food item; for a composite dish such as white-sauce pasta, ask about the whole recipe's sauce base or main ingredients instead. Do not ask about clear foods, do not ask generic questions, and do not claim unseen ingredients as facts. If no question is needed, set needs_clarification=false and clarification_question to an empty string.
- If the image is not food, return is_food=false and an empty items array. Do not force a food label.
- Use category prepared dish when uncertain. Keep cooking_method and portion_hint short. Confidence describes visual identification only, not calorie accuracy.
- Do not exceed 12 distinct items. Do not count the same food twice."""


class FoodVisionError(Exception):
    def __init__(self, status_code: int, detail: str, retryable: bool = False):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.retryable = retryable


def _trim_dark_borders(image: Image.Image) -> Image.Image:
    sample = image.copy()
    sample.thumbnail((320, 320), Image.Resampling.LANCZOS)
    pixels = sample.load()
    width, height = sample.size

    def dark_fraction(axis: str, index: int) -> float:
        length = width if axis == "row" else height
        dark = 0
        for offset in range(length):
            pixel = pixels[offset, index] if axis == "row" else pixels[index, offset]
            if max(pixel) <= 28:
                dark += 1
        return dark / max(length, 1)

    top, bottom = 0, height
    while top < bottom and dark_fraction("row", top) >= 0.95:
        top += 1
    while bottom > top and dark_fraction("row", bottom - 1) >= 0.95:
        bottom -= 1
    left, right = 0, width
    while left < right and dark_fraction("column", left) >= 0.95:
        left += 1
    while right > left and dark_fraction("column", right - 1) >= 0.95:
        right -= 1

    removed = (width * height - (right - left) * (bottom - top)) / max(width * height, 1)
    if removed < 0.08 or (right - left) < 64 or (bottom - top) < 64:
        return image

    scale_x = image.width / width
    scale_y = image.height / height
    crop = (
        round(left * scale_x), round(top * scale_y),
        round(right * scale_x), round(bottom * scale_y),
    )
    return image.crop(crop)


def _prepare_image(image_bytes: bytes) -> bytes:
    try:
        with Image.open(BytesIO(image_bytes)) as source:
            if source.format not in {"JPEG", "PNG", "WEBP"}:
                raise FoodVisionError(415, "Upload a JPEG, PNG, or WebP food photo.")
            if source.width * source.height > MAX_IMAGE_PIXELS:
                raise FoodVisionError(413, "The image dimensions are too large. Choose a smaller photo.")
            image = ImageOps.exif_transpose(source).convert("RGB")
    except FoodVisionError:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise FoodVisionError(400, "The uploaded file is not a valid food photo.") from error

    image = _trim_dark_borders(image)
    image.thumbnail((MAX_IMAGE_EDGE, MAX_IMAGE_EDGE), Image.Resampling.LANCZOS)
    output = BytesIO()
    # Re-encoding strips EXIF and other embedded metadata before the provider sees it.
    image.save(output, format="JPEG", quality=86, optimize=True)
    return output.getvalue()


def _provider_error(error: HTTPError, provider: str) -> FoodVisionError:
    try:
        payload = json.loads(error.read().decode("utf-8", errors="replace"))
    except (ValueError, OSError):
        payload = {}
    provider_error = payload.get("error", {}) if isinstance(payload, dict) else {}
    code = str(provider_error.get("code", provider_error.get("status", ""))).lower()
    message = str(provider_error.get("message", "")).lower()
    key_name = "GEMINI_API_KEY" if provider == "gemini" else "OPENAI_API_KEY"
    provider_name = "Gemini" if provider == "gemini" else "OpenAI"
    logger.warning("%s API returned HTTP %s (provider_code=%s)", provider_name, error.code, code[:80] or "unavailable")
    if error.code in {401, 403} or "api key not valid" in message or "api_key_invalid" in code:
        return FoodVisionError(503, f"The {provider_name} API key was rejected. Check {key_name} in server/.env.")
    if error.code == 429 and any(token in f"{code} {message}" for token in ("quota", "billing", "insufficient_quota", "resource_exhausted")):
        if provider == "gemini":
            return FoodVisionError(429, "The Gemini API quota is exhausted or rate limited. Check Google AI Studio usage and model limits.")
        return FoodVisionError(429, "The OpenAI project has no available API quota. Check its billing and usage limits.")
    if error.code == 429:
        return FoodVisionError(429, "The vision API rate limit was reached. Wait briefly, then try again.", retryable=True)
    if error.code in {400, 404}:
        model_env = "GEMINI_FOOD_MODEL" if provider == "gemini" else "OPENAI_FOOD_MODEL"
        return FoodVisionError(503, f"The configured vision model could not process this request. Check {model_env}.")
    if 500 <= error.code < 600:
        return FoodVisionError(503, f"{provider_name} returned a temporary server error (HTTP {error.code}). Retry the photo analysis.", retryable=True)
    return FoodVisionError(503, f"{provider_name} could not process this request (HTTP {error.code}). Try again later.")


def _request_openai_model(image_jpeg: bytes, description: str, api_key: str, model: str, repair_message: str = "") -> str:
    image_data = base64.b64encode(image_jpeg).decode("ascii")
    user_text = "Analyze the meal photo."
    if description:
        user_text += f"\nUser description (a hint, not ground truth): {description}"
    if repair_message:
        user_text += f"\nCorrect the previous response so it follows the schema and these validation rules: {repair_message}"

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": [
                {"type": "text", "text": user_text},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_data}", "detail": "high"}},
            ]},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "food_photo_analysis", "strict": True, "schema": _RESPONSE_SCHEMA},
        },
        "temperature": 0,
        "max_tokens": 2200,
    }
    request = Request(
        OPENAI_CHAT_COMPLETIONS_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=75) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        raise _provider_error(error, "openai") from error
    except ValueError as error:
        raise FoodVisionError(502, "The vision provider returned an invalid response. Please retry.", retryable=True) from error
    except (TimeoutError, URLError, OSError) as error:
        raise FoodVisionError(503, "Could not reach the vision provider. Check the server connection and try again.", retryable=True) from error

    try:
        choice = result["choices"][0]
        message = choice["message"]
        if message.get("refusal"):
            raise FoodVisionError(422, "The vision provider could not estimate this image. Try a clear food photo.")
        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            raise ValueError("The provider returned no structured result.")
        return content
    except FoodVisionError:
        raise
    except (KeyError, IndexError, TypeError, ValueError) as error:
        raise FoodVisionError(502, "The vision provider returned an incomplete result. Please retry.") from error


def _request_gemini_model(image_jpeg: bytes, description: str, api_key: str, model: str, repair_message: str = "") -> str:
    image_data = base64.b64encode(image_jpeg).decode("ascii")
    user_text = "Analyze the meal photo."
    if description:
        user_text += f"\nUser description (a hint, not ground truth): {description}"
    if repair_message:
        user_text += f"\nCorrect the previous response so it follows the schema and these validation rules: {repair_message}"

    safe_model = quote(model, safe="-._")
    payload = {
        "systemInstruction": {"parts": [{"text": _SYSTEM_PROMPT}]},
        "contents": [{
            "role": "user",
            "parts": [
                {"text": user_text},
                {"inlineData": {"mimeType": "image/jpeg", "data": image_data}},
            ],
        }],
        "generationConfig": {
            "maxOutputTokens": 2200,
            "thinkingConfig": {"thinkingLevel": "low"},
            "responseFormat": {
                "text": {
                    "mimeType": "APPLICATION_JSON",
                    "schema": _RESPONSE_SCHEMA,
                }
            },
        },
    }
    request = Request(
        f"{GEMINI_GENERATE_CONTENT_URL}/{safe_model}:generateContent",
        data=json.dumps(payload).encode("utf-8"),
        headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=120) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        raise _provider_error(error, "gemini") from error
    except ValueError as error:
        raise FoodVisionError(502, "The Gemini API returned an invalid response. Please retry.", retryable=True) from error
    except (TimeoutError, URLError, OSError) as error:
        reason = getattr(error, "reason", error)
        diagnostic = re.sub(r"(https?://)[^/@\s]+@", r"\1[redacted]@", str(reason))[:240]
        logger.warning("Gemini network request failed (%s): %s", type(reason).__name__, diagnostic)
        raise FoodVisionError(503, "Could not reach Gemini. Check the server connection and try again.", retryable=True) from error

    try:
        if result.get("promptFeedback", {}).get("blockReason"):
            raise FoodVisionError(422, "Gemini could not analyze this image. Try a clear food photo.")
        candidate = result["candidates"][0]
        if candidate.get("finishReason") in {"SAFETY", "RECITATION", "BLOCKLIST"}:
            raise FoodVisionError(422, "Gemini could not analyze this image. Try a clear food photo.")
        parts = candidate["content"]["parts"]
        content = "".join(part["text"] for part in parts if isinstance(part, dict) and isinstance(part.get("text"), str))
        if not content.strip():
            raise ValueError("Gemini returned no structured result.")
        return content
    except FoodVisionError:
        raise
    except (KeyError, IndexError, TypeError, ValueError) as error:
        raise FoodVisionError(502, "Gemini returned an incomplete result. Please retry.") from error


def _request_vision_model(image_jpeg: bytes, description: str, api_key: str, provider: str, model: str, repair_message: str = "") -> str:
    for attempt in range(2):
        try:
            if provider == "gemini":
                return _request_gemini_model(image_jpeg, description, api_key, model, repair_message)
            if provider == "openai":
                return _request_openai_model(image_jpeg, description, api_key, model, repair_message)
            raise FoodVisionError(400, "FOOD_VISION_PROVIDER must be set to gemini or openai.")
        except FoodVisionError as error:
            if attempt == 1 or not error.retryable:
                raise
            logger.warning("Retrying transient %s vision request once", provider)
            time.sleep(0.8)


def _parse_and_validate(content: str) -> dict:
    try:
        result = json.loads(content)
    except (json.JSONDecodeError, TypeError) as error:
        raise ValueError("The result was not valid JSON.") from error
    if not isinstance(result, dict) or not isinstance(result.get("is_food"), bool):
        raise ValueError("The result is missing its food-image flag.")
    items = result.get("items")
    if not isinstance(items, list) or len(items) > MAX_FOODS:
        raise ValueError("The result must contain no more than 12 food items.")
    if not isinstance(result.get("notes"), str) or not isinstance(result.get("needs_clarification"), bool):
        raise ValueError("The result is missing notes or clarification status.")
    if not result["is_food"] and items:
        raise ValueError("A non-food image cannot include detected foods.")

    foods = []
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("A food item is malformed.")
        name = re.sub(r"\s+", " ", str(item.get("name", ""))).strip()[:100]
        category = item.get("category")
        estimated = item.get("estimated_grams")
        gram_range = item.get("grams_range")
        confidence = item.get("confidence")
        needs_clarification = item.get("needs_clarification")
        clarification_question = item.get("clarification_question")
        if not name or category not in FOOD_CATEGORIES:
            raise ValueError("A food item is missing its name or category.")
        if isinstance(estimated, bool) or not isinstance(estimated, int) or not 1 <= estimated <= 5000:
            raise ValueError("A food item has an invalid portion estimate.")
        if not isinstance(gram_range, dict):
            raise ValueError("A food item is missing its portion range.")
        minimum = gram_range.get("min_grams")
        maximum = gram_range.get("max_grams")
        if any(isinstance(value, bool) or not isinstance(value, int) for value in (minimum, maximum)):
            raise ValueError("A food item has an invalid portion range.")
        if not 1 <= minimum <= estimated <= maximum <= 5000:
            raise ValueError("A food item's estimate must fit inside its portion range.")
        if isinstance(confidence, bool) or not isinstance(confidence, (int, float)) or not 0 <= confidence <= 1:
            raise ValueError("A food item has an invalid confidence score.")
        if not isinstance(needs_clarification, bool) or not isinstance(clarification_question, str):
            raise ValueError("A food item is missing its clarification status or question.")
        clarification_question = re.sub(r"\s+", " ", clarification_question).strip()[:240]
        if needs_clarification and not clarification_question:
            raise ValueError("An uncertain food item needs a specific clarification question.")
        if not needs_clarification:
            clarification_question = ""

        foods.append({
            "name": name,
            "category": category,
            "estimatedGrams": estimated,
            "gramsRange": {"min": minimum, "max": maximum},
            "cookingMethod": re.sub(r"\s+", " ", str(item.get("cooking_method", ""))).strip()[:120],
            "portion": re.sub(r"\s+", " ", str(item.get("portion_hint", ""))).strip()[:160],
            "confidenceScore": round(float(confidence), 4),
            "needsClarification": needs_clarification,
            "clarificationQuestion": clarification_question,
        })

    return {
        "isFood": result["is_food"],
        "foods": foods,
        "notes": re.sub(r"\s+", " ", result["notes"]).strip()[:500],
        "needsClarification": any(food["needsClarification"] for food in foods),
    }


def analyze_food_image(image_bytes: bytes, description: str, api_key: str, provider: str = "gemini", model: str = "gemini-3.5-flash-lite") -> dict:
    if not api_key.strip():
        key_name = "GEMINI_API_KEY" if provider == "gemini" else "OPENAI_API_KEY"
        raise FoodVisionError(503, f"Photo analysis is not configured. Add {key_name} to server/.env and restart the server.")
    if provider not in {"gemini", "openai"}:
        raise FoodVisionError(400, "FOOD_VISION_PROVIDER must be set to gemini or openai.")
    image_jpeg = _prepare_image(image_bytes)
    content = _request_vision_model(image_jpeg, description, api_key.strip(), provider, model)
    try:
        return _parse_and_validate(content)
    except ValueError as first_error:
        # Strict structured output should make this rare; repair malformed output once.
        content = _request_vision_model(image_jpeg, description, api_key.strip(), provider, model, str(first_error))
        try:
            return _parse_and_validate(content)
        except ValueError as second_error:
            raise FoodVisionError(502, "The vision provider returned an invalid food estimate. Please try again.") from second_error


_RECIPE_SCHEMA = {
    "type": "object",
    "properties": {
        "ingredients": {
            "type": "array",
            "maxItems": 10,
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "grams_per_100g": {"type": "number", "minimum": 0, "maximum": 100},
                    "preparation": {"type": "string"},
                },
                "required": ["name", "grams_per_100g", "preparation"],
                "additionalProperties": False,
            },
        },
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "needs_more_info": {"type": "boolean"},
        "question": {"type": "string"},
        "notes": {"type": "string"},
    },
    "required": ["ingredients", "confidence", "needs_more_info", "question", "notes"],
    "additionalProperties": False,
}

_RECIPE_SYSTEM_PROMPT = """Interpret a user's short answer about an Indian or other prepared food into a practical ingredient breakdown. Return only the requested JSON.

Rules:
- Treat the food name, answer, and cooking method together. Correct obvious spelling mistakes and recognize common Indian ingredient names and transliterations: nachni flour (including the likely typo pachni) means finger millet/ragi; rajgira means amaranth; atta means whole wheat flour; for an Indian roti/paratha, unspecified wheat flour normally means whole wheat flour/atta; moong/mung/green gram are aliases; sprouts means sprouted beans when context supports it.
- Preserve ingredients the user explicitly named. Do not replace them with a similar recipe title.
- Estimate each ingredient's grams in 100 g of the FINISHED edible food. Include retained water, cooking fat/oil/ghee, and meaningful recipe ingredients so the component weights add up to about 100 g. Do not return calories, macros, or nutrient values.
- Use ordinary recipe proportions as a best estimate when the user has identified the ingredients but not their exact proportions. For a pan-fried paratha, include a modest typical amount of absorbed cooking fat; for plainly boiled sprouts, use cooked sprouted beans and no oil. Mention assumptions and lower confidence in notes. Never claim an assumption was supplied by the user.
- This endpoint is called only after the user has already answered a clarification question. For every informative non-empty answer, set needs_more_info=false and provide your best practical estimate; do not ask a second question about recipe ratios, ordinary cooking oil, or minor seasoning. Use typical proportions and state assumptions in notes. Set needs_more_info=true only when the answer explicitly says the user does not know, or gives no usable food, ingredient, or preparation information.
- For truly unclear answers, set needs_more_info=true, return an empty ingredients list, and put the question in question. Ingredient names must be ordinary food names suitable for a nutrition-database search, not recipe titles.
- Keep at most 10 components. Do not invent precise recipe facts. Confidence is confidence in the ingredient breakdown, not calorie accuracy."""


def _request_recipe_gemini(name: str, description: str, cooking_method: str, api_key: str, model: str) -> str:
    prompt = (
        f"Food name: {name}\nUser's answer: {description}\n"
        f"Observed cooking method (if any): {cooking_method or 'not known'}\n"
        "Interpret this answer; normalize likely typos and return the finished-food ingredient breakdown."
    )
    safe_model = quote(model, safe="-._")
    payload = {
        "systemInstruction": {"parts": [{"text": _RECIPE_SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "maxOutputTokens": 700,
            "thinkingConfig": {"thinkingLevel": "low"},
            "responseFormat": {"text": {"mimeType": "APPLICATION_JSON", "schema": _RECIPE_SCHEMA}},
        },
    }
    request = Request(
        f"{GEMINI_GENERATE_CONTENT_URL}/{safe_model}:generateContent",
        data=json.dumps(payload).encode("utf-8"),
        headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=20) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        raise _provider_error(error, "gemini") from error
    except ValueError as error:
        raise FoodVisionError(502, "Gemini returned an invalid recipe interpretation.", retryable=True) from error
    except (TimeoutError, URLError, OSError) as error:
        raise FoodVisionError(503, "Could not reach Gemini to interpret the food details. Retry in a moment.", retryable=True) from error
    try:
        candidate = result["candidates"][0]
        parts = candidate["content"]["parts"]
        content = "".join(part["text"] for part in parts if isinstance(part, dict) and isinstance(part.get("text"), str))
        if not content.strip():
            raise ValueError("Gemini returned no recipe interpretation.")
        return content
    except (KeyError, IndexError, TypeError, ValueError) as error:
        raise FoodVisionError(502, "Gemini returned an incomplete recipe interpretation.", retryable=True) from error


def _request_recipe_openai(name: str, description: str, cooking_method: str, api_key: str, model: str) -> str:
    prompt = (
        f"Food name: {name}\nUser's answer: {description}\n"
        f"Observed cooking method (if any): {cooking_method or 'not known'}\n"
        "Interpret this answer; normalize likely typos and return the finished-food ingredient breakdown."
    )
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": _RECIPE_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "food_recipe_ingredients", "strict": True, "schema": _RECIPE_SCHEMA},
        },
        "temperature": 0,
        "max_tokens": 700,
    }
    request = Request(
        OPENAI_CHAT_COMPLETIONS_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=20) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        raise _provider_error(error, "openai") from error
    except ValueError as error:
        raise FoodVisionError(502, "The vision provider returned an invalid recipe interpretation.", retryable=True) from error
    except (TimeoutError, URLError, OSError) as error:
        raise FoodVisionError(503, "Could not reach the vision provider to interpret the food details.", retryable=True) from error
    try:
        content = result["choices"][0]["message"]["content"]
        if not isinstance(content, str) or not content.strip():
            raise ValueError("The provider returned no recipe interpretation.")
        return content
    except (KeyError, IndexError, TypeError, ValueError) as error:
        raise FoodVisionError(502, "The vision provider returned an incomplete recipe interpretation.", retryable=True) from error


def _fallback_recipe_ingredients(name: str, description: str, cooking_method: str) -> list:
    text = f"{name} {description}".lower()
    known = [
        ("sprouted mung beans", r"\b(moong|mung|green gram)\b.*\b(sprout|sprouted|sprouts)\b|\b(sprout|sprouted|sprouts)\b.*\b(moong|mung|green gram)\b", "cooked"),
        ("pistachios", r"\bpistachios?\b", "nut"),
        ("cashews", r"\bcashews?\b", "nut"),
        ("raisins, dried", r"\b(black|golden|dried)?\s*raisins?\b", "dried-fruit"),
        ("finger millet flour", r"\b(ragi|nachni|pachni|finger millet)\b", "dry"),
        ("amaranth flour", r"\b(rajgira|amaranth)\b", "dry"),
        ("whole wheat flour", r"\b(atta|whole wheat|wheat flour|wheat)\b", "dry"),
        ("chickpea flour", r"\b(besan|chickpea flour|gram flour)\b", "dry"),
        ("corn starch", r"\b(corn starch|cornflour|corn flour)\b", "dry"),
        ("pasta, cooked", r"\b(pasta|penne|macaroni)\b", "cooked"),
        ("white rice, cooked", r"\b(rice|chawal)\b", "cooked"),
        ("milk", r"\bmilk\b", "liquid"),
        ("cheese", r"\bcheese\b", "dairy"),
        ("capsicum", r"\b(capsicum|bell pepper)\b", "vegetable"),
        ("tomatoes, raw", r"\b(tomato|tomatoes|tamatar)\b", "vegetable"),
        ("onions, raw", r"\b(onion|onions|pyaaz)\b", "vegetable"),
        ("garlic, raw", r"\bgarlic\b", "seasoning"),
        ("plain yogurt", r"\b(curd|dahi|yogurt|yoghurt)\b", "dairy"),
        ("paneer", r"\bpaneer\b", "dairy"),
        ("cooking oil", r"\b(oil|tel)\b", "oil"),
        ("ghee", r"\bghee\b", "oil"),
    ]
    components = [{"name": item, "kind": kind} for item, pattern, kind in known if re.search(pattern, text, re.I)]
    if re.search(r"\bcheese\s+slices?\b", text, re.I):
        for component in components:
            if component["name"] == "cheese":
                component["name"] = "processed cheese"
    # Keep only one flour entry per kind/name and avoid interpreting the dish name as a component.
    deduped = []
    seen = set()
    for component in components:
        key = component["name"]
        if key not in seen:
            seen.add(key)
            deduped.append(component)
    if not deduped:
        return []

    dish_is_composite = bool(re.search(r"\b(paratha|parantha|roti|chapati|pasta|macaroni|sauce|dip|curry|sabzi|sabji|pulao|biryani|khichdi)\b", name, re.I))
    flour_items = [component for component in deduped if component["kind"] == "dry"]
    if len(deduped) == 1 and not dish_is_composite:
        deduped[0]["gramsPer100g"] = 100
    elif len(deduped) == 1 and deduped[0]["name"] == "sprouted mung beans" and re.search(r"\b(boil|boiled|plain|steam|steamed|no oil|without oil)\b", f"{cooking_method} {description}", re.I) and not re.search(r"\b(oil|ghee|fried|fry|tadka|masala|curry)\b", description, re.I):
        # A plain serving of boiled sprouts is the food itself, even if the image label
        # calls it a sabzi. Do not dilute its nutrition with assumed sauce or water.
        deduped[0]["gramsPer100g"] = 100
    elif any(component["name"] == "plain yogurt" for component in deduped) and any(component["kind"] == "nut" for component in deduped) and any(component["kind"] == "dried-fruit" for component in deduped):
        nuts = [component for component in deduped if component["kind"] == "nut"]
        nut_share = 8 if len(nuts) > 1 else 12
        for component in deduped:
            component["gramsPer100g"] = {
                "plain yogurt": 68 if len(nuts) > 1 else 72,
                "raisins, dried": 16,
            }.get(component["name"], nut_share if component["kind"] == "nut" else 0)
    elif any(component["name"] == "pasta, cooked" for component in deduped) and re.search(r"\b(sauce|white sauce|creamy)\b", text, re.I):
        shares = {
            "pasta, cooked": 52,
            "corn starch": 3,
            "milk": 20,
            "cheese": 12,
            "processed cheese": 12,
            "capsicum": 9,
            "tomatoes, raw": 9,
            "onions, raw": 5,
            "garlic, raw": 1,
            "cooking oil": 4,
            "ghee": 4,
        }
        for component in deduped:
            component["gramsPer100g"] = shares.get(component["name"], 5)
    elif flour_items and re.search(r"\b(paratha|parantha|roti|chapati)\b", name, re.I):
        dry_share = 58 if len(flour_items) > 1 else 62
        for component in deduped:
            component["gramsPer100g"] = dry_share / len(flour_items) if component["kind"] == "dry" else {
                "oil": 6 if re.search(r"\b(pan fried|fried|roast|ghee|oil)\b", f"{cooking_method} {description}", re.I) else 0,
                "seasoning": 1,
                "vegetable": 8,
                "dairy": 12,
                "liquid": 16,
                "cooked": 0,
            }.get(component["kind"], 0)
    else:
        weights = {"dry": 8, "liquid": 28, "dairy": 18, "vegetable": 12, "seasoning": 1, "oil": 4, "cooked": 35}
        for component in deduped:
            component["gramsPer100g"] = weights.get(component["kind"], 10)

    total = sum(component["gramsPer100g"] for component in deduped)
    if total < 100:
        deduped.append({"name": "retained water", "kind": "liquid", "gramsPer100g": 100 - total})
    elif total > 100:
        scale = 100 / total
        for component in deduped:
            component["gramsPer100g"] *= scale
        largest = max(deduped, key=lambda component: component["gramsPer100g"])
        largest["gramsPer100g"] += 100 - sum(component["gramsPer100g"] for component in deduped)

    return [{
        "name": component["name"],
        "grams_per_100g": component["gramsPer100g"],
        "preparation": component["kind"],
    } for component in deduped if component["gramsPer100g"] > 0]


def _fallback_is_informative(name: str, description: str, ingredients: list) -> bool:
    if not ingredients:
        return False
    answer = description.lower()
    ingredient_patterns = [
        r"\b(ragi|nachni|pachni|finger millet)\b", r"\b(rajgira|amaranth)\b",
        r"\b(atta|whole wheat|wheat flour|wheat)\b", r"\b(besan|chickpea flour|gram flour)\b",
        r"\b(corn starch|cornflour|corn flour)\b", r"\b(pasta|penne|macaroni)\b",
        r"\b(rice|chawal)\b", r"\bmilk\b", r"\bcheese\b",
        r"\b(yogurt|yoghurt|curd|dahi)\b", r"\b(pistachio|pistachios|cashew|cashews)\b", r"\braisins?\b",
        r"\b(capsicum|bell pepper)\b", r"\b(tomato|tomatoes|tamatar)\b",
        r"\b(onion|onions|pyaaz)\b", r"\bgarlic\b",
        r"\bpaneer\b", r"\b(oil|tel)\b", r"\bghee\b",
    ]
    mentioned = sum(1 for pattern in ingredient_patterns if re.search(pattern, answer, re.I))
    plain_sprouts = ingredients[0].get("name") == "sprouted mung beans" and re.search(r"\b(boil|boiled|plain|steam|steamed|no oil|without oil)\b", description, re.I)
    return mentioned >= 2 or bool(plain_sprouts)


def analyze_recipe_details(name: str, description: str, cooking_method: str, api_key: str, provider: str = "gemini", model: str = "gemini-3.5-flash-lite") -> dict:
    clean_name = re.sub(r"\s+", " ", name).strip()[:100]
    clean_description = re.sub(r"\s+", " ", description).strip()[:400]
    clean_method = re.sub(r"\s+", " ", cooking_method).strip()[:120]
    if not clean_name or len(clean_description) < 2:
        raise FoodVisionError(400, "Add the food name and its ingredients or preparation details.")

    # Answers that explicitly name their ingredients should be usable immediately.
    # This deterministic path avoids a second model round trip and still calculates
    # nutrients from the ingredient database in the Node service.
    fallback_ingredients = _fallback_recipe_ingredients(clean_name, clean_description, clean_method)
    if _fallback_is_informative(clean_name, clean_description, fallback_ingredients):
        return {
            "ingredients": [{
                "name": ingredient["name"],
                "gramsPer100g": round(float(ingredient["grams_per_100g"]), 2),
                "preparation": ingredient["preparation"],
            } for ingredient in fallback_ingredients],
            "confidence": 0.5,
            "needsMoreInfo": False,
            "question": "",
            "notes": "Ingredient shares are practical estimates from the named foods and usual preparation; exact recipe weights were not supplied.",
        }

    if not api_key.strip():
        key_name = "GEMINI_API_KEY" if provider == "gemini" else "OPENAI_API_KEY"
        raise FoodVisionError(503, f"Recipe interpretation is not configured. Add {key_name} to server/.env.")
    if provider not in {"gemini", "openai"}:
        raise FoodVisionError(400, "FOOD_VISION_PROVIDER must be set to gemini or openai.")

    request_fn = _request_recipe_gemini if provider == "gemini" else _request_recipe_openai
    content = request_fn(clean_name, clean_description, clean_method, api_key.strip(), model)
    try:
        result = json.loads(content)
        ingredients = result.get("ingredients")
        if not isinstance(ingredients, list) or len(ingredients) > 10:
            raise ValueError("The ingredient list is malformed.")
        if not isinstance(result.get("confidence"), (int, float)) or isinstance(result.get("confidence"), bool) or not 0 <= result["confidence"] <= 1:
            raise ValueError("The confidence value is malformed.")
        if not isinstance(result.get("needs_more_info"), bool) or not isinstance(result.get("question"), str) or not isinstance(result.get("notes"), str):
            raise ValueError("The clarification fields are malformed.")
        explicit_unknown = bool(re.search(r"\b(i (?:do not|don't) know|not sure|no idea|unknown|cannot tell)\b", clean_description, re.I))
        if not ingredients and not explicit_unknown:
            ingredients = fallback_ingredients
            if _fallback_is_informative(clean_name, clean_description, ingredients):
                result["needs_more_info"] = False
                result["confidence"] = min(float(result["confidence"]), 0.5)
                result["notes"] = "Ingredient shares are practical estimates from the named foods and usual preparation; exact recipe weights were not supplied."
            elif result["needs_more_info"]:
                question = re.sub(r"\s+", " ", result["question"]).strip()[:240] or "Which main ingredient or food type should I use for this estimate?"
                return {"ingredients": [], "confidence": float(result["confidence"]), "needsMoreInfo": True, "question": question, "notes": ""}
        if result["needs_more_info"] and not explicit_unknown and ingredients:
            result["needs_more_info"] = False
            result["question"] = ""
        if result["needs_more_info"] and explicit_unknown:
            question = re.sub(r"\s+", " ", result["question"]).strip()[:240]
            if not question:
                raise ValueError("A follow-up question is missing.")
            return {"ingredients": [], "confidence": float(result["confidence"]), "needsMoreInfo": True, "question": question, "notes": ""}

        cleaned = []
        for ingredient in ingredients:
            if not isinstance(ingredient, dict):
                raise ValueError("An ingredient is malformed.")
            ingredient_name = re.sub(r"\s+", " ", str(ingredient.get("name", ""))).strip()[:100]
            grams = ingredient.get("grams_per_100g")
            if not ingredient_name or isinstance(grams, bool) or not isinstance(grams, (int, float)) or not 0 < grams <= 100:
                raise ValueError("An ingredient name or share is invalid.")
            cleaned.append({
                "name": ingredient_name,
                "gramsPer100g": round(float(grams), 2),
                "preparation": re.sub(r"\s+", " ", str(ingredient.get("preparation", ""))).strip()[:100],
            })
        total = sum(ingredient["gramsPer100g"] for ingredient in cleaned)
        if not cleaned or not 20 <= total <= 300:
            raise ValueError("The ingredient estimate is incomplete.")
        notes = re.sub(r"\s+", " ", result["notes"]).strip()[:400]
        if total < 90 and len(cleaned) < 10:
            cleaned.append({"name": "retained water", "gramsPer100g": round(100 - total, 2), "preparation": "estimated moisture in finished food"})
            total = 100
            notes = (notes + " Retained water was estimated to complete 100 g.").strip()[:400]
        # Normalize small rounding differences in the model's weight estimates.
        scale = 100 / total
        for ingredient in cleaned:
            ingredient["gramsPer100g"] = round(ingredient["gramsPer100g"] * scale, 2)
        largest_index = max(range(len(cleaned)), key=lambda index: cleaned[index]["gramsPer100g"])
        rounding_delta = round(100 - sum(item["gramsPer100g"] for item in cleaned), 2)
        cleaned[largest_index]["gramsPer100g"] = round(cleaned[largest_index]["gramsPer100g"] + rounding_delta, 2)
        return {
            "ingredients": cleaned,
            "confidence": round(float(result["confidence"]), 3),
            "needsMoreInfo": False,
            "question": "",
            "notes": notes,
        }
    except (json.JSONDecodeError, AttributeError, TypeError, ValueError) as error:
        raise FoodVisionError(502, "The food details could not be converted into a valid ingredient estimate. Retry or add the main ingredients.") from error
