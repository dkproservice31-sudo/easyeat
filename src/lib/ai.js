// Client Gemini 2.5 Flash pour génération de recettes (sortie JSON structurée)
const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const RECIPE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    description: { type: 'STRING' },
    ingredients: { type: 'STRING' },
    steps: { type: 'STRING' },
    duration: { type: 'INTEGER' },
    cooking_temp: { type: 'INTEGER' },
    cooking_type: { type: 'STRING' },
    fat_type: { type: 'STRING' },
  },
  required: ['title', 'ingredients', 'steps'],
};

async function callGemini(prompt) {
  const key = process.env.EXPO_PUBLIC_GEMINI_KEY;
  if (!key) throw new Error('EXPO_PUBLIC_GEMINI_KEY manquante dans .env');

  const res = await fetch(`${ENDPOINT}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RECIPE_SCHEMA,
        temperature: 0.8,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini ${res.status}: ${body}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Réponse Gemini vide');
  return JSON.parse(text);
}

export async function generateRecipe({ servings, prompt, fridgeItems = [] }) {
  const fridgeStr =
    fridgeItems.length > 0
      ? `\n\nIngrédients disponibles dans le frigo (utilise-les en priorité) :\n${fridgeItems
          .map((i) => `- ${i.name} (${i.quantity} ${i.unit})`)
          .join('\n')}`
      : '';

  const text = `Tu es un chef cuisinier francophone. Génère une recette complète pour ${servings} personne${servings > 1 ? 's' : ''}.

Demande de l'utilisateur : ${prompt || 'surprends-moi avec une recette savoureuse'}
${fridgeStr}

Contraintes :
- Les quantités d'ingrédients doivent être adaptées pour ${servings} personne${servings > 1 ? 's' : ''}
- Format "ingredients" : une ligne par ingrédient avec quantité et unité (ex : "200g de farine\\n3 œufs")
- Format "steps" : étapes numérotées, une par ligne (ex : "1. Préchauffer le four...\\n2. Mélanger...")
- "duration" : durée totale en minutes (entier)
- "cooking_temp" : température en °C (entier, ou 0 si pas de four)
- "cooking_type" : l'une de ces valeurs : "Au four", "Poêle", "Vapeur", "Grill", "Friture", "Mijotage", "Wok", "Sans cuisson"
- "fat_type" : l'une de ces valeurs : "Huile d'olive", "Huile de tournesol", "Beurre", "Huile de coco", "Huile de sésame", "Saindoux", "Sans matière grasse"
- Réponds en français.`;

  return callGemini(text);
}

export async function adjustRecipeServings({ recipe, newServings }) {
  const text = `Tu es un chef cuisinier francophone. Voici une recette existante :

Titre : ${recipe.title}
Portions actuelles : ${recipe.servings || 'non spécifié'}
Ingrédients :
${recipe.ingredients || '(aucun)'}
Étapes :
${recipe.steps || '(aucune)'}

Recalcule UNIQUEMENT les quantités des ingrédients pour ${newServings} personne${newServings > 1 ? 's' : ''}. Garde les mêmes ingrédients et les mêmes étapes, mais ajuste les quantités proportionnellement.

Format "ingredients" : une ligne par ingrédient avec quantité et unité.
Garde exactement le même titre, la même description, les mêmes étapes, la même durée et la même cuisson.`;

  const result = await callGemini(text);
  // On force la conservation des champs non recalculés
  return {
    ...result,
    title: recipe.title,
    description: recipe.description ?? result.description,
    steps: recipe.steps ?? result.steps,
    duration: recipe.duration ?? result.duration,
    cooking_temp: recipe.cooking_temp ?? result.cooking_temp,
    cooking_type: recipe.cooking_type ?? result.cooking_type,
    fat_type: recipe.fat_type ?? result.fat_type,
  };
}
