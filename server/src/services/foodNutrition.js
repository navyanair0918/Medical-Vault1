import FoodNutritionCache from '../models/FoodNutritionCache.js';
import { readFileSync } from 'node:fs';

const FDC_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SEARCH_TYPES = ['Foundation', 'SR Legacy', 'Survey (FNDDS)'];
const INDIAN_FOODS_PATH = new URL('../../data/indian-recipes.json', import.meta.url);
const INDIAN_FOODS = JSON.parse(readFileSync(INDIAN_FOODS_PATH, 'utf8')).foods;
const INDIAN_CUISINE_MARKER = /\b(indian|roti|chapati|phulka|paratha|naan|kulcha|dosa|idli|uttapam|poha|upma|dal|daal|sambar|sambhar|rasam|chutney|sabzi|subzi|paneer|biryani|biriyani|khichdi|kichdi|pulao|pulav|raita|korma|curry|masala|tikka|tandoori|vindaloo|samosa|pakora|bhaji|puri|kachori|ladoo|laddu|kheer|halwa|gulab jamun|lassi|chai|ghee|besan|atta|makki|sarson|methi|rajma|chole|chana masala|thali)\b/i;
const COMPOUND_DISH_GROUPS = [
  { query: /\b(pasta|penne|macaroni)\b/i, record: /\b(pasta|penne|macaroni)\b/i }
];
const INGREDIENT_PROFILES = [
  {
    kind: 'nut',
    pattern: /\b(almonds?|cashews?|pistachios?|walnuts?|peanuts?)\b/i,
    queries: [],
    accepts: /\b(almonds?|cashews?|pistachios?|walnuts?|peanuts?)\b/i,
    prefers: /\b(raw|without salt|unsalted)\b/i,
    excludes: /\b(butter|flour|milk|paste|oil|candy|chocolate|bar)\b/i
  },
  {
    kind: 'sprouted-mung',
    pattern: /\b(moong|mung|green gram)\b.*\b(sprout|sprouted)\b|\b(sprout|sprouted)\b.*\b(moong|mung|green gram)\b/i,
    queries: ['mung beans mature seeds sprouted cooked', 'mung bean sprouts cooked'],
    accepts: /\b(mung|mung bean|green gram)\b/i,
    requires: /\b(sprout|sprouted)\b/i,
    prefers: /\b(cooked|boiled)\b/i,
    excludes: /\b(salad|soup|curry|dish|pulao|paratha|mixture)\b/i
  },
  {
    pattern: /\b(finger millet|ragi|nachni|pachni)\b/i,
    queries: ['finger millet flour', 'finger millet raw'],
    accepts: /\b(finger millet|ragi|nachni|pachni|millet)\b/i,
    prefers: /\b(flour|raw|grain)\b/i,
    excludes: /\b(biscuit|cookie|cake|bread|porridge|cereal)\b/i
  },
  {
    pattern: /\b(amaranth|rajgira)\b/i,
    queries: ['amaranth flour', 'amaranth grain raw'],
    accepts: /\b(amaranth|rajgira)\b/i,
    prefers: /\b(flour|raw|grain|seed)\b/i,
    excludes: /\b(ladoo|laddu|bar|popped|cereal|sweet)\b/i
  },
  {
    pattern: /\b(whole wheat|wheat flour|atta|wheat)\b/i,
    queries: ['wheat flour whole grain', 'whole wheat flour'],
    accepts: /\b(wheat|atta)\b/i,
    prefers: /\b(flour|whole grain|whole wheat)\b/i,
    excludes: /\b(bread|pasta|noodle|biscuit|cookie|cake|paratha|roti)\b/i
  },
  {
    pattern: /\b(ghee|clarified butter)\b/i,
    queries: ['ghee clarified butter'],
    accepts: /\b(ghee|clarified butter)\b/i,
    prefers: /\b(ghee|clarified butter)\b/i
  },
  {
    pattern: /\b(oil|cooking oil)\b/i,
    queries: ['vegetable oil'],
    accepts: /\b(oil)\b/i,
    prefers: /\b(vegetable|sunflower|canola|soybean|olive)\b/i
  },
  {
    pattern: /\b(capsicum|bell pepper|sweet pepper)\b/i,
    queries: ['peppers sweet green raw', 'bell pepper green raw'],
    accepts: /\b(pepper|capsicum)\b/i,
    prefers: /\b(green|raw)\b/i,
    excludes: /\b(black pepper|pepperoni|hot dog|stuffed|sauce)\b/i
  },
  {
    pattern: /\b(corn starch|cornstarch|corn flour|cornflour)\b/i,
    queries: ['cornstarch', 'corn starch'],
    accepts: /\b(corn\s*starch|cornflour|corn flour)\b/i,
    prefers: /\b(starch|cornstarch)\b/i,
    excludes: /\b(tortilla|bread|cereal|soup|sauce)\b/i
  },
  {
    pattern: /\b(besan|chickpea flour|gram flour)\b/i,
    queries: ['chickpea flour', 'gram flour'],
    accepts: /\b(chickpea|chick peas|garbanzo|gram flour|besan)\b/i,
    prefers: /\b(flour)\b/i,
    excludes: /\b(cookie|biscuit|cake|bread|snack|mixture)\b/i
  },
  {
    pattern: /\b(sooji|suji|rava|semolina)\b/i,
    queries: ['semolina unenriched', 'semolina'],
    accepts: /\b(semolina|rava|sooji|suji)\b/i,
    prefers: /\b(semolina)\b/i,
    excludes: /\b(pasta|couscous|pudding|dessert)\b/i
  },
  {
    pattern: /\b(curd|yogurt|yoghurt|dahi)\b/i,
    queries: ['yogurt plain whole milk', 'yogurt plain'],
    accepts: /\b(yogurt|yoghurt|curd)\b/i,
    prefers: /\b(plain|whole milk)\b/i,
    excludes: /\b(frozen|flavored|flavoured|sweetened|fruit)\b/i
  },
  {
    pattern: /\b(black raisins?|golden raisins?|raisins?|sultanas?)\b/i,
    queries: ['raisins seedless dried', 'raisins dried', 'black raisins'],
    accepts: /\b(raisins?|sultanas?)\b/i,
    prefers: /\b(seedless|dried)\b/i,
    excludes: /\b(raisin bread|raisin bran|cereal|trail mix)\b/i
  },
  {
    pattern: /\b(processed cheese|cheese slices?)\b/i,
    queries: ['processed cheese', 'cheese, processed'],
    accepts: /\bcheese\b/i,
    prefers: /\b(processed|slice)\b/i,
    excludes: /\b(cream cheese|cottage cheese|cheese sauce|cheese spread)\b/i
  },
  {
    pattern: /\b(maida|all purpose flour|refined wheat flour)\b/i,
    queries: ['wheat flour white all purpose', 'wheat flour all purpose'],
    accepts: /\b(wheat flour|all purpose flour|maida)\b/i,
    prefers: /\b(white|all purpose)\b/i,
    excludes: /\b(whole grain|whole wheat|bread|pasta|noodle|cookie|cake)\b/i
  }
];
const DESCRIBED_INGREDIENTS = [
  { name: 'sprouted mung beans', pattern: /\b(moong|mung|green gram)\b.*\b(sprout|sprouted|sprouts)\b|\b(sprout|sprouted|sprouts)\b.*\b(moong|mung|green gram)\b/i, role: 'protein', preparation: 'boiled cooked' },
  { name: 'finger millet flour', pattern: /\b(ragi|nachni|pachni|finger millet)\b/i, role: 'staple', preparation: 'flour' },
  { name: 'amaranth flour', pattern: /\b(rajgira|amaranth)\b/i, role: 'staple', preparation: 'flour' },
  { name: 'whole wheat flour', pattern: /\b(atta|whole wheat|wheat flour|wheat)\b/i, role: 'staple', preparation: 'flour' },
  { name: 'chickpea flour', pattern: /\b(besan|chickpea flour|gram flour)\b/i, role: 'staple', preparation: 'flour' },
  { name: 'corn starch', pattern: /\b(corn starch|cornstarch|corn flour|cornflour)\b/i, role: 'staple', preparation: 'dry' },
  { name: 'pasta, cooked', pattern: /\b(pasta|penne|macaroni)\b/i, role: 'staple', preparation: 'cooked' },
  { name: 'white rice, cooked', pattern: /\b(rice|chawal)\b/i, role: 'staple', preparation: 'cooked' },
  { name: 'oats, cooked', pattern: /\boats?\b/i, role: 'staple', preparation: 'cooked' },
  { name: 'whole wheat bread', pattern: /\b(whole wheat bread|brown bread|bread)\b/i, role: 'staple', preparation: 'whole wheat' },
  { name: 'plain yogurt', pattern: /\b(yogurt|yoghurt|curd|dahi)\b/i, role: 'base', preparation: 'plain, unsweetened' },
  { name: 'milk', pattern: /\bmilk\b/i, role: 'base', preparation: 'whole milk' },
  { name: 'processed cheese', pattern: /\bcheese\s+slices?\b/i, role: 'dairy', preparation: 'processed' },
  { name: 'cheese', pattern: /\bcheese\b/i, role: 'dairy', preparation: 'cheese' },
  { name: 'paneer', pattern: /\bpaneer\b/i, role: 'protein', preparation: 'plain' },
  { name: 'eggs, cooked', pattern: /\b(eggs?|anda)\b/i, role: 'protein', preparation: 'cooked' },
  { name: 'chicken, cooked', pattern: /\bchicken\b/i, role: 'protein', preparation: 'cooked' },
  { name: 'fish, cooked', pattern: /\b(fish|salmon|tuna)\b/i, role: 'protein', preparation: 'cooked' },
  { name: 'tofu', pattern: /\btofu\b/i, role: 'protein', preparation: 'plain' },
  { name: 'pistachios', pattern: /\bpistachios?\b/i, role: 'garnish', preparation: 'raw, unsalted' },
  { name: 'cashews', pattern: /\bcashews?\b/i, role: 'garnish', preparation: 'raw, unsalted' },
  { name: 'almonds', pattern: /\balmonds?\b/i, role: 'garnish', preparation: 'raw, unsalted' },
  { name: 'walnuts', pattern: /\bwalnuts?\b/i, role: 'garnish', preparation: 'raw, unsalted' },
  { name: 'peanuts', pattern: /\bpeanuts?\b/i, role: 'garnish', preparation: 'raw, unsalted' },
  { name: 'raisins, dried', pattern: /\b(black|golden|dried)?\s*raisins?\b/i, role: 'garnish', preparation: 'dried' },
  { name: 'dates, dried', pattern: /\b(dates?|khajur)\b/i, role: 'garnish', preparation: 'dried' },
  { name: 'honey', pattern: /\bhoney\b/i, role: 'garnish', preparation: 'raw' },
  { name: 'banana, raw', pattern: /\b(banana|kela)\b/i, role: 'garnish', preparation: 'raw' },
  { name: 'apples, raw', pattern: /\b(apples?|seb)\b/i, role: 'garnish', preparation: 'raw' },
  { name: 'coconut, raw', pattern: /\bcoconut\b/i, role: 'garnish', preparation: 'raw' },
  { name: 'chickpeas, cooked', pattern: /\b(chickpeas?|chana|chole)\b/i, role: 'protein', preparation: 'cooked' },
  { name: 'lentils, cooked', pattern: /\b(lentils?|dal|daal|moong dal|masoor dal|toor dal)\b/i, role: 'protein', preparation: 'cooked' },
  { name: 'capsicum', pattern: /\b(capsicum|bell pepper)\b/i, role: 'vegetable', preparation: 'raw' },
  { name: 'tomatoes, raw', pattern: /\b(tomato|tomatoes|tamatar)\b/i, role: 'vegetable', preparation: 'raw' },
  { name: 'onions, raw', pattern: /\b(onion|onions|pyaaz)\b/i, role: 'vegetable', preparation: 'raw' },
  { name: 'potatoes, cooked', pattern: /\b(potato|potatoes|aloo)\b/i, role: 'vegetable', preparation: 'cooked' },
  { name: 'spinach, raw', pattern: /\b(spinach|palak)\b/i, role: 'vegetable', preparation: 'raw' },
  { name: 'peas, cooked', pattern: /\b(peas|matar)\b/i, role: 'vegetable', preparation: 'cooked' },
  { name: 'carrots, raw', pattern: /\b(carrot|carrots|gajar)\b/i, role: 'vegetable', preparation: 'raw' },
  { name: 'mushrooms, raw', pattern: /\bmushrooms?\b/i, role: 'vegetable', preparation: 'raw' },
  { name: 'cooking oil', pattern: /\b(oil|tel)\b/i, role: 'fat', preparation: 'vegetable oil' },
  { name: 'ghee', pattern: /\bghee\b/i, role: 'fat', preparation: 'clarified butter' },
  { name: 'butter', pattern: /\bbutter\b/i, role: 'fat', preparation: 'unsalted' },
  { name: 'garlic, raw', pattern: /\bgarlic\b/i, role: 'seasoning', preparation: 'raw' }
];
const ZERO_NUTRITION_INGREDIENT = /^(?:(?:retained|absorbed)\s+)?water(?:\b.*)?$|^(?:salt|black pepper|spices|mixed spices|seasoning)(?:\b.*)?$/i;

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function normalizeMatchText(value) {
  return normalize(value).split(' ').filter(Boolean).map(word => {
    if (word.length > 5 && word.endsWith('oes')) return word.slice(0, -2);
    if (word.length > 5 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
    if (word.length > 5 && /(?:ches|shes|xes|zes)$/.test(word)) return word.slice(0, -2);
    if (word.length > 5 && word.endsWith('s') && !/(?:ss|us|is)$/.test(word)) return word.slice(0, -1);
    return word;
  }).join(' ');
}

function cacheKeyForQuery(query) {
  return `query:${normalize(query).slice(0, 160)}`;
}

async function readCache(cacheKey) {
  try {
    const entry = await FoodNutritionCache.findOne({ cacheKey }).lean();
    if (entry && Date.now() - new Date(entry.cachedAt).getTime() < CACHE_TTL_MS) return entry.results;
  } catch (error) {
    console.warn('[food-nutrition] cache read failed', { message: error.message });
  }
  return null;
}

async function writeCache(cacheKey, results) {
  try {
    await FoodNutritionCache.updateOne(
      { cacheKey },
      { $set: { results, cachedAt: new Date() } },
      { upsert: true }
    );
  } catch (error) {
    console.warn('[food-nutrition] cache write failed', { message: error.message });
  }
}

function nutrientValue(foodNutrients, ids, namePatterns, unitTarget = 'g') {
  const rows = Array.isArray(foodNutrients) ? foodNutrients : [];
  const nutrient = rows.find(row => {
    const id = String(row.nutrientId ?? row.nutrient?.id ?? row.nutrient?.number ?? '');
    const name = String(row.nutrientName ?? row.nutrient?.name ?? '').toLowerCase();
    const unit = String(row.unitName ?? row.nutrient?.unitName ?? '').toLowerCase();
    return (ids.includes(id) || namePatterns.some(pattern => name.includes(pattern))) &&
      (unitTarget === 'any' || unit === unitTarget.toLowerCase());
  });
  const value = Number(nutrient?.value ?? nutrient?.amount);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function extractNutrition(food) {
  const nutrients = food.foodNutrients || [];
  let calories = nutrientValue(nutrients, ['1008', '2048'], ['energy'], 'kcal');
  if (calories === null) {
    const kilojoules = nutrientValue(nutrients, ['1062', '2047'], ['energy'], 'kj');
    if (kilojoules !== null) calories = kilojoules / 4.184;
  }
  const proteinG = nutrientValue(nutrients, ['1003'], ['protein']);
  const fatG = nutrientValue(nutrients, ['1004'], ['total lipid']);
  const carbsG = nutrientValue(nutrients, ['1005'], ['carbohydrate, by difference']);
  if ([calories, proteinG, fatG, carbsG].some(value => value === null)) return null;
  return {
    calories: Number(calories.toFixed(2)),
    proteinG: Number(proteinG.toFixed(2)),
    carbsG: Number(carbsG.toFixed(2)),
    fatG: Number(fatG.toFixed(2))
  };
}

function queryScore(query, description) {
  const queryText = normalizeMatchText(query);
  const descriptionText = normalizeMatchText(description);
  const words = queryText.split(' ').filter(word => word.length > 1 && !['with', 'and', 'style', 'cooked', 'prepared'].includes(word));
  if (!words.length) return 0;
  const descriptionWords = new Set(descriptionText.split(' '));
  const overlap = words.filter(word => descriptionWords.has(word)).length;
  const coverage = overlap / words.length;
  const phraseBonus = descriptionText.includes(queryText) || queryText.includes(descriptionText) ? 0.25 : 0;
  return Math.min(1, coverage + phraseBonus);
}

function candidateFromFood(food, query) {
  const per100g = extractNutrition(food);
  if (!per100g || !Number.isInteger(Number(food.fdcId))) return null;
  const description = String(food.description || '').trim().slice(0, 180);
  const macroCaloriesPer100g = per100g.proteinG * 4 + per100g.carbsG * 4 + per100g.fatG * 9;
  const discrepancyPercent = Math.abs(per100g.calories - macroCaloriesPer100g) / Math.max(per100g.calories, macroCaloriesPer100g, 1) * 100;
  return {
    sourceId: String(food.fdcId),
    description,
    dataType: String(food.dataType || 'FoodData Central'),
    sourceDb: 'USDA FoodData Central',
    matchScore: Number(queryScore(query, description).toFixed(3)),
    per100g,
    calorieCrossCheck: {
      macroCaloriesPer100g: Number(macroCaloriesPer100g.toFixed(1)),
      discrepancyPercent: Number(discrepancyPercent.toFixed(1)),
      mismatch: discrepancyPercent > 20
    }
  };
}

function indianCandidate(food, matchScore = 1) {
  return {
    sourceId: food.sourceId,
    description: food.name,
    dataType: food.dataType,
    sourceDb: 'Indian Nutrient Databank (INDB)',
    primarySource: food.primarySource,
    matchScore: Number(Math.min(1, Math.max(0, matchScore)).toFixed(3)),
    per100g: food.per100g,
    calorieCrossCheck: null
  };
}

function clarifiedMatchScore(name, clarification, description) {
  const nameScore = queryScore(name, description);
  const detailWords = [...new Set(normalizeMatchText(clarification).split(' ').filter(word =>
    word.length > 2 && !['this', 'that', 'with', 'made', 'from', 'using', 'used', 'the', 'and', 'its', 'main', 'ingredients', 'ingredient', 'food', 'dish'].includes(word)
  ))];
  const descriptionWords = new Set(normalizeMatchText(description).split(' '));
  const detailMatches = detailWords.filter(word => descriptionWords.has(word)).length;
  // Two matching descriptive words can identify a clarified dish such as "white sauce"
  // even when the rest of the user's recipe details are absent from the USDA title.
  const detailScore = detailMatches >= 2 ? Math.min(0.86, 0.62 + (detailMatches - 2) * 0.06) : 0;
  const detailBonus = Math.min(0.3, detailMatches * 0.15);
  return Math.min(1, Math.max(nameScore * 0.8 + detailBonus, detailScore));
}

async function fdcRequest(path, options = {}) {
  const apiKey = process.env.FDC_API_KEY?.trim() || 'DEMO_KEY';
  const separator = path.includes('?') ? '&' : '?';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${FDC_BASE_URL}${path}${separator}api_key=${encodeURIComponent(apiKey)}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers }
    });
    if (!response.ok) {
      const error = new Error(response.status === 429
        ? 'USDA FoodData Central rate limit reached. Add an FDC_API_KEY to server/.env or retry later.'
        : 'USDA FoodData Central could not return nutrition data. Retry the lookup.');
      error.status = response.status === 429 ? 429 : 503;
      throw error;
    }
    return await response.json();
  } catch (error) {
    if (error.status) throw error;
    const unavailable = new Error('Could not reach USDA FoodData Central. Check the server connection and retry.');
    unavailable.status = 503;
    throw unavailable;
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchFoodNutrition(query) {
  const cleanQuery = String(query || '').trim().slice(0, 100);
  if (!cleanQuery) return [];
  const cacheKey = cacheKeyForQuery(cleanQuery);
  const cached = await readCache(cacheKey);
  if (Array.isArray(cached) && cached.length) {
    return cached.map(candidate => ({
      ...candidate,
      matchScore: Number(queryScore(cleanQuery, candidate.description).toFixed(3))
    })).sort((left, right) => right.matchScore - left.matchScore);
  }

  // FDC commonly indexes these as plurals even when image models return singular labels.
  const fdcQuery = cleanQuery
    .replace(/\bpistachio\b/gi, 'pistachios')
    .replace(/\bcashew\b/gi, 'cashews');

  const payload = await fdcRequest('/foods/search', {
    method: 'POST',
    body: JSON.stringify({ query: fdcQuery, dataType: SEARCH_TYPES, pageSize: 25 })
  });
  const candidates = (Array.isArray(payload.foods) ? payload.foods : [])
    .map(food => candidateFromFood(food, cleanQuery))
    .filter(Boolean)
    .sort((left, right) => right.matchScore - left.matchScore)
    .slice(0, 10);
  await writeCache(cacheKey, candidates);
  for (const candidate of candidates) await writeCache(`fdc:${candidate.sourceId}`, candidate);
  return candidates;
}

export function searchIndianFoodNutrition(query) {
  const cleanQuery = String(query || '').trim().slice(0, 400);
  if (!cleanQuery) return [];
  const dishGroup = COMPOUND_DISH_GROUPS.find(group => group.query.test(cleanQuery));
  const foods = dishGroup ? INDIAN_FOODS.filter(food => dishGroup.record.test(food.name)) : INDIAN_FOODS;
  return foods.map(food => ({
    ...indianCandidate(food, queryScore(cleanQuery, food.name)),
    _primarySource: food.primarySource
  }))
    .filter(candidate => candidate.matchScore > 0)
    .sort((left, right) => right.matchScore - left.matchScore)
    .slice(0, 10)
    .map(({ _primarySource, ...candidate }) => candidate);
}

export function isIndianFoodContext(value) {
  return INDIAN_CUISINE_MARKER.test(String(value || ''));
}

function bestIndianMatch(name, clarification = '') {
  const cleanName = String(name || '').trim().slice(0, 100);
  const cleanClarification = String(clarification || '').trim().slice(0, 400);
  if (!cleanName) return null;
  const dishGroup = COMPOUND_DISH_GROUPS.find(group => group.query.test(cleanName));
  const foods = dishGroup ? INDIAN_FOODS.filter(food => dishGroup.record.test(food.name)) : INDIAN_FOODS;
  const ranked = foods.map(food => ({
    food,
    score: normalize(cleanName) === normalize(food.name)
      ? 1.2
      : cleanClarification
        ? clarifiedMatchScore(cleanName, cleanClarification, food.name)
        : queryScore(cleanName, food.name)
  })).filter(candidate => candidate.score > 0)
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best || best.score < (cleanClarification ? 0.46 : 0.5)) return null;

  // If near-tied recipe versions differ materially in energy, wait for more detail.
  const runnerUp = ranked[1];
  if (runnerUp && best.score - runnerUp.score < 0.04) {
    const calorieDifference = Math.abs(best.food.per100g.calories - runnerUp.food.per100g.calories) /
      Math.max(best.food.per100g.calories, runnerUp.food.per100g.calories, 1);
    if (calorieDifference > 0.15) {
      const candidates = ranked.slice(0, 5).map(candidate => candidate.food.name.toLowerCase());
      const variants = ['thin', 'medium', 'thick'].filter(variant => candidates.some(candidate => candidate.includes(variant)));
      return {
        needsClarification: true,
        clarificationQuestion: variants.length >= 2
          ? `Which consistency best matches the photo: ${variants.join(', ')}? Add that detail to your description.`
          : 'Which recipe or preparation style best matches this food? Add the detail that distinguishes it.'
      };
    }
  }
  const clarifiedCompositeThreshold = dishGroup && cleanClarification ? 0.54 : 0.58;
  if (best.score < clarifiedCompositeThreshold) return null;
  return indianCandidate(best.food, best.score);
}

export async function matchFoodNutrition(name, clarification = '', context = '') {
  try {
    const cleanName = String(name || '').trim().slice(0, 100);
    const cleanClarification = String(clarification || '').trim().slice(0, 400);
    const cleanContext = String(context || '').trim().slice(0, 200);
    const matchingDetails = [cleanClarification, cleanContext].filter(Boolean).join(' ');
    const indianMatch = bestIndianMatch(cleanName, matchingDetails);
    if (indianMatch) return indianMatch;

    const hasIndianContext = INDIAN_CUISINE_MARKER.test(`${cleanName} ${cleanClarification}`);
    if (hasIndianContext) return null;

    const queries = cleanClarification
      ? [...new Set([cleanName, cleanClarification].filter(Boolean))]
      : [cleanName];
    const searchResults = await Promise.allSettled(queries.map(searchFoodNutrition));
    const candidateLists = searchResults.filter(result => result.status === 'fulfilled').map(result => result.value);
    if (!candidateLists.length && searchResults[0]?.status === 'rejected') throw searchResults[0].reason;
    const byId = new Map();
    for (const candidate of candidateLists.flat()) {
      const score = matchingDetails
        ? clarifiedMatchScore(cleanName, matchingDetails, candidate.description)
        : candidate.matchScore;
      const existing = byId.get(candidate.sourceId);
      if (!existing || score > existing.matchScore) byId.set(candidate.sourceId, { ...candidate, matchScore: Number(score.toFixed(3)) });
    }
    const ranked = [...byId.values()].sort((left, right) => right.matchScore - left.matchScore);
    const best = ranked[0];
    if (!best || best.matchScore < 0.58) return null;
    const runnerUp = ranked[1];
    if (cleanClarification && runnerUp && best.matchScore - runnerUp.matchScore < 0.04) {
      const calorieDifference = Math.abs(best.per100g.calories - runnerUp.per100g.calories) /
        Math.max(best.per100g.calories, runnerUp.per100g.calories, 1);
      if (calorieDifference > 0.15) return null;
    }
    return best;
  } catch (error) {
    return { lookupError: error.message, status: error.status || 503 };
  }
}

export async function getFoodNutritionById(sourceId) {
  const id = String(sourceId || '').trim();
  if (id.startsWith('indb:')) {
    const indianFood = INDIAN_FOODS.find(food => food.sourceId === id);
    if (indianFood) return indianCandidate(indianFood, 1);
    const error = new Error('That Indian recipe is not in the local INDB data file.');
    error.status = 404;
    throw error;
  }
  if (!/^\d{1,12}$/.test(id)) {
    const error = new Error('Choose a valid nutrition database item.');
    error.status = 400;
    throw error;
  }
  const cached = await readCache(`fdc:${id}`);
  if (cached?.per100g && cached.sourceId === id) return cached;

  const food = await fdcRequest(`/food/${encodeURIComponent(id)}`);
  const candidate = candidateFromFood(food, food.description || '');
  if (!candidate) {
    const error = new Error('USDA did not provide complete energy and macro values for that food. Choose another result.');
    error.status = 422;
    throw error;
  }
  candidate.matchScore = 1;
  await writeCache(`fdc:${id}`, candidate);
  return candidate;
}

export function calculateItemNutrition(per100g, grams) {
  const scale = grams / 100;
  return {
    calories: Math.round(per100g.calories * scale),
    proteinG: Number((per100g.proteinG * scale).toFixed(1)),
    carbsG: Number((per100g.carbsG * scale).toFixed(1)),
    fatG: Number((per100g.fatG * scale).toFixed(1))
  };
}

function ingredientProfile(name) {
  return INGREDIENT_PROFILES.find(profile => profile.pattern.test(name));
}

function ingredientSearchQueries(name, preparation, profile) {
  if (profile?.kind !== 'nut') return profile?.queries || [...new Set([`${name} ${preparation}`.trim(), name])];
  const match = `${name} ${preparation}`.match(/\b(almond|cashew|pistachio|walnut|peanut)s?\b/i);
  if (!match) return [name];
  const singular = match[1].toLowerCase();
  const plural = `${singular}s`;
  const text = `${name} ${preparation}`.toLowerCase();
  const roasted = /\b(roast|roasted|toasted)\b/.test(text);
  const unsalted = /\b(unsalted|without salt|no salt)\b/.test(text);
  const form = roasted ? 'dry roasted' : 'raw';
  const salt = unsalted ? ' without salt' : '';
  return [...new Set([`${plural} ${form}`, `${plural} ${form}${salt}`, plural])];
}

async function findIngredientNutrition(name, preparation = '') {
  const cleanName = String(name || '').trim().slice(0, 100);
  const cleanPreparation = String(preparation || '').trim().slice(0, 100);
  if (ZERO_NUTRITION_INGREDIENT.test(cleanName)) {
    return {
      sourceId: 'component:zero',
      description: cleanName,
      sourceDb: 'Recipe ingredient (negligible energy)',
      matchScore: 1,
      per100g: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      calorieCrossCheck: null
    };
  }

  const profile = ingredientProfile(`${cleanName} ${cleanPreparation}`);
  const queries = ingredientSearchQueries(cleanName, cleanPreparation, profile);
  const candidates = new Map();
  let lastError = null;
  for (const query of queries) {
    try {
      const matches = await searchFoodNutrition(query);
      for (const candidate of matches) candidates.set(candidate.sourceId, candidate);
    } catch (error) {
      lastError = error;
      if (error.status === 429) throw error;
    }
    const ranked = [...candidates.values()].filter(candidate => {
      const description = candidate.description || '';
      if (profile && !profile.accepts.test(description)) return false;
      if (profile?.requires && !profile.requires.test(description)) return false;
      if (profile?.excludes?.test(description)) return false;
      const preparationText = `${cleanName} ${cleanPreparation}`;
      if (profile?.kind === 'nut' && /\b(unsalted|without salt|no salt)\b/i.test(preparationText) &&
          /\bsalted\b/i.test(description) && !/\b(unsalted|without salt|no salt)\b/i.test(description)) return false;
      if (profile?.kind === 'nut' && /\b(raw|unroasted)\b/i.test(preparationText) && /\b(roasted|toasted)\b/i.test(description)) return false;
      if (profile?.kind === 'nut' && /\b(roast|roasted|toasted)\b/i.test(preparationText) &&
          !/\b(roasted|toasted)\b/i.test(description)) return false;
      if (profile?.kind === 'sprouted-mung' && /\b(cooked|boiled)\b/i.test(preparationText) &&
          /\b(raw|uncooked)\b/i.test(description)) return false;
      if (!profile && /\b(salad|soup|curry|dish|meal|recipe|flavored|flavoured)\b/i.test(description)) return false;
      return true;
    }).map(candidate => {
      const description = candidate.description || '';
      const profileBonus = profile?.prefers?.test(description) ? 0.3 : 0;
      return { candidate, score: candidate.matchScore + profileBonus };
    }).sort((left, right) => right.score - left.score);
    if (ranked[0] && (ranked[0].candidate.matchScore >= 0.5 || profile?.prefers?.test(ranked[0].candidate.description || ''))) {
      return { ...ranked[0].candidate, matchScore: Math.min(1, Number(ranked[0].score.toFixed(3))) };
    }
  }
  if (!candidates.size && lastError?.status) throw lastError;
  const notFound = new Error(`No reliable nutrition database entry was found for ${cleanName}. Try a more common ingredient name.`);
  notFound.status = 422;
  throw notFound;
}

export async function matchCommonFoodNutrition(name, clarification = '', context = '') {
  const cleanName = String(name || '').trim().slice(0, 100);
  const cleanClarification = String(clarification || '').trim().slice(0, 400);
  const combined = `${cleanName} ${cleanClarification} ${context}`;
  const nut = cleanName.match(/\b(almond|cashew|pistachio|walnut|peanut)s?\b/i);
  const nutTypes = new Set((combined.match(/\b(?:almond|cashew|pistachio|walnut|peanut)s?\b/gi) || [])
    .map(value => value.toLowerCase().replace(/s$/, '')));
  if (nut && nutTypes.size === 1 && !/\b(butter|flour|milk|paste|oil|candy|chocolate|bar|ladoo|curry|sauce|chutney|salad|with|and|mix|mixed)\b/i.test(combined)) {
    const canonical = nut[1].toLowerCase();
    const roasted = /\b(roast|roasted|toasted)\b/i.test(combined);
    const salt = /\b(unsalted|without salt|no salt)\b/i.test(combined) ? ' unsalted' : '';
    const candidate = await findIngredientNutrition(`${canonical}s`, `${roasted ? 'dry roasted' : 'raw'}${salt}`);
    return { ...candidate, displayName: cleanName, recipeCompositionEstimated: false, category: 'protein or legumes' };
  }

  const preparationText = `${cleanClarification} ${context}`;
  const hasAddedOil = /\boil\b/i.test(cleanClarification) && !/\b(no oil|without oil)\b/i.test(cleanClarification);
  if (/\b(moong|mung|green gram)\b/i.test(combined) && /\b(sprout|sprouts|sprouted)\b/i.test(combined) &&
      /\b(boil|boiled|plain|no oil|without oil|steam|steamed)\b/i.test(preparationText) &&
      !hasAddedOil && !/\b(curry|masala|tadka|fried|fry|spicy|seasoning|with|and)\b/i.test(cleanClarification)) {
    const candidate = await findIngredientNutrition('sprouted mung beans', 'boiled cooked plain');
    return { ...candidate, displayName: 'Boiled moong sprouts', recipeCompositionEstimated: false, category: 'protein or legumes' };
  }

  return null;
}

export async function estimateRecipeNutrition(ingredients) {
  if (!Array.isArray(ingredients) || ingredients.length < 1 || ingredients.length > 10) {
    const error = new Error('The ingredient breakdown is incomplete. Add the main ingredients and retry.');
    error.status = 422;
    throw error;
  }
  const normalizedIngredients = ingredients.map(ingredient => ({
    ...ingredient,
    gramsPer100g: Number(ingredient?.gramsPer100g ?? ingredient?.grams_per_100g)
  }));
  if (normalizedIngredients.some(ingredient => !ingredient.name || !Number.isFinite(ingredient.gramsPer100g) || ingredient.gramsPer100g <= 0 || ingredient.gramsPer100g > 100)) {
    const error = new Error('The ingredient breakdown has invalid portion weights. Add the food details again.');
    error.status = 422;
    throw error;
  }
  const components = [];
  for (let index = 0; index < normalizedIngredients.length; index += 3) {
    const batch = await Promise.all(normalizedIngredients.slice(index, index + 3).map(async ingredient => {
    let food;
    try {
      food = await findIngredientNutrition(ingredient.name, ingredient.preparation);
    } catch (error) {
      if (error.status !== 422 || Number(ingredient.gramsPer100g) > 4) throw error;
      food = {
        sourceId: 'component:trace',
        description: `${ingredient.name} (trace amount; omitted)`,
        sourceDb: 'Trace ingredient estimate',
        matchScore: 0.7,
        per100g: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
      };
    }
      return {
        name: String(ingredient.name).trim().slice(0, 100),
        gramsPer100g: Number(ingredient.gramsPer100g),
        preparation: String(ingredient.preparation || '').trim().slice(0, 100),
        sourceId: food.sourceId,
        sourceDb: food.sourceDb,
        sourceDescription: food.description,
        per100g: food.per100g,
        matchScore: food.matchScore
      };
    }));
    components.push(...batch);
  }
  const nutrition = combineNutritionComponents(components);
  const databases = [...new Set(components.map(component => component.sourceDb))];
  const sourceDb = `Ingredient estimate (${databases.join(' + ')})`.slice(0, 80);
  const description = `Ingredient-based estimate: ${components.map(component => `${component.name} ${Math.round(component.gramsPer100g)}%`).join(', ')}`.slice(0, 180);
  const macroCaloriesPer100g = nutrition.proteinG * 4 + nutrition.carbsG * 4 + nutrition.fatG * 9;
  const discrepancyPercent = Math.abs(nutrition.calories - macroCaloriesPer100g) / Math.max(nutrition.calories, macroCaloriesPer100g, 1) * 100;
  return {
    sourceId: '',
    description,
    sourceDb,
    matchScore: Number(Math.min(...components.map(component => component.matchScore)).toFixed(3)),
    per100g: nutrition,
    calorieCrossCheck: {
      macroCaloriesPer100g: Number(macroCaloriesPer100g.toFixed(1)),
      discrepancyPercent: Number(discrepancyPercent.toFixed(1)),
      mismatch: discrepancyPercent > 20
    },
    nutritionComponents: components,
    recipeCompositionEstimated: true
  };
}

export async function estimateDescribedRecipeNutrition(name, description, preparation = '') {
  const detailText = String(description || '').toLowerCase();
  const text = `${name} ${description} ${preparation}`.toLowerCase();
  let detected = DESCRIBED_INGREDIENTS.filter(item => item.pattern.test(text));
  if (detected.some(item => item.name === 'processed cheese')) detected = detected.filter(item => item.name !== 'cheese');
  detected = detected.slice(0, 9);
  let explicitlyNamed = DESCRIBED_INGREDIENTS.filter(item => item.pattern.test(detailText));
  if (explicitlyNamed.some(item => item.name === 'processed cheese')) explicitlyNamed = explicitlyNamed.filter(item => item.name !== 'cheese');
  const plainSprouts = /\b(boil|boiled|plain|steam|steamed|no oil|without oil)\b/i.test(detailText) &&
    /\b(moong|mung|green gram)\b.*\b(sprout|sprouted|sprouts)\b|\b(sprout|sprouted|sprouts)\b.*\b(moong|mung|green gram)\b/i.test(text);
  if (explicitlyNamed.length < 2 && !plainSprouts) return null;
  if (!detected.length) return null;

  const yogurt = detected.some(item => item.name === 'plain yogurt');
  const raisins = detected.some(item => item.name === 'raisins, dried');
  const nuts = detected.filter(item => ['pistachios', 'cashews', 'almonds', 'walnuts', 'peanuts'].includes(item.name));
  const flatbread = /\b(paratha|parantha|roti|chapati)\b/i.test(name);
  const pastaSauce = detected.some(item => item.name === 'pasta, cooked') && /\b(sauce|creamy)\b/i.test(text);
  const ingredients = detected.map(item => ({ name: item.name, gramsPer100g: 0, preparation: item.preparation }));

  if (plainSprouts && detected.length === 1) {
    ingredients[0].gramsPer100g = 100;
  } else if (yogurt && (raisins || nuts.length)) {
    const raisinShare = raisins ? 16 : 0;
    const nutShare = nuts.length ? (raisins ? (nuts.length > 1 ? 8 : 12) : 20 / nuts.length) : 0;
    const namedExtras = ingredients.filter(item => item.name !== 'plain yogurt' && item.name !== 'raisins, dried' && !nuts.some(nut => nut.name === item.name));
    const extraShare = namedExtras.length ? 8 / namedExtras.length : 0;
    for (const ingredient of ingredients) {
      ingredient.gramsPer100g = ingredient.name === 'plain yogurt'
        ? 100 - raisinShare - nutShare * nuts.length - extraShare * namedExtras.length
        : ingredient.name === 'raisins, dried' ? raisinShare
          : nuts.some(nut => nut.name === ingredient.name) ? nutShare : extraShare;
    }
  } else if (pastaSauce) {
    const shares = { 'pasta, cooked': 52, 'corn starch': 3, milk: 20, cheese: 12, 'processed cheese': 12, capsicum: 9, 'tomatoes, raw': 9, 'onions, raw': 5, 'garlic, raw': 1, 'cooking oil': 4, ghee: 4 };
    for (const ingredient of ingredients) ingredient.gramsPer100g = shares[ingredient.name] ?? 5;
  } else if (flatbread && ingredients.some(item => /flour/.test(item.name))) {
    const flours = ingredients.filter(item => /flour/.test(item.name));
    for (const ingredient of ingredients) {
      const role = detected.find(item => item.name === ingredient.name)?.role;
      ingredient.gramsPer100g = /flour/.test(ingredient.name) ? (flours.length > 1 ? 58 : 62) / flours.length
        : ingredient.name === 'cooking oil' || ingredient.name === 'ghee' ? 6
          : ingredient.name === 'garlic, raw' ? 1
            : ['protein', 'dairy', 'vegetable'].includes(role) ? 8
              : role === 'garnish' ? 5
                : role === 'base' ? 10 : 0;
    }
  } else {
    const roleWeights = detected.some(item => item.role === 'staple')
      ? { staple: 58, protein: 18, dairy: 12, base: 10, vegetable: 10, garnish: 8, fat: 4, seasoning: 1 }
      : detected.some(item => item.role === 'base')
        ? { base: 68, staple: 8, protein: 8, dairy: 8, vegetable: 8, garnish: 12, fat: 3, seasoning: 1 }
        : { protein: 55, dairy: 10, base: 8, vegetable: 20, garnish: 10, fat: 4, seasoning: 1, staple: 20 };
    const roleCounts = detected.reduce((counts, item) => ({ ...counts, [item.role]: (counts[item.role] || 0) + 1 }), {});
    for (const ingredient of ingredients) {
      const role = detected.find(item => item.name === ingredient.name)?.role;
      ingredient.gramsPer100g = (roleWeights[role] || 0) / Math.max(1, roleCounts[role] || 1);
    }
  }

  let total = ingredients.reduce((sum, item) => sum + item.gramsPer100g, 0);
  if (total > 100) {
    const scale = 100 / total;
    for (const ingredient of ingredients) ingredient.gramsPer100g *= scale;
    total = 100;
  }
  if (total < 100) ingredients.push({ name: 'retained water', gramsPer100g: 100 - total, preparation: 'estimated moisture' });

  const estimate = await estimateRecipeNutrition(ingredients);
  return {
    ...estimate,
    displayName: String(name || 'Yogurt with nuts and raisins').trim().slice(0, 100),
    recipeCompositionConfidence: 0.5,
    nutritionNotes: 'Ingredient proportions were estimated from the named foods and typical recipe roles because exact recipe weights were not supplied.'
  };
}

export function combineNutritionComponents(components) {
  if (!Array.isArray(components) || !components.length || components.length > 10) {
    const error = new Error('The saved ingredient nutrition is invalid. Recalculate the food details.');
    error.status = 422;
    throw error;
  }
  const total = components.reduce((sum, component) => sum + Number(component.gramsPer100g || 0), 0);
  if (Math.abs(total - 100) > 1) {
    const error = new Error('The saved ingredient weights do not add up to 100 g. Recalculate the food details.');
    error.status = 422;
    throw error;
  }
  const per100g = components.reduce((sum, component) => {
    const share = Number(component.gramsPer100g) / 100;
    const nutrition = component.per100g || {};
    for (const key of ['calories', 'proteinG', 'carbsG', 'fatG']) {
      const value = Number(nutrition[key]);
      if (!Number.isFinite(value) || value < 0) {
        const error = new Error('A saved ingredient has invalid database nutrition. Recalculate the food details.');
        error.status = 422;
        throw error;
      }
      sum[key] += value * share;
    }
    return sum;
  }, { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  return Object.fromEntries(Object.entries(per100g).map(([key, value]) => [key, Number(value.toFixed(2))]));
}
