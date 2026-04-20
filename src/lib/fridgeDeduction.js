// Déduction du frigo quand une recette est cuisinée.
// Réutilisé par :
//   - PlanningScreen (completeMeal)
//   - CookingModeScreen (handleFinish via markRecipeAsCooked)
//   - RecipesScreen (raccourci swipe "✓ Cuisiné")
//
// Gère 2 formats pour recipe.ingredients :
//   - Array de {name, quantity, unit, in_fridge} (snapshot planning/IA)
//   - Text multi-lignes (format stocké en DB pour les recettes perso)

import { supabase } from './supabase';

export function normalizeIngredientName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // retire les accents
    .replace(/s$/, '') // pluriel simple
    .trim();
}

export function matchesFridgeItem(ingredientName, fridgeItemName) {
  const a = normalizeIngredientName(ingredientName);
  const b = normalizeIngredientName(fridgeItemName);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

// Parse les ingrédients vers un format uniforme {name, quantity, unit, in_fridge}.
// Tolère 2 entrées : string multi-lignes OU array d'objets.
export function parseIngredientsFromRecipe(recipe) {
  const raw = recipe?.ingredients;
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw
      .map((ing, i) => {
        if (!ing) return null;
        const name =
          typeof ing === 'string'
            ? ing
            : ing.name || ing.title || '';
        if (!name.trim()) return null;
        return {
          id: i,
          name: name.trim(),
          quantity:
            typeof ing.quantity === 'number' && Number.isFinite(ing.quantity)
              ? ing.quantity
              : null,
          unit: typeof ing.unit === 'string' ? ing.unit : null,
          in_fridge: ing.in_fridge !== false,
          raw: typeof ing === 'string' ? ing : JSON.stringify(ing),
        };
      })
      .filter(Boolean);
  }

  if (typeof raw !== 'string') return [];

  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  return lines.map((line, i) => {
    // Essai parse : "2 oignons", "100g de fromage", "1 cuillère de sel"
    const match = line.match(
      /^(\d+(?:[.,]\d+)?)\s*([a-zA-Zéèêàâôùû]*)\s+(?:de\s+|d')?(.+)$/i
    );
    if (match) {
      const [, qtyStr, unit, name] = match;
      const qty = parseFloat(qtyStr.replace(',', '.'));
      return {
        id: i,
        name: name.trim(),
        quantity: Number.isFinite(qty) ? qty : null,
        unit: unit && unit.length <= 6 ? unit.toLowerCase() : null,
        in_fridge: true,
        raw: line,
      };
    }
    return {
      id: i,
      name: line,
      quantity: null,
      unit: null,
      in_fridge: true,
      raw: line,
    };
  });
}

// Déduit les ingrédients d'une recette du frigo.
// Tolérant : pas d'erreur si rien ne matche, skip si quantité manquante.
export async function deductRecipeFromFridge({ recipe, userId }) {
  const ingredients = parseIngredientsFromRecipe(recipe);
  if (ingredients.length === 0) {
    return { deducted: [], skipped: [] };
  }

  const { data: fridgeItems, error } = await supabase
    .from('fridge_items')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  if (!fridgeItems || fridgeItems.length === 0) {
    return { deducted: [], skipped: ingredients };
  }

  const deducted = [];
  const skipped = [];

  for (const ing of ingredients) {
    if (ing.in_fridge === false) {
      skipped.push(ing);
      continue;
    }

    const matching = fridgeItems.find((item) =>
      matchesFridgeItem(ing.name, item.name)
    );
    if (!matching) {
      skipped.push(ing);
      continue;
    }

    const toDeduct = Number(ing.quantity);
    if (!Number.isFinite(toDeduct) || toDeduct <= 0) {
      // Pas de quantité sûre → on skip pour ne pas supprimer à l'aveugle
      skipped.push(ing);
      continue;
    }

    const currentQty = Number(matching.quantity);
    if (!Number.isFinite(currentQty)) {
      skipped.push(ing);
      continue;
    }

    const newQty = currentQty - toDeduct;
    if (newQty <= 0) {
      await supabase.from('fridge_items').delete().eq('id', matching.id);
      deducted.push({
        ...matching,
        action: 'deleted',
        ingredient_matched: ing.name,
      });
    } else {
      await supabase
        .from('fridge_items')
        .update({ quantity: newQty })
        .eq('id', matching.id);
      deducted.push({
        ...matching,
        action: 'decreased',
        new_quantity: newQty,
        ingredient_matched: ing.name,
      });
    }
  }

  return { deducted, skipped };
}

// Marque une recette comme cuisinée :
//   - déduit le frigo
//   - incrémente times_cooked + met last_cooked_at
//   - met à jour la note moyenne si rating fourni (1-5)
// Note : ne jette pas si la déduction échoue partiellement ; jette si
// l'UPDATE recipes échoue (pour éviter perte de stats silencieuse).
export async function markRecipeAsCooked({ recipe, userId, rating = null }) {
  if (!recipe || !recipe.id) {
    throw new Error('Recette invalide.');
  }

  let deducted = [];
  let skipped = [];
  try {
    const res = await deductRecipeFromFridge({ recipe, userId });
    deducted = res.deducted;
    skipped = res.skipped;
  } catch (err) {
    console.warn('[fridgeDeduction] deduction failed:', err?.message);
    // On continue : marquer cuisinée même si déduction partielle KO
  }

  const updates = {
    times_cooked: (Number(recipe.times_cooked) || 0) + 1,
    last_cooked_at: new Date().toISOString(),
  };

  if (typeof rating === 'number' && rating >= 1 && rating <= 5) {
    const currentRating = Number(recipe.rating) || 0;
    const currentCount = Number(recipe.rating_count) || 0;
    const newCount = currentCount + 1;
    const newRating =
      currentCount > 0
        ? (currentRating * currentCount + rating) / newCount
        : rating;
    updates.rating = Math.round(newRating * 100) / 100;
    updates.rating_count = newCount;
  }

  const { error: updateError } = await supabase
    .from('recipes')
    .update(updates)
    .eq('id', recipe.id);
  if (updateError) throw updateError;

  return { deducted, skipped, stats: updates };
}
