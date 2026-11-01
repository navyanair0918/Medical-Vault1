# Food Estimation Evaluation Plan

Use this protocol before making any accuracy claim about the photo estimator. The current model output is an estimate, not a measured calorie result.

## Build a small reference set

Collect 30–50 meals that represent the foods people will actually log. Include single foods and mixed plates, different serving sizes, common Indian dishes, dry and oily preparations, and different camera angles. For each photo:

- Weigh each cooked item on a kitchen scale before plating, in grams.
- Record ingredients and cooking oil when measuring a complete recipe.
- Save the photo, optional user description, known food labels, and per-item gram amounts.
- Calculate reference calories and macros from the weighed recipe or the same nutrition source used by the app (INDB for Indian recipes, USDA FoodData Central fallback for other foods).
- Keep images private and use them with the participant's consent. The app's default analysis path sends images to Google Gemini; the provider can be changed in server configuration.

Do not treat an unverified user correction as ground truth. If an app user changes a portion without weighing it, store it as a correction, not a reference label.

## Record predictions

For each analysis, capture the model/version, image-only or image-plus-description mode, detected food names, estimated grams, lower/upper gram range, confidence score, nutrition source and source ID, selected grams, and calculated calories/macros. Keep the model's original estimate separate from any user changes.

## Metrics

- **Food identification:** precision, recall, and F1 at the meal-item level.
- **Portion estimate:** mean absolute error in grams and median absolute percentage error by item.
- **Calories:** mean absolute error (kcal) and mean absolute percentage error (MAPE) by meal. Exclude or separately report meals with near-zero reference calories, where percentage error is unstable.
- **Range quality:** portion-range coverage (share of reference gram values inside the predicted range) and average range width. A very wide range can achieve high coverage without being useful, so report both.
- **Nutrition matching:** percentage of food labels matched to an appropriate USDA entry, reviewed by a person familiar with the food.

Split comparisons by meal or recipe, not by duplicate photos of the same plate. Compare image-only with image-plus-description using the same model and the same reference set. Report the sample size, model version, date, and limitations beside every score.

## Results table

Fill this only after collecting and checking reference measurements. Do not publish placeholder numbers as model accuracy.

| Run | Meals | Food F1 | Portion MAE | Calorie MAE | Calorie MAPE | Range coverage | Mean range width |
|---|---:|---:|---:|---:|---:|---:|---:|
| Image only | — | — | — | — | — | — | — |
| Image + description | — | — | — | — | — | — | — |

The app preserves AI grams separately from confirmed grams so corrections can be reviewed later. Only reference meals with scale-verified labels should be used to calculate accuracy claims.
