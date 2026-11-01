import { useEffect, useRef, useState } from 'react';
import { Activity, Apple, Camera, Check, Flame, ImagePlus, Plus, Search, Trash2, X } from 'lucide-react';
import { api, apiError } from '../api';
import MetricCard from '../components/MetricCard';

const emptyDay = { totals: { calories: 0, calorieRange: { min: 0, max: 0 }, proteinG: 0, carbsG: 0, fatG: 0 }, logs: [], drafts: [] };
const foodCategories = ['staple', 'protein or legumes', 'vegetable', 'fruit', 'dairy', 'condiment or side', 'dessert', 'beverage', 'prepared dish'];

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateLabel(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function Wellness() {
  const [calc, setCalc] = useState({ heightCm: 170, weightKg: 70, age: 30, gender: 'female', activityLevel: 'moderate', goal: 'maintain' });
  const [result, setResult] = useState(null);
  const [meal, setMeal] = useState('breakfast');
  const [description, setDescription] = useState('');
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [image, setImage] = useState(null);
  const imageInput = useRef(null);
  const [preview, setPreview] = useState('');
  const [estimate, setEstimate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [day, setDay] = useState(emptyDay);
  const [selectedDate, setSelectedDate] = useState(localDateString);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [foodMatches, setFoodMatches] = useState({});
  const [searchErrors, setSearchErrors] = useState({});
  const [searchingIndex, setSearchingIndex] = useState(null);
  const [resolvingIndex, setResolvingIndex] = useState(null);

  async function calculate(event) {
    event?.preventDefault();
    try {
      const { data } = await api.post('/wellness/calculate', calc);
      setResult(data);
    } catch (requestError) {
      setError(apiError(requestError));
    }
  }

  async function loadFood(date = selectedDate) {
    try {
      const { data } = await api.get('/wellness/food', {
        params: { date, timezoneOffset: new Date().getTimezoneOffset() }
      });
      setDay(data);
      setEstimate(current => current || data.drafts?.[0] || null);
    } catch (requestError) {
      setError(apiError(requestError));
    }
  }

  async function loadHistory() {
    try {
      const { data } = await api.get('/wellness/food/history', {
        params: { date: localDateString(), days: 7, timezoneOffset: new Date().getTimezoneOffset() }
      });
      setHistory(data.days || []);
    } catch (requestError) {
      setError(apiError(requestError));
    }
  }

  useEffect(() => {
    calculate();
    loadHistory();
  }, []);

  useEffect(() => {
    loadFood(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    if (!preview) return undefined;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  function selectImage(file) {
    setImage(file || null);
    setPreview(file ? URL.createObjectURL(file) : '');
    if (imageInput.current) imageInput.current.value = '';
    setPrivacyConsent(false);
    setFoodMatches({});
    setSearchErrors({});
    setMessage('');
    setError('');
  }

  async function analyzeAndLog(event) {
    event.preventDefault();
    if (!image) return;

    setBusy(true);
    setError('');
    setMessage('');
    const form = new FormData();
    form.append('image', image);
    form.append('meal', meal);
    form.append('description', description.trim());
    form.append('consent', String(privacyConsent));

    try {
      const { data } = await api.post('/wellness/food', form);
      setEstimate(data.log);
      setFoodMatches({});
      setSearchErrors({});
      setMessage('Photo analyzed. Review the foods and portions before adding them to your log.');
      setImage(null);
      setPreview('');
      if (imageInput.current) imageInput.current.value = '';
    } catch (requestError) {
      setError(apiError(requestError));
    } finally {
      setBusy(false);
    }
  }

  function updateFood(index, changes) {
    setEstimate(current => current ? {
      ...current,
      foods: current.foods.map((food, foodIndex) => foodIndex === index ? { ...food, ...changes } : food)
    } : current);
  }

  async function searchNutrition(index) {
    const food = estimate?.foods[index];
    const query = food?.name?.trim().slice(0, 100);
    if (!query) return;
    setSearchingIndex(index);
    setSearchErrors(current => ({ ...current, [index]: '' }));
    setFoodMatches(current => ({ ...current, [index]: undefined }));
    try {
      const { data } = await api.get('/wellness/nutrition/search', {
        params: { q: query, method: food.cookingMethod || '' }
      });
      const candidates = data.results || [];
      const first = candidates[0];
      const second = candidates[1];
      if (first && first.matchScore >= 0.9 && (!second || first.matchScore - second.matchScore >= 0.15)) {
        chooseNutrition(index, first);
      } else {
        setFoodMatches(current => ({ ...current, [index]: candidates }));
      }
    } catch (requestError) {
      setSearchErrors(current => ({ ...current, [index]: apiError(requestError) }));
    } finally {
      setSearchingIndex(null);
    }
  }

  function chooseNutrition(index, candidate) {
    updateFood(index, {
      name: candidate.description,
      sourceId: candidate.sourceId,
      sourceDescription: candidate.description,
      sourceDb: candidate.sourceDb || candidate.dataType || 'USDA FoodData Central',
      nutritionPer100g: candidate.per100g,
      nutritionComponents: [],
      nutritionNotes: '',
      nutritionConfidenceScore: candidate.matchScore,
      calorieCrossCheck: candidate.calorieCrossCheck,
      nutritionMatchStatus: 'matched',
      nutritionMatchScore: candidate.matchScore,
      needsClarification: false,
      clarificationQuestion: ''
    });
    setFoodMatches(current => ({ ...current, [index]: undefined }));
    setSearchErrors(current => ({ ...current, [index]: '' }));
    setMessage(`${candidate.description} selected from ${candidate.sourceDb || candidate.dataType}. Review its portion and calculated calories.`);
  }

  async function resolveClarification(index) {
    const food = estimate?.foods[index];
    if (!food || !food.userClarification?.trim()) {
      setError('Add the food type or its main ingredients before calculating nutrition.');
      return;
    }
    setResolvingIndex(index);
    setError('');
    setMessage('');
    try {
      const { data } = await api.post(`/wellness/food/${estimate._id}/clarify`, {
        analysisItemId: food.analysisItemId,
        name: food.name,
        userClarification: food.userClarification.trim(),
        gramsFinal: Number(food.gramsFinal)
      });
      setEstimate({
        ...data.log,
        foods: data.log.foods.map((item, itemIndex) => itemIndex === index && data.needsNutritionMatch
          ? { ...item, clarificationAttempted: true }
          : item)
      });
      setFoodMatches(current => ({ ...current, [index]: undefined }));
      setMessage(data.calculatedFromIngredients
        ? `Calculated ${food.name} from its described ingredients using nutrition database values. Review the assumptions and portion before saving.`
        : data.needsNutritionMatch
        ? `I could not match the whole dish automatically. Add the requested recipe details or search the available nutrition records for ${food.name}.`
        : data.needsClarification
          ? `One more detail is needed for ${food.name}: ${data.log.foods[index]?.clarificationQuestion || 'please specify the preparation style.'}`
          : `Nutrition was matched automatically for ${food.name}. Review its portion and calories.`);
    } catch (requestError) {
      updateFood(index, { clarificationAttempted: true });
      setError(apiError(requestError));
    } finally {
      setResolvingIndex(null);
    }
  }

  function addFood() {
    setEstimate(current => current ? {
      ...current,
      foods: [...current.foods, {
        analysisItemId: null,
        name: '',
        category: 'prepared dish',
        portion: 'Added by user',
        estimatedGrams: null,
        gramsFinal: 100,
        gramsRange: { min: 100, max: 100 },
        nutritionMatchStatus: 'missing'
      }]
    } : current);
  }

  function removeFood(index) {
    setEstimate(current => current ? { ...current, foods: current.foods.filter((_, foodIndex) => foodIndex !== index) } : current);
    setFoodMatches({});
    setSearchErrors({});
  }

  async function confirmMeal() {
    if (!estimate?._id) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.patch(`/wellness/food/${estimate._id}`, {
        foods: estimate.foods.map(food => ({
          analysisItemId: food.analysisItemId,
          sourceId: food.sourceId,
          name: food.name,
          category: food.category,
          gramsFinal: Number(food.gramsFinal),
          userClarification: food.userClarification || ''
        }))
      });
      setEstimate(null);
      setFoodMatches({});
      setSearchErrors({});
      const today = localDateString();
      setSelectedDate(today);
      setMessage('Reviewed meal added to your intake.');
      await Promise.all([loadFood(today), loadHistory()]);
    } catch (requestError) {
      setError(apiError(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function discardReview() {
    if (!estimate?._id) return;
    try {
      await api.delete(`/wellness/food/${estimate._id}`);
      setEstimate(null);
      setFoodMatches({});
      setSearchErrors({});
      setMessage('Meal review discarded.');
      await loadFood();
    } catch (requestError) {
      setError(apiError(requestError));
    }
  }

  const remaining = result ? result.targetCalories - day.totals.calories : null;
  const targetCalories = Number(result?.targetCalories) || 0;
  const dayProgress = targetCalories ? Math.min(100, Math.round(day.totals.calories / targetCalories * 100)) : 0;
  const maxHistoryCalories = Math.max(targetCalories, ...history.map(item => item.calories), 1);
  const viewingToday = selectedDate === localDateString();
  const hasWideMealEstimate = day.logs.some(food => food.calorieRange &&
    food.calorieRange.max - food.calorieRange.min > Math.max(50, food.calories * 0.2));
  const reviewTotals = estimate?.foods?.reduce((totals, food) => {
    const per100 = food.nutritionPer100g;
    if (!per100) return { ...totals, missing: totals.missing + 1 };
    const grams = Number(food.gramsFinal) || 0;
    const originalRange = food.gramsRange || { min: grams, max: grams };
    const range = { min: Math.min(originalRange.min, grams), max: Math.max(originalRange.max, grams) };
    return {
      calories: totals.calories + per100.calories * grams / 100,
      min: totals.min + per100.calories * range.min / 100,
      max: totals.max + per100.calories * range.max / 100,
      proteinG: totals.proteinG + per100.proteinG * grams / 100,
      carbsG: totals.carbsG + per100.carbsG * grams / 100,
      fatG: totals.fatG + per100.fatG * grams / 100,
      missing: totals.missing
    };
  }, { calories: 0, min: 0, max: 0, proteinG: 0, carbsG: 0, fatG: 0, missing: 0 }) || { calories: 0, min: 0, max: 0, proteinG: 0, carbsG: 0, fatG: 0, missing: 0 };

  return <>
    <div className="page-header">
      <div>
        <span className="eyebrow">Wellness tools</span>
        <h1>BMI, calorie target &amp; food tracking</h1>
        <p>Identify separate foods and categories, then estimate nutrition from a meal photo.</p>
      </div>
    </div>

    {error && <div className="alert error">{error}</div>}
    {message && <div className="notice" role="status">{message}</div>}

    {result && <div className="metrics">
      <MetricCard label="BMI" value={result.bmi} hint={result.bmiCategory}/>
      <MetricCard label="Estimated TDEE" value={`${result.tdee} kcal`} hint="Approx. maintenance energy"/>
      <MetricCard label="Daily target" value={`${result.targetCalories} kcal`} hint="Approximate personalized goal"/>
    </div>}

    <div className="grid two">
      <form className="card form-card" onSubmit={calculate}>
        <div className="section-title">
          <div><h2>Energy calculator</h2><p>Mifflin-St Jeor BMR + activity factor.</p></div>
          <Activity/>
        </div>
        <div className="form-row">
          <label>Height (cm)<input type="number" value={calc.heightCm} onChange={event => setCalc({ ...calc, heightCm: event.target.value })}/></label>
          <label>Weight (kg)<input type="number" value={calc.weightKg} onChange={event => setCalc({ ...calc, weightKg: event.target.value })}/></label>
        </div>
        <div className="form-row">
          <label>Age<input type="number" value={calc.age} onChange={event => setCalc({ ...calc, age: event.target.value })}/></label>
          <label>Sex used by formula<select value={calc.gender} onChange={event => setCalc({ ...calc, gender: event.target.value })}>
            <option value="female">Female</option><option value="male">Male</option><option value="other">Other/average constant</option>
          </select></label>
        </div>
        <label>Activity<select value={calc.activityLevel} onChange={event => setCalc({ ...calc, activityLevel: event.target.value })}>
          <option value="sedentary">Sedentary</option><option value="light">Light</option><option value="moderate">Moderate</option><option value="active">Active</option><option value="very_active">Very active</option>
        </select></label>
        <label>Goal<select value={calc.goal} onChange={event => setCalc({ ...calc, goal: event.target.value })}>
          <option value="lose">Gradual loss</option><option value="maintain">Maintain</option><option value="gain">Gradual gain</option>
        </select></label>
        <button className="primary"><Flame size={17}/>Calculate</button>
        {result && <div className="notice">BMR {result.bmr} kcal/day. {result.note}</div>}
      </form>

      <form className="card form-card" onSubmit={analyzeAndLog}>
        <div className="section-title">
          <div><h2>Log from a photo</h2><p>Identify Indian recipes where available and estimate each portion from the image.</p></div>
          <Apple/>
        </div>

        <label>Meal<select value={meal} onChange={event => setMeal(event.target.value)}>
          <option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option><option value="snack">Snack</option>
        </select></label>

        <label>Food description (optional)<textarea maxLength={400} rows={3} value={description} onChange={event => setDescription(event.target.value)} placeholder="For example: rice, dal and paneer curry"/></label>

        <label className="food-photo-label">
          <span>Meal photo</span>
          <span className="food-photo-input"><ImagePlus size={18}/><span>{image ? image.name : 'Choose or take a photo'}</span></span>
          <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required={!image} onChange={event => selectImage(event.target.files?.[0])}/>
        </label>

        {preview && <div className="food-photo-preview">
          <img src={preview} alt="Selected meal"/>
          <button type="button" className="icon-btn" aria-label="Remove selected photo" onClick={() => selectImage(null)}><X size={18}/></button>
        </div>}

        <label className="food-consent"><input type="checkbox" checked={privacyConsent} onChange={event => setPrivacyConsent(event.target.checked)}/><span>I agree to send this compressed meal photo, optional description, and any food clarification answers to the configured vision provider. Google Gemini is the default; if its free tier is used, Google may use submitted content to improve its products. The app removes image metadata and does not store the photo.</span></label>

        <button className="primary" disabled={busy || !image || !privacyConsent || Boolean(estimate)}>
          <Camera size={17}/>{busy ? 'Analyzing meal…' : 'Analyze photo & review'}
        </button>
        {estimate && <small className="needs-match">Finish or discard the open meal review before analyzing another photo.</small>}
        <div className="notice">The vision model identifies foods and estimates each portion from the image. Review the gram estimate before saving; depth, plate scale and hidden ingredients can affect it.</div>
      </form>
    </div>

    {estimate && <section className="card food-estimate-card" aria-live="polite">
      <div className="section-title">
        <div><h2>Review meal estimate</h2><p>AI model: {estimate.aiModelVersion || 'vision model'} · visual confidence: {estimate.confidence}</p></div>
        <strong>{reviewTotals.missing ? 'Nutrition needed' : `${Math.round(reviewTotals.min)}–${Math.round(reviewTotals.max)} kcal`}</strong>
      </div>
      {estimate.needsClarification && <div className="notice">Answer the question shown for each uncertain food. Clear food items need no extra details.</div>}
      <div className="food-review-list">
        {estimate.foods.map((food, index) => <div className="food-review-item" key={food.analysisItemId || `added-${index}`}>
          <div className="food-review-heading"><b>Food {index + 1}</b><button type="button" className="icon-btn danger" aria-label={`Remove food ${index + 1}`} onClick={() => removeFood(index)}><Trash2 size={17}/></button></div>
          <div className="form-row">
            <label>Food name<input value={food.name} placeholder="Search a food" onChange={event => {
              updateFood(index, { name: event.target.value, sourceId: '', sourceDescription: '', sourceDb: '', nutritionPer100g: null, nutritionComponents: [], nutritionNotes: '', calorieCrossCheck: null, nutritionMatchStatus: 'missing' });
              setFoodMatches(current => ({ ...current, [index]: undefined }));
              setSearchErrors(current => ({ ...current, [index]: '' }));
            }}/></label>
            <label>Category<select value={food.category || 'prepared dish'} onChange={event => updateFood(index, { category: event.target.value })}>{foodCategories.map(category => <option key={category} value={category}>{category}</option>)}</select></label>
          </div>
          {food.needsClarification && <div className="food-clarification">
            <label>{food.clarificationQuestion || 'What is this food, and what are its main ingredients?'}
              <textarea maxLength={400} rows={2} value={food.userClarification || ''} onChange={event => updateFood(index, { userClarification: event.target.value, clarificationAttempted: false })} placeholder="For example: thick white sauce made with milk, butter and flour"/>
            </label>
            <button type="button" className="ghost small" disabled={resolvingIndex === index || !food.userClarification?.trim()} onClick={() => resolveClarification(index)}>
              {resolvingIndex === index ? 'Calculating nutrition…' : 'Calculate from my ingredients'}
            </button>
            <small>Your description is interpreted as ingredients and estimated proportions, then calories and macros are calculated from nutrition database entries. Exact recipe amounts remain estimates.</small>
          </div>}
          <div className="food-search-row">
            {(!food.needsClarification || food.clarificationAttempted) && <button type="button" className="ghost small" disabled={searchingIndex === index || !food.name?.trim()} onClick={() => searchNutrition(index)}><Search size={15}/>{searchingIndex === index ? 'Searching…' : food.needsClarification ? 'Search food databases' : 'Search nutrition database'}</button>}
            {food.nutritionPer100g && <span>{food.sourceDb || 'Nutrition source'}: {food.sourceDescription || food.name} · {Math.round(food.nutritionPer100g.calories)} kcal / 100 g</span>}
            {!food.nutritionPer100g && <span className="needs-match">{food.needsClarification && !food.userClarification?.trim() ? 'Food recognized; answer this item’s question to match nutrition' : 'Food recognized from photo; nutrition match needed'}</span>}
          </div>
          {food.calorieCrossCheck?.mismatch && <small className="needs-match">Database energy differs by {food.calorieCrossCheck.discrepancyPercent}% from the 4/4/9 macro check; the database calorie value is used.</small>}
          {food.nutritionComponents?.length > 0 && <small>{food.nutritionNotes || 'Ingredient proportions and cooking fat are estimated from your answer and the cooking method.'} Ingredient proportions affect the estimate; database nutrition confidence is {Math.round((food.nutritionConfidenceScore || 0) * 100)}%. The calorie range includes extra allowance for recipe uncertainty.</small>}
          {food.nutritionNotes && !food.nutritionComponents?.length && <small>{food.nutritionNotes}</small>}
          {searchErrors[index] && <small className="needs-match">Nutrition search failed: {searchErrors[index]}</small>}
          {foodMatches[index]?.length > 0 && <div className="nutrition-candidates">{foodMatches[index].map(candidate => <button type="button" key={candidate.sourceId} aria-label={`Select ${candidate.description} as the nutrition match`} onClick={() => chooseNutrition(index, candidate)}><b>{candidate.description}</b><small>Tap to select · {candidate.sourceDb || candidate.dataType} · {Math.round(candidate.per100g.calories)} kcal / 100 g · match {Math.round(candidate.matchScore * 100)}%</small></button>)}</div>}
          {foodMatches[index]?.length === 0 && <small className="needs-match">No usable nutrition entry was returned. Try a common alternate name or add its preparation, such as raw or dry roasted.</small>}
          <div className="food-review-details">
            <div className="portion-editor">
              <label>Photo-estimated portion (g)<input type="number" min="1" max="5000" step="1" value={food.gramsFinal ?? ''} onChange={event => updateFood(index, { gramsFinal: event.target.value })}/></label>
              {food.estimatedGrams && Number(food.gramsFinal) !== Number(food.estimatedGrams) && <button type="button" className="ghost small" onClick={() => updateFood(index, { gramsFinal: food.estimatedGrams })}>Use photo estimate ({food.estimatedGrams} g)</button>}
            </div>
            <div><small>Image estimate: {food.estimatedGrams ? `${food.estimatedGrams} g` : 'user added'}{(food.gramsRangeAi || food.gramsRange) ? ` · range ${(food.gramsRangeAi || food.gramsRange).min}–${(food.gramsRangeAi || food.gramsRange).max} g` : ''}</small><small>{food.cookingMethod || food.portion || 'Portion estimated from photo'} · {Math.round((food.confidenceScore || 0) * 100)}% visual confidence</small></div>
            {food.nutritionPer100g && <b>{Math.round(food.nutritionPer100g.calories * (Number(food.gramsFinal) || 0) / 100)} kcal</b>}
          </div>
        </div>)}
      </div>
      <button type="button" className="ghost small" onClick={addFood}><Plus size={15}/>Add food item</button>
      <div className="food-review-totals">
        <b>{reviewTotals.missing ? `${reviewTotals.missing} item${reviewTotals.missing === 1 ? '' : 's'} need a nutrition match` : `Estimated meal: ${Math.round(reviewTotals.min)}–${Math.round(reviewTotals.max)} kcal`}</b>
        <span>{reviewTotals.missing ? 'Matched items only: ' : 'Using portions above: '}{Math.round(reviewTotals.calories)} kcal · P {reviewTotals.proteinG.toFixed(1)} g · C {reviewTotals.carbsG.toFixed(1)} g · F {reviewTotals.fatG.toFixed(1)} g</span>
      </div>
      {estimate.analysisNotes && <div className="notice">Estimate notes: {estimate.analysisNotes}</div>}
      <div className="food-review-actions"><button type="button" className="primary" disabled={busy || !estimate.foods.length || reviewTotals.missing > 0 || estimate.foods.some(food => !Number.isInteger(Number(food.gramsFinal)) || Number(food.gramsFinal) < 1 || Number(food.gramsFinal) > 5000)} onClick={confirmMeal}><Check size={17}/>{busy ? 'Saving…' : 'Confirm and log meal'}</button><button type="button" className="ghost" disabled={busy} onClick={discardReview}>Discard review</button></div>
      <div className="notice">Indian Nutrient Databank values are preferred for matching Indian recipes; USDA FoodData Central is used for other foods. Calories are calculated from database values and the photo-estimated grams. Recipe, oil, depth and hidden ingredients can still affect actual nutrition.</div>
    </section>}

    <section className="card calorie-history-card">
      <div className="section-title calorie-history-heading">
        <div><h2>{viewingToday ? 'Today’s intake' : `Intake for ${dateLabel(selectedDate)}`}</h2><p>Daily calories and macros from meals you have logged.</p></div>
        <label className="history-date-field">View date<input type="date" value={selectedDate} max={localDateString()} onChange={event => { if (event.target.value) setSelectedDate(event.target.value); }}/></label>
      </div>

      <div className="calorie-history" aria-label="Calories logged over the last seven days">
        {history.map(item => {
          const height = item.calories ? Math.max(4, Math.round(item.calories / maxHistoryCalories * 100)) : 0;
          return <button type="button" className={`history-day${selectedDate === item.date ? ' active' : ''}`} key={item.date} onClick={() => setSelectedDate(item.date)} aria-label={`${dateLabel(item.date)}: ${item.calories} calories${item.calorieRange ? `, estimated range ${item.calorieRange.min} to ${item.calorieRange.max}` : ''}`} aria-pressed={selectedDate === item.date}>
            <span className="history-calories">{item.calories}</span>
            <span className="history-bar"><span style={{ height: `${height}%` }}/></span>
            <span className="history-date-label">{new Date(`${item.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</span>
          </button>;
        })}
      </div>

      <div className="calorie-day-summary">
        <div className="calorie-day-numbers">
          <div><small>Estimated intake</small><strong>{day.totals.calories} kcal</strong><small>{day.totals.calorieRange ? `Likely range ${day.totals.calorieRange.min}–${day.totals.calorieRange.max} kcal` : 'Based on logged portions'}</small></div>
          <div><small>Daily target</small><strong>{targetCalories ? `${targetCalories} kcal` : 'Not set'}</strong></div>
          {targetCalories > 0 && <div className="calorie-remaining"><small>{remaining >= 0 ? 'Below target by' : 'Above target by'}</small><strong>{Math.abs(remaining)} kcal</strong></div>}
        </div>
        {targetCalories > 0 && <div className="calorie-progress-wrap">
          <div className="calorie-progress" role="progressbar" aria-label="Daily calorie target progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={dayProgress}><span style={{ width: `${dayProgress}%` }}/></div>
          <small>{dayProgress}% of estimated daily target · {day.totals.proteinG} g protein · {day.totals.carbsG} g carbs · {day.totals.fatG} g fat</small>
        </div>}
      </div>

      <div className="calorie-tracking-tip"><b>Estimation suggestion</b><span>{hasWideMealEstimate
        ? 'At least one meal has a wide calorie range. Weighing the portion and noting the amount of oil or sauce can make its estimate more useful.'
        : 'Log drinks, snacks, sauces and cooking oil for a more complete daily estimate. Photo-based portions and recipe calories are estimates, so use the range as a guide.'}</span></div>

      {day.logs.map(food => <div className="list-row" key={food._id}>
        <div>
          <b>{food.item}</b>
          {food.foods?.length > 0 && <small>{food.foods.map(item => `${item.name}${item.category ? ` (${item.category})` : ''}`).join(', ')}</small>}
          {food.userDescription && <small>Hint: {food.userDescription}</small>}
          <small>{food.meal} · {new Date(food.eatenAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · P {food.proteinG}g · C {food.carbsG}g · F {food.fatG}g</small>
          {food.portionEstimate && <small>{food.portionEstimate} · {food.confidence} visual confidence</small>}
        </div>
        <strong>{food.calorieRange ? `${food.calories} kcal (${food.calorieRange.min}–${food.calorieRange.max})` : `${food.calories} kcal`}</strong>
      </div>)}
      {!day.logs.length && <div className="empty">No food logged for this date.</div>}
    </section>
  </>;
}
