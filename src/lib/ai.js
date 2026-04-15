// Client Gemini 2.5 Flash pour génération de recettes (sortie JSON structurée)
const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_KEY || '';

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

export const isAIConfigured = () => !!GEMINI_KEY;

async function callGemini(prompt) {
  if (!GEMINI_KEY) {
    throw new Error(
      "La génération IA n'est pas disponible pour le moment. Réessayez plus tard."
    );
  }

  const res = await fetch(`${ENDPOINT}?key=${GEMINI_KEY}`, {
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

export async function generateRecipe({
  servings,
  prompt,
  fridgeItems = [],
  cuisine,
}) {
  const fridgeStr =
    fridgeItems.length > 0
      ? `\n\nIngrédients disponibles dans le frigo (utilise-les en priorité) :\n${fridgeItems
          .map((i) => `- ${i.name} (${i.quantity} ${i.unit})`)
          .join('\n')}`
      : '';

  const cuisineStr = cuisine
    ? `\n\nLa recette doit appartenir à la cuisine ${cuisine}.`
    : '';

  const text = `Tu es un chef cuisinier francophone. Génère une recette complète pour ${servings} personne${servings > 1 ? 's' : ''}.

Demande de l'utilisateur : ${prompt || 'surprends-moi avec une recette savoureuse'}
${cuisineStr}${fridgeStr}

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

// Demande à Gemini une LISTE de N titres de recettes pour une cuisine donnée.
// `existingTitles` : tableau des titres déjà en base pour éviter les doublons.
export async function generateRecipeTitles({ cuisine, count, existingTitles = [] }) {
  const key = process.env.EXPO_PUBLIC_GEMINI_KEY || '';
  if (!key) {
    throw new Error(
      "La génération IA n'est pas disponible pour le moment."
    );
  }
  const exclusion =
    existingTitles.length > 0
      ? `\n\nIMPORTANT : Ne PAS proposer ces recettes qui existent déjà :\n${existingTitles
          .map((t) => `- ${t}`)
          .join('\n')}\nPropose uniquement des recettes DIFFÉRENTES et NOUVELLES.`
      : '';
  const prompt = `Donne-moi une liste de ${count} recettes ${cuisine} populaires et traditionnelles distinctes. Garde le nom original du plat dans sa langue d'origine (par exemple "Dolma", "Khorovats", "Byorek" pour les recettes arméniennes, ne traduis pas ces noms). Réponds uniquement avec la liste des titres, un par ligne, sans numérotation ni commentaire.${exclusion}`;
  const res = await fetch(`${ENDPOINT}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9 },
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini ${res.status}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text
    .split(/\r?\n/)
    .map((s) => s.replace(/^\s*\d+\s*[\.\)\-:]\s*/, '').trim())
    .map((s) => s.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, count);
}

// Génère N recettes complètes pour une cuisine donnée. Appelle Gemini une fois
// pour obtenir les titres, puis une fois par titre pour la recette complète.
// onProgress(done, total, titleEnCours) est appelé à chaque étape.
// existingTitles : liste des titres déjà en base → exclusion côté prompt + filtre côté client.
// Retourne { recipes, skipped } où skipped est le nombre de doublons filtrés.
export async function generateRecipesBatch({
  cuisine,
  count,
  onProgress,
  existingTitles = [],
}) {
  const rawTitles = await generateRecipeTitles({
    cuisine,
    count,
    existingTitles,
  });

  // Filtrage côté client : on écarte tout titre qui matche (insensible casse)
  // un titre existant OU un autre titre déjà choisi dans ce batch.
  const existingSet = new Set(
    existingTitles.map((t) => (t || '').trim().toLowerCase())
  );
  const uniqueTitles = [];
  const seen = new Set();
  let skipped = 0;
  for (const t of rawTitles) {
    const key = t.trim().toLowerCase();
    if (!key) continue;
    if (existingSet.has(key) || seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    uniqueTitles.push(t);
  }

  const recipes = [];
  for (let i = 0; i < uniqueTitles.length; i++) {
    const title = uniqueTitles[i];
    if (onProgress) onProgress(i, uniqueTitles.length, title);
    try {
      const r = await generateRecipe({
        servings: 2,
        prompt: `Recette traditionnelle ${cuisine} : "${title}". Utilise exactement "${title}" comme titre (nom original du plat, ne pas traduire). Rédige la description, les ingrédients (avec quantités) et les étapes de préparation EN FRANÇAIS.`,
        cuisine,
      });
      // Force le titre demandé si Gemini a dévié
      r.title = r.title || title;
      if (r.cooking_temp === 0) r.cooking_temp = null;
      recipes.push(r);
    } catch (err) {
      // On continue même si une recette échoue
      console.warn(`Échec ${title}:`, err.message);
    }
  }
  if (onProgress) onProgress(uniqueTitles.length, uniqueTitles.length, null);
  return { recipes, skipped };
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
