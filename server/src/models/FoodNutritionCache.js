import mongoose from 'mongoose';

const foodNutritionCacheSchema = new mongoose.Schema({
  cacheKey: { type: String, required: true, unique: true },
  results: { type: mongoose.Schema.Types.Mixed, required: true },
  cachedAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });

export default mongoose.model('FoodNutritionCache', foodNutritionCacheSchema);
