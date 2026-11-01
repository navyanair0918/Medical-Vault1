import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';

const foodLogSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  eatenAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['review', 'logged'], default: 'logged', index: true },
  meal: { type: String, enum: ['breakfast', 'lunch', 'dinner', 'snack'], default: 'snack' },
  item: { type: String, required: true },
  calories: { type: Number, required: true, min: 0 },
  calorieRange: {
    min: { type: Number, min: 0 },
    max: { type: Number, min: 0 }
  },
  proteinG: { type: Number, default: 0, min: 0 },
  carbsG: { type: Number, default: 0, min: 0 },
  fatG: { type: Number, default: 0, min: 0 },
  estimatedGrams: { type: Number, min: 0 },
  portionEstimate: { type: String, maxlength: 500 },
  userDescription: { type: String, maxlength: 400 },
  confidence: { type: String, enum: ['low', 'medium', 'high'] },
  confidenceScore: { type: Number, min: 0, max: 1 },
  analysisNotes: { type: String, maxlength: 800 },
  needsClarification: { type: Boolean, default: false },
  aiModelVersion: { type: String, maxlength: 100 },
  nutritionSource: {
    type: String,
    default: 'USDA FoodData Central',
    maxlength: 80,
    set: value => typeof value === 'string' ? value.slice(0, 80) : value
  },
  reviewedAt: { type: Date },
  foods: [{
    _id: false,
    analysisItemId: { type: String, default: randomUUID },
    name: { type: String, required: true },
    aiName: { type: String, maxlength: 100 },
    category: { type: String, maxlength: 60 },
    portion: { type: String, required: true },
    cookingMethod: { type: String, maxlength: 120 },
    estimatedGrams: { type: Number, min: 0 },
    gramsFinal: { type: Number, min: 0 },
    gramsRange: {
      min: { type: Number, min: 0 },
      max: { type: Number, min: 0 }
    },
    gramsRangeAi: {
      min: { type: Number, min: 0 },
      max: { type: Number, min: 0 }
    },
    calories: { type: Number, min: 0 },
    calorieRange: {
      min: { type: Number, min: 0 },
      max: { type: Number, min: 0 }
    },
    proteinG: { type: Number, min: 0 },
    carbsG: { type: Number, min: 0 },
    fatG: { type: Number, min: 0 },
    nutritionPer100g: {
      calories: { type: Number, min: 0 },
      proteinG: { type: Number, min: 0 },
      carbsG: { type: Number, min: 0 },
      fatG: { type: Number, min: 0 }
    },
    nutritionComponents: [{
      _id: false,
      name: { type: String, required: true, maxlength: 100 },
      gramsPer100g: { type: Number, required: true, min: 0, max: 100 },
      preparation: { type: String, maxlength: 100 },
      sourceId: { type: String, maxlength: 30 },
      sourceDb: { type: String, maxlength: 80 },
      sourceDescription: { type: String, maxlength: 180 },
      per100g: {
        calories: { type: Number, required: true, min: 0 },
        proteinG: { type: Number, required: true, min: 0 },
        carbsG: { type: Number, required: true, min: 0 },
        fatG: { type: Number, required: true, min: 0 }
      },
      matchScore: { type: Number, min: 0, max: 1 }
    }],
    calorieCrossCheck: {
      macroCaloriesPer100g: { type: Number, min: 0 },
      discrepancyPercent: { type: Number, min: 0 },
      mismatch: { type: Boolean, default: false }
    },
    sourceDb: { type: String, maxlength: 80 },
    sourceId: { type: String, maxlength: 30 },
    sourceDescription: { type: String, maxlength: 180 },
    nutritionNotes: { type: String, maxlength: 400 },
    recipeCompositionEstimated: { type: Boolean, default: false },
    nutritionMatchScore: { type: Number, min: 0, max: 1 },
    nutritionConfidenceScore: { type: Number, min: 0, max: 1 },
    nutritionMatchStatus: { type: String, enum: ['matched', 'missing'] },
    confidence: { type: String, enum: ['low', 'medium', 'high'] },
    confidenceScore: { type: Number, min: 0, max: 1 },
    gramsAi: { type: Number, min: 0 },
    needsClarification: { type: Boolean, default: false },
    clarificationQuestion: { type: String, maxlength: 240 },
    userClarification: { type: String, maxlength: 400 }
  }]
}, { timestamps: true });

export default mongoose.model('FoodLog', foodLogSchema);
