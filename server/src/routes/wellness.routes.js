import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import FoodLog from '../models/FoodLog.js';
import { auth, requireRole } from '../middleware/auth.js';
import { writeAudit } from '../utils/audit.js';
import { calculateWellness } from '../utils/calories.js';
import { estimateFoodFromImage, interpretFoodRecipe } from '../services/foodModel.js';
import {
  calculateItemNutrition,
  combineNutritionComponents,
  estimateDescribedRecipeNutrition,
  estimateRecipeNutrition,
  getFoodNutritionById,
  isIndianFoodContext,
  matchCommonFoodNutrition,
  matchFoodNutrition,
  searchIndianFoodNutrition,
  searchFoodNutrition
} from '../services/foodNutrition.js';
import multer from 'multer';

const router = Router();
router.use(auth);
const FOOD_CATEGORIES = new Set([
  'staple', 'protein or legumes', 'vegetable', 'fruit', 'dairy',
  'condiment or side', 'dessert', 'beverage', 'prepared dish'
]);
const foodImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.MAX_FOOD_IMAGE_MB || 10) * 1024 * 1024, files: 1 },
  fileFilter: (req, file, done) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return done(null, true);
    const error = new Error('Upload a JPEG, PNG, or WebP food photo.');
    error.status = 400;
    done(error);
  }
});

function roundedTotals(foods) {
  const values = foods.reduce((sum, food) => ({
    calories: sum.calories + (food.calories || 0),
    caloriesMin: sum.caloriesMin + (food.calorieRange?.min || 0),
    caloriesMax: sum.caloriesMax + (food.calorieRange?.max || 0),
    proteinG: sum.proteinG + (food.proteinG || 0),
    carbsG: sum.carbsG + (food.carbsG || 0),
    fatG: sum.fatG + (food.fatG || 0),
    estimatedGrams: sum.estimatedGrams + (food.gramsFinal || food.estimatedGrams || 0)
  }), { calories: 0, caloriesMin: 0, caloriesMax: 0, proteinG: 0, carbsG: 0, fatG: 0, estimatedGrams: 0 });
  return {
    calories: Math.round(values.calories),
    caloriesRange: { min: Math.round(values.caloriesMin), max: Math.round(values.caloriesMax) },
    proteinG: Number(values.proteinG.toFixed(1)),
    carbsG: Number(values.carbsG.toFixed(1)),
    fatG: Number(values.fatG.toFixed(1)),
    estimatedGrams: Math.round(values.estimatedGrams)
  };
}

function confidenceLabel(foods) {
  if (!foods.length) return 'low';
  const average = foods.reduce((sum, food) => sum + (food.confidenceScore || 0), 0) / foods.length;
  return average >= 0.8 ? 'high' : average >= 0.55 ? 'medium' : 'low';
}

function nutritionSourceLabel(foods) {
  const sources = foods.map(food => food.sourceDb).filter(Boolean);
  const labels = new Set();
  for (const source of sources) {
    if (/ingredient estimate|recipe ingredient/i.test(source)) labels.add('Ingredient estimate');
    if (/indian nutrient databank|\bINDB\b/i.test(source)) labels.add('INDB');
    if (/USDA|FoodData Central/i.test(source)) labels.add('USDA FDC');
    if (!/ingredient estimate|recipe ingredient|indian nutrient databank|\bINDB\b|USDA|FoodData Central/i.test(source)) {
      labels.add(source.trim().replace(/\s+/g, ' '));
    }
  }
  const label = [...labels].join(' + ') || 'Nutrition database estimate';
  return label.length <= 80 ? label : `${label.slice(0, 77).trimEnd()}...`;
}

function recipeClarificationQuestion(name) {
  if (/\b(pasta|penne|macaroni)\b/i.test(name)) {
    return 'The photo identifies a pasta dish, but I need the recipe to match its nutrition. What is the sauce base (milk or cream, cheese, tomato, or other), and which vegetables are included?';
  }
  return 'The photo identifies this food, but I need more recipe detail to match its nutrition. What are its main ingredients and preparation style?';
}

async function tryCommonFoodMatch(name, clarification = '', context = '') {
  try {
    return await matchCommonFoodNutrition(name, clarification, context);
  } catch (error) {
    if (error.status === 422) return null;
    throw error;
  }
}

function parseTimezoneOffset(value) {
  if (value === undefined || value === null || value === '') return null;
  const offset = Number(value);
  if (!Number.isInteger(offset) || offset < -840 || offset > 840) {
    const error = new Error('Use a valid timezone offset in minutes.');
    error.status = 400;
    throw error;
  }
  return offset;
}

function dayBounds(dateValue, timezoneOffsetMinutes = null) {
  const dateText = dateValue || (timezoneOffsetMinutes === null
    ? new Date().toISOString().slice(0, 10)
    : new Date(Date.now() - timezoneOffsetMinutes * 60_000).toISOString().slice(0, 10));
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!match) {
    const error = new Error('Use a valid date in YYYY-MM-DD format.');
    error.status = 400;
    throw error;
  }
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const date = Number(dayText);
  const utcMidnight = Date.UTC(year, month - 1, date);
  const normalized = new Date(utcMidnight).toISOString().slice(0, 10);
  if (normalized !== dateText) {
    const error = new Error('Use a valid date in YYYY-MM-DD format.');
    error.status = 400;
    throw error;
  }
  const offset = timezoneOffsetMinutes || 0;
  const day = new Date(utcMidnight + offset * 60_000);
  const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);
  return { day, nextDay, date: dateText };
}

function dateShift(dateText, amount) {
  const [year, month, day] = dateText.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

function mongoTimezone(timezoneOffsetMinutes) {
  if (timezoneOffsetMinutes === null) return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const utcOffset = -timezoneOffsetMinutes;
  const sign = utcOffset >= 0 ? '+' : '-';
  const absolute = Math.abs(utcOffset);
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const minutes = String(absolute % 60).padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}

router.post('/calculate', requireRole('patient'), async (req, res, next) => {
  try { res.json(calculateWellness(req.body)); } catch (error) { error.status = 400; next(error); }
});

router.post('/food', requireRole('patient'), foodImageUpload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      const error = new Error('Choose a food photo to analyze.');
      error.status = 400;
      throw error;
    }
    if (req.body.consent !== 'true') {
      const error = new Error('Confirm that the compressed meal photo can be sent to the vision provider for analysis.');
      error.status = 400;
      throw error;
    }
    await writeAudit(req, {
      patient: req.user._id,
      action: 'FOOD_IMAGE_THIRD_PARTY_CONSENT_GRANTED',
      resourceType: 'FoodPhotoAnalysis',
      metadata: {
        provider: (process.env.FOOD_VISION_PROVIDER || 'gemini').toLowerCase(),
        model: (process.env.FOOD_VISION_PROVIDER || 'gemini').toLowerCase() === 'openai'
          ? process.env.OPENAI_FOOD_MODEL || 'gpt-4o-mini'
          : process.env.GEMINI_FOOD_MODEL || 'gemini-3.5-flash-lite'
      }
    });

    const meal = ['breakfast', 'lunch', 'dinner', 'snack'].includes(req.body.meal) ? req.body.meal : null;
    if (!meal) {
      const error = new Error('Choose a valid meal.');
      error.status = 400;
      throw error;
    }

    const description = typeof req.body.description === 'string' ? req.body.description.trim().slice(0, 400) : '';
    const estimate = await estimateFoodFromImage({ buffer: req.file.buffer, mimeType: req.file.mimetype, description });
    const foods = await Promise.all(estimate.foods.map(async food => {
      const modelNeedsClarification = food.needsClarification === true || food.confidenceScore < 0.55;
      let commonMatch = null;
      let commonMatchError = null;
      if (!modelNeedsClarification) {
        try {
          commonMatch = await tryCommonFoodMatch(food.name, '', food.cookingMethod || '');
        } catch (error) {
          commonMatchError = { lookupError: error.message, status: error.status || 503 };
        }
      }
      const match = commonMatch || (modelNeedsClarification ? null : commonMatchError || await matchFoodNutrition(food.name, '', food.cookingMethod || ''));
      const matchError = match?.lookupError || '';
      const nutritionMatch = match && !matchError && !match.needsClarification ? match : null;
      const needsClarification = modelNeedsClarification || match?.needsClarification === true || (!nutritionMatch && !matchError);
      const initialNutrition = nutritionMatch
        ? calculateItemNutrition(nutritionMatch.per100g, food.estimatedGrams)
        : null;
      const range = nutritionMatch ? {
        min: calculateItemNutrition(nutritionMatch.per100g, food.gramsRange.min).calories,
        max: calculateItemNutrition(nutritionMatch.per100g, food.gramsRange.max).calories
      } : null;
      const confidence = food.confidenceScore >= 0.8 ? 'high' : food.confidenceScore >= 0.55 ? 'medium' : 'low';
      return {
        analysisItemId: randomUUID(),
        name: food.name,
        aiName: food.name,
        category: commonMatch?.category || food.category,
        portion: food.portion || `About ${food.estimatedGrams} g`,
        cookingMethod: food.cookingMethod,
        estimatedGrams: food.estimatedGrams,
        gramsAi: food.estimatedGrams,
        gramsFinal: food.estimatedGrams,
        gramsRange: food.gramsRange,
        gramsRangeAi: food.gramsRange,
        calories: initialNutrition?.calories ?? null,
        calorieRange: range,
        proteinG: initialNutrition?.proteinG ?? null,
        carbsG: initialNutrition?.carbsG ?? null,
        fatG: initialNutrition?.fatG ?? null,
        nutritionPer100g: nutritionMatch?.per100g,
        calorieCrossCheck: nutritionMatch?.calorieCrossCheck,
        sourceDb: nutritionMatch?.sourceDb,
        sourceId: nutritionMatch?.sourceId,
        sourceDescription: nutritionMatch?.description,
        nutritionMatchScore: nutritionMatch?.matchScore,
        nutritionConfidenceScore: nutritionMatch?.matchScore,
        recipeCompositionEstimated: Boolean(nutritionMatch?.recipeCompositionEstimated),
        nutritionMatchStatus: nutritionMatch ? 'matched' : 'missing',
        confidence,
        confidenceScore: food.confidenceScore,
        needsClarification,
        clarificationQuestion: needsClarification
          ? match?.clarificationQuestion || (/\b(pasta|penne|macaroni)\b/i.test(food.name)
            ? recipeClarificationQuestion(food.name)
            : food.clarificationQuestion || recipeClarificationQuestion(food.name))
          : '',
        descriptionMatch: false
      };
    }));
    const totals = roundedTotals(foods);
    const missingCount = foods.filter(food => food.nutritionMatchStatus !== 'matched').length;
    const notes = estimate.notes.slice(0, 800);
    const log = await FoodLog.create({
      patient: req.user._id,
      status: 'review',
      meal,
      item: foods.map(food => food.name).join(' + ').slice(0, 240),
      ...totals,
      portionEstimate: foods.map(food => `${food.name}: ${food.portion}`).join('; ').slice(0, 500),
      confidence: confidenceLabel(foods),
      confidenceScore: foods.reduce((sum, food) => sum + food.confidenceScore, 0) / foods.length,
      userDescription: description,
      analysisNotes: notes,
      needsClarification: foods.some(food => food.needsClarification),
      aiModelVersion: estimate.modelVersion,
      nutritionSource: 'Indian Nutrient Databank (INDB) with USDA FoodData Central fallback',
      foods
    });
    await writeAudit(req, {
      patient: req.user._id,
      action: 'FOOD_MEAL_REVIEW_CREATED',
      resourceType: 'FoodLog',
      resourceId: log._id,
      metadata: { itemCount: foods.length, missingNutritionCount: missingCount }
    });
    res.status(201).json({ log, totals, missingNutritionCount: missingCount });
  } catch (error) { next(error); }
});

router.get('/nutrition/search', requireRole('patient'), async (req, res, next) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const method = typeof req.query.method === 'string' ? req.query.method.trim().slice(0, 80) : '';
    if (!query) return res.json({ results: [] });
    const indianResults = searchIndianFoodNutrition(query);
    if (indianResults[0]?.matchScore >= 0.5 || isIndianFoodContext(query)) {
      return res.json({ source: 'Indian Nutrient Databank (INDB)', results: indianResults });
    }
    if (/\b(pasta|penne|macaroni)\b/i.test(query) && indianResults[0]?.matchScore >= 0.3) {
      return res.json({ source: 'Indian Nutrient Databank (INDB)', results: indianResults });
    }
    const fdcQuery = [query, method].filter(Boolean).join(' ');
    res.json({ source: 'USDA FoodData Central', results: await searchFoodNutrition(fdcQuery) });
  } catch (error) { next(error); }
});

router.post('/food/:id/clarify', requireRole('patient'), async (req, res, next) => {
  try {
    const log = await FoodLog.findOne({ _id: req.params.id, patient: req.user._id });
    if (!log) {
      const error = new Error('Meal review was not found.');
      error.status = 404;
      throw error;
    }
    if (log.status !== 'review') {
      const error = new Error('This meal has already been logged.');
      error.status = 409;
      throw error;
    }

    const input = req.body || {};
    const original = log.foods.find(food => food.analysisItemId === input.analysisItemId);
    const name = typeof input.name === 'string' ? input.name.trim().slice(0, 100) : '';
    const userClarification = typeof input.userClarification === 'string' ? input.userClarification.trim().slice(0, 400) : '';
    const requestedGrams = Number(input.gramsFinal);
    if (!original || !name || userClarification.length < 2 ||
        (input.gramsFinal !== undefined && (!Number.isInteger(requestedGrams) || requestedGrams < 1 || requestedGrams > 5000))) {
      const error = new Error('Choose the uncertain food and add a short description of its type or ingredients.');
      error.status = 400;
      throw error;
    }

    let nutrition = await tryCommonFoodMatch(name, userClarification, original.cookingMethod || '');
    let recipeInterpretation = null;
    if (!nutrition) {
      try {
        nutrition = await estimateDescribedRecipeNutrition(name, userClarification, original.cookingMethod || '');
      } catch (error) {
        if (error.status !== 422) throw error;
      }
      if (nutrition) {
        recipeInterpretation = {
          confidence: nutrition.recipeCompositionConfidence || 0.5,
          notes: nutrition.nutritionNotes || 'Nutrition estimated from the named ingredients.'
        };
      }
    }
    const recipeAnswer = /\b(made with|made from|contains|ingredient|based on|consists of|mixed with)\b/i.test(userClarification) ||
      (userClarification.split(/\s+/).length >= 8 && /\b(and|with|using)\b/i.test(userClarification));
    const directMatch = nutrition || recipeAnswer
      ? null
      : await matchFoodNutrition(name, userClarification, original.cookingMethod || '');
    nutrition ||= directMatch && !directMatch.needsClarification && !directMatch.lookupError
      ? directMatch
      : null;
    if (!nutrition) {
      try {
        recipeInterpretation = await interpretFoodRecipe({
          name,
          description: userClarification,
          cookingMethod: original.cookingMethod || ''
        });
      } catch (visionError) {
        if (visionError.status !== 429) throw visionError;
        let quotaFallback = directMatch;
        if (!quotaFallback || quotaFallback.needsClarification || quotaFallback.lookupError) {
          quotaFallback = await matchFoodNutrition(name, userClarification, original.cookingMethod || '');
        }
        if (quotaFallback?.lookupError) {
          const fallbackError = new Error(quotaFallback.lookupError);
          fallbackError.status = quotaFallback.status || 503;
          throw fallbackError;
        }
        if (!quotaFallback || quotaFallback.needsClarification) throw visionError;
        const quotaNote = 'Gemini quota was unavailable; calories use the closest whole-food nutrition database match, so ingredient proportions were not interpreted.';
        nutrition = { ...quotaFallback, recipeCompositionEstimated: true, nutritionNotes: quotaNote };
        recipeInterpretation = { confidence: 0.4, notes: quotaNote };
      }
      if (!nutrition && recipeInterpretation.needsMoreInfo) {
        original.userClarification = userClarification;
        original.needsClarification = true;
        original.clarificationQuestion = recipeInterpretation.question;
        log.needsClarification = true;
        await log.save();
        await writeAudit(req, {
          patient: req.user._id,
          action: 'FOOD_ITEM_FOLLOWUP_CLARIFICATION_REQUESTED',
          resourceType: 'FoodLog',
          resourceId: log._id,
          metadata: { analysisItemId: original.analysisItemId }
        });
        return res.json({ log, needsClarification: true });
      }
      if (!nutrition) {
        try {
          nutrition = await estimateRecipeNutrition(recipeInterpretation.ingredients);
        } catch (ingredientError) {
          if (ingredientError.status !== 422) throw ingredientError;
          const databaseFallback = directMatch && !directMatch.needsClarification && !directMatch.lookupError
            ? directMatch
            : await matchFoodNutrition(name, userClarification, original.cookingMethod || '');
          if (databaseFallback?.lookupError) {
            const error = new Error(databaseFallback.lookupError);
            error.status = databaseFallback.status || 503;
            throw error;
          }
          if (databaseFallback && !databaseFallback.needsClarification) nutrition = databaseFallback;
          else throw ingredientError;
        }
      }
    }

    const grams = requestedGrams || original.gramsFinal || original.estimatedGrams || 100;
    const originalRange = original.gramsRange || { min: grams, max: grams };
    const range = { min: Math.min(originalRange.min, grams), max: Math.max(originalRange.max, grams) };
    const macros = calculateItemNutrition(nutrition.per100g, grams);
    const nutritionConfidenceScore = recipeInterpretation
      ? Math.min(recipeInterpretation.confidence, nutrition.matchScore)
      : nutrition.matchScore;
    const compositionUncertainty = nutrition.recipeCompositionEstimated
      ? Math.max(0.12, (1 - nutritionConfidenceScore) * 0.4)
      : 0;
    const minCalories = calculateItemNutrition(nutrition.per100g, range.min).calories;
    const maxCalories = calculateItemNutrition(nutrition.per100g, range.max).calories;
    original.gramsFinal = grams;
    original.gramsRange = range;
    original.name = nutrition.nutritionComponents ? name : nutrition.displayName || nutrition.description || name;
    original.category = nutrition.category || original.category;
    original.userClarification = userClarification;
    original.needsClarification = false;
    original.clarificationQuestion = '';
    original.calories = macros.calories;
    original.proteinG = macros.proteinG;
    original.carbsG = macros.carbsG;
    original.fatG = macros.fatG;
    original.calorieRange = {
      min: Math.max(0, Math.floor(minCalories * (1 - compositionUncertainty))),
      max: Math.ceil(maxCalories * (1 + compositionUncertainty))
    };
    original.nutritionPer100g = nutrition.per100g;
    original.nutritionComponents = nutrition.nutritionComponents || [];
    original.nutritionNotes = recipeInterpretation?.notes || nutrition.nutritionNotes || '';
    original.recipeCompositionEstimated = Boolean(recipeInterpretation || nutrition.recipeCompositionEstimated);
    original.nutritionConfidenceScore = nutritionConfidenceScore;
    original.calorieCrossCheck = nutrition.calorieCrossCheck;
    original.sourceDb = nutrition.sourceDb;
    original.sourceId = nutrition.sourceId;
    original.sourceDescription = nutrition.description;
    original.nutritionMatchScore = nutrition.matchScore;
    original.nutritionMatchStatus = 'matched';
    log.needsClarification = log.foods.some(food => food.needsClarification);
    await log.save();
    await writeAudit(req, {
      patient: req.user._id,
      action: 'FOOD_ITEM_CLARIFIED_AND_MATCHED',
      resourceType: 'FoodLog',
      resourceId: log._id,
      metadata: {
        analysisItemId: original.analysisItemId,
        calculationMethod: nutrition.nutritionComponents ? 'database-backed ingredient estimate' : 'direct nutrition record',
        ingredientCount: nutrition.nutritionComponents?.length || 0
      }
    });
    res.json({ log, calculatedFromIngredients: Boolean(nutrition.nutritionComponents) });
  } catch (error) { next(error); }
});

router.patch('/food/:id', requireRole('patient'), async (req, res, next) => {
  try {
    const log = await FoodLog.findOne({ _id: req.params.id, patient: req.user._id });
    if (!log) {
      const error = new Error('Meal review was not found.');
      error.status = 404;
      throw error;
    }
    if (log.status !== 'review') {
      const error = new Error('This meal has already been logged.');
      error.status = 409;
      throw error;
    }

    const inputFoods = req.body?.foods;
    if (!Array.isArray(inputFoods) || inputFoods.length < 1 || inputFoods.length > 12) {
      const error = new Error('Keep between 1 and 12 food items in the meal.');
      error.status = 400;
      throw error;
    }

    const foods = await Promise.all(inputFoods.map(async input => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        const error = new Error('Each meal item must be a valid object.');
        error.status = 400;
        throw error;
      }
      const sourceId = typeof input.sourceId === 'string' ? input.sourceId.trim() : '';
      const name = typeof input.name === 'string' ? input.name.trim().slice(0, 100) : '';
      const userClarification = typeof input.userClarification === 'string' ? input.userClarification.trim().slice(0, 400) : '';
      const gramsFinal = Number(input.gramsFinal);
      const category = FOOD_CATEGORIES.has(input.category) ? input.category : 'prepared dish';
      if (!name || !Number.isInteger(gramsFinal) || gramsFinal < 1 || gramsFinal > 5000) {
        const error = new Error('Each food needs a name and a portion from 1 to 5000 grams.');
        error.status = 400;
        throw error;
      }
      const original = log.foods.find(food => food.analysisItemId === input.analysisItemId);
      let nutrition;
      if (sourceId) {
        nutrition = await getFoodNutritionById(sourceId);
      } else if (original?.nutritionComponents?.length && original.nutritionMatchStatus === 'matched' &&
          original.name === name && (userClarification || original.userClarification || '') === (original.userClarification || '')) {
        nutrition = {
          per100g: combineNutritionComponents(original.nutritionComponents),
          sourceDb: original.sourceDb,
          sourceId: '',
          description: original.sourceDescription,
          matchScore: original.nutritionMatchScore,
          calorieCrossCheck: original.calorieCrossCheck,
          nutritionComponents: original.nutritionComponents,
          nutritionNotes: original.nutritionNotes,
          recipeCompositionEstimated: original.recipeCompositionEstimated
        };
      } else {
        const automaticMatch = await matchFoodNutrition(
          name,
          userClarification || original?.userClarification || '',
          original?.cookingMethod || ''
        );
        if (automaticMatch?.needsClarification) {
          const error = new Error(automaticMatch.clarificationQuestion || 'Add one more detail so the food can be matched safely.');
          error.status = 422;
          throw error;
        }
        if (automaticMatch?.lookupError) {
          const error = new Error(automaticMatch.lookupError);
          error.status = automaticMatch.status || 503;
          throw error;
        }
        if (!automaticMatch) {
          const error = new Error(`Could not find a reliable nutrition match for ${name}. Add more details or search the available food database.`);
          error.status = 422;
          throw error;
        }
        nutrition = automaticMatch;
      }
      const finalMacros = calculateItemNutrition(nutrition.per100g, gramsFinal);
      const minGrams = original?.gramsRange?.min ?? gramsFinal;
      const maxGrams = original?.gramsRange?.max ?? gramsFinal;
      const range = { min: Math.min(minGrams, gramsFinal), max: Math.max(maxGrams, gramsFinal) };
      const recipeNutritionConfidence = original?.nutritionConfidenceScore ?? 0.65;
      const compositionUncertainty = nutrition.recipeCompositionEstimated
        ? Math.max(0.12, (1 - recipeNutritionConfidence) * 0.4)
        : 0;
      const minCalories = calculateItemNutrition(nutrition.per100g, range.min).calories;
      const maxCalories = calculateItemNutrition(nutrition.per100g, range.max).calories;
      return {
        analysisItemId: original?.analysisItemId || randomUUID(),
        name,
        aiName: original?.aiName,
        category,
        portion: `${gramsFinal} g portion${original?.cookingMethod ? `, ${original.cookingMethod}` : ''}`.slice(0, 160),
        cookingMethod: original?.cookingMethod || '',
        estimatedGrams: original?.estimatedGrams ?? null,
        gramsAi: original?.gramsAi ?? null,
        gramsFinal,
        gramsRange: range,
        gramsRangeAi: original?.gramsRangeAi || original?.gramsRange || undefined,
        calories: finalMacros.calories,
        calorieRange: {
          min: Math.max(0, Math.floor(minCalories * (1 - compositionUncertainty))),
          max: Math.ceil(maxCalories * (1 + compositionUncertainty))
        },
        proteinG: finalMacros.proteinG,
        carbsG: finalMacros.carbsG,
        fatG: finalMacros.fatG,
        nutritionPer100g: nutrition.per100g,
        nutritionComponents: nutrition.nutritionComponents || [],
        nutritionNotes: nutrition.nutritionNotes || '',
        recipeCompositionEstimated: Boolean(nutrition.recipeCompositionEstimated),
        nutritionConfidenceScore: original?.nutritionConfidenceScore ?? nutrition.matchScore,
        calorieCrossCheck: nutrition.calorieCrossCheck,
        sourceDb: nutrition.sourceDb,
        sourceId: nutrition.sourceId,
        sourceDescription: nutrition.description,
        nutritionMatchScore: nutrition.matchScore,
        nutritionMatchStatus: 'matched',
        confidence: original?.confidence || 'low',
        confidenceScore: original?.confidenceScore ?? null,
        needsClarification: false,
        clarificationQuestion: '',
        userClarification: userClarification || original?.userClarification || ''
      };
    }));

    const totals = roundedTotals(foods);
    log.foods = foods;
    log.status = 'logged';
    log.item = foods.map(food => food.name).join(' + ').slice(0, 240);
    log.calories = totals.calories;
    log.calorieRange = totals.caloriesRange;
    log.proteinG = totals.proteinG;
    log.carbsG = totals.carbsG;
    log.fatG = totals.fatG;
    log.estimatedGrams = totals.estimatedGrams;
    log.portionEstimate = foods.map(food => `${food.name}: ${food.gramsFinal} g`).join('; ').slice(0, 500);
    log.confidence = confidenceLabel(foods);
    log.needsClarification = foods.some(food => food.needsClarification);
    log.nutritionSource = nutritionSourceLabel(foods);
    log.reviewedAt = new Date();
    await log.save();
    await writeAudit(req, {
      patient: req.user._id,
      action: 'FOOD_MEAL_CONFIRMED',
      resourceType: 'FoodLog',
      resourceId: log._id,
      metadata: { itemCount: foods.length }
    });
    res.json({ log, totals });
  } catch (error) { next(error); }
});

router.delete('/food/:id', requireRole('patient'), async (req, res, next) => {
  try {
    const result = await FoodLog.deleteOne({ _id: req.params.id, patient: req.user._id, status: 'review' });
    if (!result.deletedCount) {
      const error = new Error('Meal review was not found or has already been logged.');
      error.status = 404;
      throw error;
    }
    await writeAudit(req, {
      patient: req.user._id,
      action: 'FOOD_MEAL_REVIEW_DISCARDED',
      resourceType: 'FoodLog',
      resourceId: req.params.id
    });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.get('/food/history', requireRole('patient'), async (req, res, next) => {
  try {
    const timezoneOffsetMinutes = parseTimezoneOffset(req.query.timezoneOffset);
    const { date } = dayBounds(req.query.date, timezoneOffsetMinutes);
    const days = Math.min(30, Math.max(2, Number.parseInt(req.query.days, 10) || 7));
    const firstDate = dateShift(date, -(days - 1));
    const { day: start } = dayBounds(firstDate, timezoneOffsetMinutes);
    const { nextDay: end } = dayBounds(date, timezoneOffsetMinutes);
    const grouped = await FoodLog.aggregate([
      { $match: {
        patient: req.user._id,
        status: { $ne: 'review' },
        eatenAt: { $gte: start, $lt: end }
      } },
      { $group: {
        _id: {
          $dateToString: {
            date: '$eatenAt',
            format: '%Y-%m-%d',
            timezone: mongoTimezone(timezoneOffsetMinutes)
          }
        },
        calories: { $sum: '$calories' },
        caloriesMin: { $sum: { $ifNull: ['$calorieRange.min', '$calories'] } },
        caloriesMax: { $sum: { $ifNull: ['$calorieRange.max', '$calories'] } },
        proteinG: { $sum: '$proteinG' },
        carbsG: { $sum: '$carbsG' },
        fatG: { $sum: '$fatG' },
        mealCount: { $sum: 1 }
      } },
      { $sort: { _id: 1 } }
    ]);
    const totalsByDate = new Map(grouped.map(entry => [entry._id, {
      calories: Math.round(entry.calories),
      calorieRange: { min: Math.round(entry.caloriesMin), max: Math.round(entry.caloriesMax) },
      proteinG: Number(entry.proteinG.toFixed(1)),
      carbsG: Number(entry.carbsG.toFixed(1)),
      fatG: Number(entry.fatG.toFixed(1)),
      mealCount: entry.mealCount
    }]));
    const history = Array.from({ length: days }, (_, index) => {
      const day = dateShift(firstDate, index);
      return {
        date: day,
        ...(totalsByDate.get(day) || { calories: 0, calorieRange: { min: 0, max: 0 }, proteinG: 0, carbsG: 0, fatG: 0, mealCount: 0 })
      };
    });
    res.json({ date, days: history });
  } catch (error) { next(error); }
});

router.get('/food', requireRole('patient'), async (req, res, next) => {
  try {
    const timezoneOffsetMinutes = parseTimezoneOffset(req.query.timezoneOffset);
    const { day, nextDay, date } = dayBounds(req.query.date, timezoneOffsetMinutes);
    const [logs, drafts] = await Promise.all([
      FoodLog.find({ patient: req.user._id, status: { $ne: 'review' }, eatenAt: { $gte: day, $lt: nextDay } }).sort('eatenAt'),
      FoodLog.find({ patient: req.user._id, status: 'review' }).sort('-createdAt').limit(3)
    ]);
    const totals = logs.reduce((sum, log) => ({
      calories: sum.calories + log.calories,
      caloriesMin: sum.caloriesMin + (log.calorieRange?.min ?? log.calories),
      caloriesMax: sum.caloriesMax + (log.calorieRange?.max ?? log.calories),
      proteinG: sum.proteinG + log.proteinG,
      carbsG: sum.carbsG + log.carbsG,
      fatG: sum.fatG + log.fatG
    }), { calories: 0, caloriesMin: 0, caloriesMax: 0, proteinG: 0, carbsG: 0, fatG: 0 });
    res.json({
      date,
      totals: {
        calories: Math.round(totals.calories),
        calorieRange: { min: Math.round(totals.caloriesMin), max: Math.round(totals.caloriesMax) },
        proteinG: Number(totals.proteinG.toFixed(1)),
        carbsG: Number(totals.carbsG.toFixed(1)),
        fatG: Number(totals.fatG.toFixed(1))
      },
      logs,
      drafts
    });
  } catch (error) { next(error); }
});

export default router;
