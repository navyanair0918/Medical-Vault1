export function calculateWellness({ heightCm, weightKg, age, gender, activityLevel = 'moderate', goal = 'maintain' }) {
  const h = Number(heightCm);
  const w = Number(weightKg);
  const a = Number(age);
  if (![h, w, a].every(Number.isFinite) || h <= 0 || w <= 0 || a <= 0) throw new Error('Valid height, weight and age are required');

  const bmi = w / Math.pow(h / 100, 2);
  const bmiCategory = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Healthy' : bmi < 30 ? 'Overweight' : 'Obesity range';
  const sexConstant = gender === 'male' ? 5 : gender === 'female' ? -161 : -78;
  const bmr = 10 * w + 6.25 * h - 5 * a + sexConstant;
  const factors = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
  const tdee = bmr * (factors[activityLevel] || factors.moderate);
  const goalAdjustment = goal === 'lose' ? -400 : goal === 'gain' ? 300 : 0;
  const targetCalories = Math.max(1200, tdee + goalAdjustment);

  return {
    bmi: Number(bmi.toFixed(1)), bmiCategory,
    bmr: Math.round(bmr), tdee: Math.round(tdee), targetCalories: Math.round(targetCalories),
    note: 'Estimates only. Calorie targets are not medical advice; pregnancy, adolescence, illness, medications and athletic training need individualized guidance.'
  };
}
