export interface FoodSearchResult {
  id: number;
  name: string;
  nameHindi: string | null;
  category: string;
  isVeg: boolean;
  caloriesPer100g: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
  servingSizeG: number;
  servingDescription: string | null;
  score: number | null;
}

export interface FoodLog {
  id: string;
  loggedAt: string;
  logDate: string;
  foodId: number | null;
  foodName: string;
  portionG: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
  source: string;
  mealType: string | null;
}

export interface FoodLogsResponse {
  date: string;
  logs: FoodLog[];
}

export type MealType =
  | "pre-workout"
  | "breakfast"
  | "mid-morning"
  | "lunch"
  | "snack"
  | "post-workout"
  | "dinner";

export const MEAL_TYPE_LABEL: Record<MealType, string> = {
  "pre-workout": "Pre-workout",
  breakfast: "Breakfast",
  "mid-morning": "Mid-morning",
  lunch: "Lunch",
  snack: "Snack",
  "post-workout": "Post-workout",
  dinner: "Dinner",
};
