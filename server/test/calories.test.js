import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateWellness } from '../src/utils/calories.js';

test('wellness calculator returns sensible values', () => {
  const result = calculateWellness({ heightCm: 175, weightKg: 70, age: 30, gender: 'male', activityLevel: 'moderate', goal: 'maintain' });
  assert.equal(result.bmi, 22.9);
  assert.equal(result.bmiCategory, 'Healthy');
  assert.ok(result.targetCalories > result.bmr);
});
