function invalidEstimate() {
  const error = new Error('The vision model returned an invalid food list. Try a clear photo of the whole meal.');
  error.status = 502;
  return error;
}

const categories = new Set([
  'staple', 'protein or legumes', 'vegetable', 'fruit', 'dairy',
  'condiment or side', 'dessert', 'beverage', 'prepared dish'
]);

function normalizeEstimate(value) {
  if (value?.isFood !== true || !Array.isArray(value.foods) || value.foods.length === 0 || value.foods.length > 12) {
    const error = new Error('This photo does not appear to contain an identifiable meal. Try a closer food photo.');
    error.status = 422;
    throw error;
  }

  const foods = value.foods.map(food => {
    const name = typeof food.name === 'string' ? food.name.trim().slice(0, 100) : '';
    const category = categories.has(food.category) ? food.category : 'prepared dish';
    const estimatedGrams = Number(food.estimatedGrams);
    const minimum = Number(food.gramsRange?.min);
    const maximum = Number(food.gramsRange?.max);
    const confidenceScore = Number(food.confidenceScore);
    if (!name || !Number.isInteger(estimatedGrams) || estimatedGrams < 1 || estimatedGrams > 5000 ||
        !Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 1 || minimum > estimatedGrams ||
        estimatedGrams > maximum || maximum > 5000 || !Number.isFinite(confidenceScore) || confidenceScore < 0 || confidenceScore > 1) {
      throw invalidEstimate();
    }
    return {
      name,
      category,
      portion: typeof food.portion === 'string' ? food.portion.trim().slice(0, 160) : '',
      cookingMethod: typeof food.cookingMethod === 'string' ? food.cookingMethod.trim().slice(0, 120) : '',
      estimatedGrams,
      gramsFinal: estimatedGrams,
      gramsRange: { min: minimum, max: maximum },
      confidenceScore: Number(confidenceScore.toFixed(4)),
      needsClarification: food.needsClarification === true || confidenceScore < 0.55,
      clarificationQuestion: typeof food.clarificationQuestion === 'string'
        ? food.clarificationQuestion.trim().slice(0, 240)
        : confidenceScore < 0.55 ? 'What is this food, and what are its main ingredients?' : ''
    };
  });

  return {
    isFood: true,
    foods,
    notes: typeof value.notes === 'string' ? value.notes.trim().slice(0, 500) : '',
    needsClarification: value.needsClarification === true,
    userDescription: typeof value.userDescription === 'string' ? value.userDescription.trim().slice(0, 400) : '',
    modelVersion: typeof value.modelVersion === 'string' ? value.modelVersion.trim().slice(0, 100) : 'gemini-3.5-flash-lite'
  };
}

export async function estimateFoodFromImage({ buffer, mimeType, description = '' }) {
  const provider = (process.env.FOOD_VISION_PROVIDER || 'gemini').trim().toLowerCase();
  if (!['gemini', 'openai'].includes(provider)) {
    const error = new Error('FOOD_VISION_PROVIDER must be set to gemini or openai in server/.env.');
    error.status = 500;
    throw error;
  }
  const keyName = provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
  const apiKey = process.env[keyName]?.trim();
  if (!apiKey) {
    const error = new Error(`Photo analysis is not configured. Add ${keyName} to server/.env and restart the server.`);
    error.status = 503;
    throw error;
  }

  const serviceUrl = (process.env.ML_SERVICE_URL || 'http://127.0.0.1:8001').replace(/\/+$/, '');
  const model = (provider === 'gemini'
    ? process.env.GEMINI_FOOD_MODEL || 'gemini-3.5-flash-lite'
    : process.env.OPENAI_FOOD_MODEL || 'gpt-4o-mini').trim().slice(0, 100);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 150000);
  const form = new FormData();
  form.append('image', new Blob([buffer], { type: mimeType }), 'meal-photo');
  form.append('description', String(description).slice(0, 400));

  try {
    const response = await fetch(`${serviceUrl}/analyze-food`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-food-vision-provider': provider,
        'x-food-vision-api-key': apiKey,
        'x-food-vision-model': model
      },
      body: form
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = typeof payload.detail === 'string' ? payload.detail.slice(0, 500) : undefined;
      const message = response.status === 413 || response.status === 415 || response.status === 422
        ? detail || 'The photo could not be identified. Try a clearer image.'
        : response.status === 429
          ? detail || 'The vision API quota or rate limit was reached.'
          : detail || 'The vision service is unavailable. Check that the Python service is running.';
      const error = new Error(message);
      error.status = response.status === 413 || response.status === 415 || response.status === 422
        ? response.status
        : response.status === 429 ? 429 : 503;
      throw error;
    }
    return normalizeEstimate(payload);
  } catch (error) {
    if (error.status) throw error;
    console.error('[food-model] vision service request failed', { message: error.message });
    const unavailable = new Error('Could not reach the food vision service. Start the Python ML service, then try again.');
    unavailable.status = 503;
    throw unavailable;
  } finally {
    clearTimeout(timeout);
  }
}

export async function interpretFoodRecipe({ name, description, cookingMethod = '' }) {
  const provider = (process.env.FOOD_VISION_PROVIDER || 'gemini').trim().toLowerCase();
  if (!['gemini', 'openai'].includes(provider)) {
    const error = new Error('FOOD_VISION_PROVIDER must be set to gemini or openai in server/.env.');
    error.status = 500;
    throw error;
  }
  const keyName = provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
  const apiKey = process.env[keyName]?.trim();
  if (!apiKey) {
    const error = new Error(`Recipe interpretation is not configured. Add ${keyName} to server/.env and restart the server.`);
    error.status = 503;
    throw error;
  }

  const serviceUrl = (process.env.ML_SERVICE_URL || 'http://127.0.0.1:8001').replace(/\/+$/, '');
  const model = (provider === 'gemini'
    ? process.env.GEMINI_FOOD_MODEL || 'gemini-3.5-flash-lite'
    : process.env.OPENAI_FOOD_MODEL || 'gpt-4o-mini').trim().slice(0, 100);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(`${serviceUrl}/analyze-recipe`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-food-vision-provider': provider,
        'x-food-vision-api-key': apiKey,
        'x-food-vision-model': model
      },
      body: JSON.stringify({
        name: String(name || '').trim().slice(0, 100),
        description: String(description || '').trim().slice(0, 400),
        cookingMethod: String(cookingMethod || '').trim().slice(0, 120)
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(typeof payload.detail === 'string'
        ? payload.detail.slice(0, 500)
        : 'The recipe interpretation service is unavailable.');
      error.status = [400, 422].includes(response.status) ? response.status : response.status === 429 ? 429 : 503;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error.status) throw error;
    const unavailable = new Error(error.name === 'AbortError'
      ? 'Gemini took too long to interpret those details. Your answer is saved; retry once the service responds.'
      : 'Could not reach the food interpretation service. Start the Python ML service, then retry.');
    unavailable.status = 503;
    throw unavailable;
  } finally {
    clearTimeout(timeout);
  }
}
