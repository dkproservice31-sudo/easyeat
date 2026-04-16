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
    dish_type: { type: 'STRING' },
  },
  required: ['title', 'ingredients', 'steps'],
};

export const isAIConfigured = () => !!GEMINI_KEY;

// Convertit une erreur Gemini (HTTP status, réseau, parsing) en message
// utilisateur compréhensible. Toujours appelée via `throw handleGeminiError(e)`.
export function handleGeminiError(error) {
  const status = error?.status;
  // Erreur réseau (fetch rejette avec TypeError) : pas de status
  if (status == null && (error?.name === 'TypeError' || /network|fetch/i.test(error?.message || ''))) {
    return new Error('Pas de connexion internet.');
  }
  if (status === 429) {
    return new Error('Trop de requêtes. Réessayez dans une minute.');
  }
  if (status === 500 || status === 503 || status === 502 || status === 504) {
    return new Error('Le service IA est temporairement indisponible. Réessayez plus tard.');
  }
  return new Error('Une erreur est survenue. Réessayez.');
}

async function geminiFetch(body) {
  let res;
  try {
    res = await fetch(`${ENDPOINT}?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw handleGeminiError(e);
  }
  if (!res.ok) {
    const err = new Error(`Gemini ${res.status}`);
    err.status = res.status;
    throw handleGeminiError(err);
  }
  return res.json();
}

async function callGemini(prompt) {
  if (!GEMINI_KEY) {
    throw new Error(
      "La génération IA n'est pas disponible pour le moment. Réessayez plus tard."
    );
  }
  const data = await geminiFetch({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RECIPE_SCHEMA,
      temperature: 0.8,
    },
  });
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Une erreur est survenue. Réessayez.');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Une erreur est survenue. Réessayez.');
  }
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
- "dish_type" : exactement l'une de ces valeurs (en minuscules) : "viande", "poisson", "vegan", "végétarien", "dessert". Choisis "vegan" uniquement si la recette n'utilise AUCUN produit animal (ni œuf, ni laitage, ni miel).
- Réponds en français.`;

  return callGemini(text);
}

// Demande à Gemini une LISTE de N titres de recettes pour une cuisine donnée.
// `existingTitles` : tableau des titres déjà en base pour éviter les doublons.
export async function generateRecipeTitles({ cuisine, count, existingTitles = [] }) {
  if (!GEMINI_KEY) {
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
  const data = await geminiFetch({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.9 },
  });
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

// Appel Gemini "brut" (pas de schéma structuré) qui renvoie du JSON parsé.
// Utilisé pour les calculs de macros où on ne veut pas imposer RECIPE_SCHEMA.
async function callGeminiJson(prompt) {
  if (!GEMINI_KEY) {
    throw new Error(
      "La génération IA n'est pas disponible pour le moment. Réessayez plus tard."
    );
  }
  const data = await geminiFetch({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  });
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Une erreur est survenue. Réessayez.');
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('Une erreur est survenue. Réessayez.');
  }
}

// Demande à Gemini de classer une recette dans une catégorie de plat.
// Retourne 'viande' | 'poisson' | 'vegan' | 'végétarien' | 'dessert' | null si invalide.
export async function classifyDishType({ title, ingredients }) {
  if (!GEMINI_KEY) {
    throw new Error("La génération IA n'est pas disponible pour le moment.");
  }
  const prompt = `Voici une recette :
Titre : ${title || '(sans titre)'}.
Ingrédients : ${ingredients || '(non précisés)'}.
Détermine le type de plat parmi EXACTEMENT une de ces valeurs : viande, poisson, vegan, végétarien, dessert.
Règles :
- viande = contient de la viande (bœuf, poulet, porc, agneau, canard, etc.)
- poisson = contient du poisson ou fruits de mer (saumon, morue, crevettes, etc.) mais PAS de viande
- vegan = AUCUN produit animal (pas de viande, pas de poisson, pas de lait, pas d'œuf, pas de beurre, pas de fromage, pas de miel)
- végétarien = pas de viande, pas de poisson, mais peut contenir lait, œuf, beurre, fromage
- dessert = plat sucré (gâteau, tarte, crème, glace, etc.)
Réponds UNIQUEMENT avec le mot (viande, poisson, vegan, végétarien ou dessert), rien d'autre.`;

  let res;
  try {
    res = await fetch(`${ENDPOINT}?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1 },
      }),
    });
  } catch (e) {
    throw handleGeminiError(e);
  }
  if (!res.ok) {
    const err = new Error(`Gemini ${res.status}`);
    err.status = res.status;
    throw handleGeminiError(err);
  }
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '')
    .trim()
    .toLowerCase();
  const VALID = ['viande', 'poisson', 'vegan', 'végétarien', 'vegetarien', 'dessert'];
  const found = VALID.find((v) => text.includes(v));
  if (!found) return null;
  return found === 'vegetarien' ? 'végétarien' : found;
}

export async function calculateRecipeMacros(recipe) {
  const portions = recipe?.servings || 1;
  const prompt = `Pour cette recette avec les ingrédients suivants :
${recipe?.ingredients || '(aucun)'}

Portions prévues : ${portions}.

Calcule les macronutriments TOTAUX pour la recette entière (toutes les portions) ET par portion. Réponds UNIQUEMENT en JSON avec ce format exact, sans markdown ni backticks :
{
  "total": { "calories": 850, "proteines": 45, "glucides": 60, "lipides": 35 },
  "par_portion": { "calories": 425, "proteines": 22, "glucides": 30, "lipides": 17 },
  "portions": ${portions}
}`;
  return callGeminiJson(prompt);
}

// Bilan nutritionnel global à partir d'une liste de recettes de l'utilisateur.
// Retourne un texte libre (français) sans markdown.
export async function analyzeNutritionBalance({ recipes }) {
  if (!GEMINI_KEY) {
    throw new Error("L'analyse IA n'est pas disponible pour le moment.");
  }
  const list = (recipes || [])
    .map((r) => `- ${r.title || '(sans titre)'} : ${(r.ingredients || '').replace(/\n/g, ', ')}`)
    .join('\n');
  const prompt = `Voici la liste des recettes de cet utilisateur :
${list || '(aucune recette)'}

Fais un bilan nutritionnel global : calories moyennes par repas, répartition protéines/glucides/lipides, points forts et points à améliorer. Réponds en français, de manière concise (max 200 mots). N'utilise pas de markdown (pas de **, #, etc.), juste du texte simple.`;

  let res;
  try {
    res = await fetch(`${ENDPOINT}?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4 },
      }),
    });
  } catch (e) {
    throw handleGeminiError(e);
  }
  if (!res.ok) {
    const err = new Error(`Gemini ${res.status}`);
    err.status = res.status;
    throw handleGeminiError(err);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('Une erreur est survenue. Réessayez.');
  return text.trim();
}

// Assistant cuisinier : envoie le contexte de la recette + l'historique du chat
// + la nouvelle question, et renvoie la réponse texte du chef IA.
export async function askCookAssistant({ recipe, history = [], message }) {
  if (!GEMINI_KEY) {
    throw new Error("L'assistant n'est pas disponible pour le moment.");
  }
  const context = `Tu es un chef cuisinier expert. Voici la recette :
Titre : ${recipe?.title || '(sans titre)'}
Ingrédients : ${recipe?.ingredients || '(non précisés)'}
Étapes : ${recipe?.steps || '(non précisées)'}
Portions : ${recipe?.servings || 'non spécifié'}

Réponds en français, de manière concise et pratique. Tu peux conseiller sur : l'ordre optimal de préparation, les découpes (cubes, julienne, etc.), les temps de cuisson selon les préférences (saignant, à point, bien cuit), les astuces pour réussir, les substitutions d'ingrédients, les accompagnements. Si l'utilisateur parle de viande, précise les effets du temps de cuisson (plus tendre, plus ferme, etc.).`;

  // Historique au format Gemini : alternance user/model
  const contents = [
    { role: 'user', parts: [{ text: context }] },
    { role: 'model', parts: [{ text: "D'accord, je suis prêt à vous aider sur cette recette." }] },
    ...history.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];

  let res;
  try {
    res = await fetch(`${ENDPOINT}?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.7 },
      }),
    });
  } catch (e) {
    throw handleGeminiError(e);
  }
  if (!res.ok) {
    const err = new Error(`Gemini ${res.status}`);
    err.status = res.status;
    throw handleGeminiError(err);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('Une erreur est survenue. Réessayez.');
  return text.trim();
}

export async function calculateIngredientMacros(ingredientName, quantity) {
  const qty = quantity ? `${quantity} ` : '';
  const prompt = `Pour cet ingrédient : ${qty}${ingredientName}. Calcule les macronutriments. Réponds UNIQUEMENT en JSON avec ce format exact, sans markdown ni backticks :
{
  "calories": 150,
  "proteines": 12,
  "glucides": 5,
  "lipides": 8
}`;
  return callGeminiJson(prompt);
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
