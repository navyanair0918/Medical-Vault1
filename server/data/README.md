# Indian recipe nutrition data

`indian-recipes.json` is generated from the Anuvaad Indian Nutrient Databank workbook (`Anuvaad_INDB_2024.11.xlsx`) with `build_indian_recipes.py`. The server uses the per-100 g energy and macronutrient values for Indian recipe matches; USDA FoodData Central remains the fallback for non-Indian foods.

Source: [Anuvaad Indian Nutrient Databank](https://www.anuvaad.org.in/indian-nutrient-databank/). The source page describes the database as open access. Confirm its redistribution terms before publishing a build that includes derived data.

Regenerate the local runtime JSON after replacing the workbook:

```powershell
python server/data/build_indian_recipes.py
```
