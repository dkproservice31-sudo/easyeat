// Client Gemini 2.5 Flash pour génération de recettes (sortie JSON structurée)
import { checkAndIncrementAIQuota } from './aiQuota';

// Helper interne : check quota + log. Rétrocompat : si userId absent,
// warn console et laisse passer (évite de casser les appels legacy pendant
// la transition).
async function _checkQuota(userId, usageType, functionName) {
  if (!userId) {
    console.warn(`[ai] ${functionName} appelée sans userId — quota non compté`);
    return;
  }
  await checkAndIncrementAIQuota(userId, usageType, functionName);
}

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
  userId,
}) {
  await _checkQuota(userId, 'user', 'generateRecipe');
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
export async function generateRecipeTitles({ cuisine, count, existingTitles = [], userId }) {
  await _checkQuota(userId, 'admin', 'generateRecipeTitles');
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
  userId,
}) {
  // Le batch = 1 usage admin (peu importe le nombre de recettes internes)
  await _checkQuota(userId, 'admin', 'generateRecipesBatch');
  // Les appels internes generateRecipeTitles et generateRecipe se font
  // SANS userId pour éviter le double compte — le batch a déjà consommé
  // son quota.
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
export async function classifyDishType({ title, ingredients, userId }) {
  await _checkQuota(userId, 'admin', 'classifyDishType');
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

export async function calculateRecipeMacros(recipe, userId) {
  await _checkQuota(userId, 'user', 'calculateRecipeMacros');
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
export async function analyzeNutritionBalance({ recipes, userId }) {
  await _checkQuota(userId, 'user', 'analyzeNutritionBalance');
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

// Génère une recette complète à partir des ingrédients actuellement dans le frigo.
// Gemini agit comme un chef cuisinier créatif, puise dans sa connaissance culinaire
// mondiale (pas dans les recettes existantes de l'app) et renvoie un JSON avec
// ingredients structuré (pour les pills "en stock / à acheter") et steps en array.
// La conversion vers le format TEXT de la table recipes se fait côté écran.
export async function generateRecipeFromFridge(fridgeItems = [], userId) {
  await _checkQuota(userId, 'user', 'generateRecipeFromFridge');
  if (!GEMINI_KEY) {
    throw new Error(
      "La génération IA n'est pas disponible pour le moment. Réessayez plus tard."
    );
  }
  const fridgeList = fridgeItems
    .map((i) => {
      const qty = i.quantity != null && i.unit
        ? ` (${i.quantity} ${i.unit})`
        : '';
      return `- ${i.name}${qty}`;
    })
    .join('\n') || '(aucun ingrédient)';

  const prompt = `Tu es un chef cuisinier créatif avec une connaissance approfondie de la cuisine mondiale. Un utilisateur a ces ingrédients dans son frigo et ne sait pas quoi cuisiner. Propose-lui UNE recette inspirante et réalisable.

LIBERTÉ CRÉATIVE :
- Tu peux proposer n'importe quelle cuisine : française, italienne, asiatique, mexicaine, libanaise, indienne, fusion, ou une création originale.
- Varie les styles selon les ingrédients disponibles.
- Parfois un classique rassurant, parfois une création plus audacieuse.
- Tu n'es PAS limité à une base de recettes existante : puise dans toute ta connaissance culinaire.

RÈGLES TECHNIQUES :
1. Utilise au moins 60% des ingrédients du frigo comme base principale.
2. Tu peux suggérer entre 2 et 5 ingrédients complémentaires manquants (à acheter) — pas plus, la recette doit rester réaliste.
3. Faisable en moins de 90 minutes.
4. Ni trop basique (2 ingrédients mélangés) ni trop complexe (15 étapes techniques).
5. La recette doit être gourmande et donner envie.

INGRÉDIENTS DU FRIGO :
${fridgeList}

Réponds UNIQUEMENT en JSON strict, sans markdown, sans backticks, sans commentaire avant ou après. Structure EXACTE :

{
  "title": "Titre court et appétissant",
  "description": "1 à 2 phrases engageantes",
  "servings": 4,
  "duration": 45,
  "cooking_temp": 180,
  "cooking_type": "Au four",
  "fat_type": "Huile d'olive",
  "cuisine": "française",
  "dish_type": "viande",
  "ingredients": [
    {"name": "Tomates", "quantity": 4, "unit": "unité", "in_fridge": true},
    {"name": "Basilic frais", "quantity": 1, "unit": "bouquet", "in_fridge": false}
  ],
  "steps": [
    "Étape 1 complète et détaillée.",
    "Étape 2..."
  ]
}

CONTRAINTES DE VALEURS :
- "cooking_type" : "Au four" | "Poêle" | "Vapeur" | "Grill" | "Friture" | "Mijotage" | "Wok" | "Sans cuisson"
- "fat_type" : "Huile d'olive" | "Huile de tournesol" | "Beurre" | "Huile de coco" | "Huile de sésame" | "Saindoux" | "Sans matière grasse"
- "dish_type" : "viande" | "poisson" | "vegan" | "végétarien" | "dessert"
- "cooking_temp" : entier en °C, ou null si pas de four
- "in_fridge" : true uniquement si l'ingrédient est dans la liste fournie (comparaison insensible à la casse et aux accents). Les basiques absents (sel, poivre, eau) sont in_fridge: false sauf s'ils sont explicitement listés.
- Réponds en français.`;

  const data = await geminiFetch({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.9,
    },
  });
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Une erreur est survenue. Réessayez.');
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '');
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Une erreur est survenue. Réessayez.');
  }
  // Normalisation / garde-fous : on sécurise les champs obligatoires
  // pour que l'écran de génération n'explose jamais sur une réponse partielle.
  if (!parsed || typeof parsed !== 'object' || !parsed.title) {
    throw new Error('Une erreur est survenue. Réessayez.');
  }
  parsed.ingredients = Array.isArray(parsed.ingredients)
    ? parsed.ingredients
    : [];
  parsed.steps = Array.isArray(parsed.steps)
    ? parsed.steps.filter((s) => typeof s === 'string' && s.trim())
    : [];
  parsed.servings = Number(parsed.servings) || 4;
  parsed.duration = Number(parsed.duration) || 30;
  if (parsed.cooking_temp === 0) parsed.cooking_temp = null;
  return parsed;
}

// Génère un menu hebdomadaire (7 jours) basé sur le contenu du frigo et
// les préférences utilisateur. Version "light" : on ne renvoie que
// titre + description + durée pour chaque repas. Les recettes détaillées
// (ingrédients / étapes) seront générées à la demande plus tard.
const DAYS_ORDER = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

export async function generateWeeklyMenu(fridgeItems = [], options = {}, userId) {
  await _checkQuota(userId, 'user', 'generateWeeklyMenu');
  if (!GEMINI_KEY) {
    throw new Error(
      "La génération IA n'est pas disponible pour le moment. Réessayez plus tard."
    );
  }
  const {
    mealsPerDay = 2,
    dietPreference = 'aucune',
    varietyLevel = 'varié',
    avoidIngredients = '',
  } = options;

  const fridgeStr = (fridgeItems || [])
    .map((i) => {
      const qty = i.quantity != null && i.unit
        ? ` (${i.quantity} ${i.unit})`
        : '';
      return `- ${i.name}${qty}`;
    })
    .join('\n') || '(aucun ingrédient)';

  const mealsRule = mealsPerDay === 1
    ? '1 repas par jour (dîner seul). Le champ "lunch" doit être null.'
    : '2 repas par jour (déjeuner + dîner).';

  const avoidLine = avoidIngredients && avoidIngredients.trim()
    ? `- N'utilise JAMAIS ces ingrédients : ${avoidIngredients.trim()}`
    : '';

  const prompt = `Tu es un chef cuisinier et planificateur de menus expert. Génère un menu COMPLET pour 7 jours (lundi à dimanche) basé sur les ingrédients disponibles et les préférences.

RÈGLES :
- ${mealsRule}
- Utilise un maximum des ingrédients du frigo sur l'ensemble de la semaine.
- Varie les cuisines du monde selon le niveau de variété demandé.
- Respecte le régime alimentaire : ${dietPreference}.
${avoidLine}
- Équilibre nutritionnellement la semaine (évite 7 pâtes ou 7 salades d'affilée).
- Faisabilité réaliste : pas 7 recettes à 2h de cuisson.

INGRÉDIENTS DU FRIGO :
${fridgeStr}

PRÉFÉRENCES :
- Repas par jour : ${mealsPerDay}
- Régime : ${dietPreference}
- Variété : ${varietyLevel}
- À éviter : ${avoidIngredients || '(rien)'}

Réponds UNIQUEMENT en JSON strict, sans markdown, sans backticks, sans commentaire avant ou après.

Structure EXACTE :

{
  "title": "Ma semaine gourmande",
  "meals": [
    {
      "day": "lundi",
      "lunch": { "title": "...", "description": "...", "duration": 30 },
      "dinner": { "title": "...", "description": "...", "duration": 45 }
    }
  ]
}

Le tableau "meals" doit contenir EXACTEMENT 7 entrées dans l'ordre lundi, mardi, mercredi, jeudi, vendredi, samedi, dimanche.
Pour chaque repas : "duration" est un entier en minutes, "title" est court et appétissant, "description" tient en 1 phrase.
Réponds en français.`;

  const data = await geminiFetch({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.8,
    },
  });
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Une erreur est survenue. Réessayez.');
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '');
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Une erreur est survenue. Réessayez.');
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.meals)) {
    throw new Error('Une erreur est survenue. Réessayez.');
  }

  // Garde-fou : forcer l'ordre des jours et compléter les manquants.
  // Gemini est fiable mais on ne veut JAMAIS crasher l'UI.
  const byDay = {};
  for (const m of parsed.meals) {
    if (m && typeof m.day === 'string') {
      byDay[m.day.toLowerCase().trim()] = m;
    }
  }
  parsed.meals = DAYS_ORDER.map((day) => {
    const m = byDay[day] || {};
    return {
      day,
      lunch: mealsPerDay === 1 ? null : (m.lunch || null),
      dinner: m.dinner || null,
    };
  });
  if (!parsed.title || typeof parsed.title !== 'string') {
    parsed.title = 'Ma semaine gourmande';
  }
  return parsed;
}

// Analyse une image via Gemini Vision (gemini-2.5-flash accepte les images
// inline). imageBase64 doit être la chaîne PURE (sans préfixe data:...).
// Renvoie un tableau d'items détectés : [{ name, quantity, unit, confidence }].
// Tableau vide si rien de détecté ou si parsing de la réponse échoue (on log
// pour debug mais on ne crash pas). Timeout 30s via AbortController.
// Utilisé par scanReceipt (tickets) et scanFridge (photos de frigo).
const SCAN_TIMEOUT_MS = 30000;

async function _scanImage({ prompt, logPrefix, imageBase64, mimeType = 'image/jpeg' }) {
  if (!GEMINI_KEY) {
    throw new Error(
      "La génération IA n'est pas disponible pour le moment. Réessayez plus tard."
    );
  }
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    throw new Error('Image manquante ou invalide.');
  }

  const sizeKB = Math.round((imageBase64.length * 3) / 4 / 1024);
  console.log(`${logPrefix} Image size:`, sizeKB, 'KB');

  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${ENDPOINT}?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: imageBase64 } },
          ],
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeoutId);
    if (e?.name === 'AbortError') {
      throw new Error('Analyse trop longue. Réessaie avec une photo moins lourde.');
    }
    throw handleGeminiError(e);
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    const err = new Error(`Gemini ${res.status}`);
    err.status = res.status;
    throw handleGeminiError(err);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '');

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.warn(`${logPrefix} JSON parse fail:`, e.message, 'text=', cleaned.slice(0, 200));
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const items = parsed
    .map((it) => {
      if (!it || typeof it !== 'object') return null;
      const name = (it.name || '').toString().toLowerCase().trim();
      if (!name) return null;
      let quantity = it.quantity;
      if (quantity === '' || quantity === undefined) quantity = null;
      if (typeof quantity === 'string') {
        const n = parseFloat(quantity.replace(',', '.'));
        quantity = isNaN(n) ? null : n;
      }
      if (typeof quantity === 'number' && (isNaN(quantity) || quantity <= 0)) {
        quantity = null;
      }
      const unit = (it.unit || '').toString().trim() || null;
      const confidence = ['high', 'medium', 'low'].includes(it.confidence)
        ? it.confidence
        : 'medium';
      return { name, quantity, unit, confidence };
    })
    .filter(Boolean);

  const durationMs = Date.now() - start;
  console.log(`${logPrefix} Items detected:`, items.length);
  console.log(`${logPrefix} Duration:`, durationMs, 'ms');

  return items;
}

export async function scanReceipt(imageBase64, mimeType = 'image/jpeg', userId) {
  await _checkQuota(userId, 'user', 'scanReceipt');

  const prompt = `Tu es un assistant qui analyse des tickets de caisse de supermarché.

Je te montre une photo d'un ticket de caisse. Ta mission : identifier UNIQUEMENT les produits alimentaires achetés, avec leurs quantités précises si indiquées.

RÈGLES IMPORTANTES :
- Ignore TOUS les produits non-alimentaires (sacs, produits ménagers, hygiène, électronique, etc.)
- Pour chaque produit alimentaire, extrais :
  * Le nom en français, SIMPLIFIÉ et MINUSCULE (ex: "VIANDE HACHEE BIO 500G" → "viande hachée")
  * La quantité numérique si visible (poids, volume, nombre d'unités)
  * L'unité (g, kg, ml, L, unité)
  * Ton niveau de confiance : "high", "medium" ou "low" selon la lisibilité
- Si un produit alimentaire affiche une MULTIPLICATION (ex: "LAIT DEMI ECREMEE x3", "YAOURT x 2", "OEUFS X2"), mets quantity = ce nombre et unit = "unité".
- Si le produit est clairement alimentaire mais la quantité/unité est ambiguë, mets quantity = null et unit = null.
- Si le ticket est illisible, partiel, ou ne semble pas être un ticket de caisse, retourne un tableau vide [].

Réponds UNIQUEMENT en JSON strict, sans markdown, sans backticks, sans commentaire avant ou après. Format :

[
  { "name": "viande hachée", "quantity": 500, "unit": "g", "confidence": "high" },
  { "name": "œufs", "quantity": 6, "unit": "unité", "confidence": "high" },
  { "name": "lait demi-écrémé", "quantity": 1, "unit": "L", "confidence": "medium" }
]

Tableau vide [] si rien d'alimentaire détecté.`;

  return _scanImage({ prompt, logPrefix: '[scanReceipt]', imageBase64, mimeType });
}

// Analyse une photo de frigo ouvert. Prompt orienté "identification visuelle
// conservative" : on ne devine pas le contenu des contenants fermés, on
// estime les quantités visibles, on renvoie confidence low/medium/high.
// Fiabilité attendue 70-80% (vs ~90% ticket) car l'IA doit faire de la
// reconnaissance visuelle d'objets au lieu de lire du texte structuré.
export async function scanFridge(imageBase64, mimeType = 'image/jpeg', userId) {
  await _checkQuota(userId, 'user', 'scanFridge');

  const prompt = `Tu es un assistant qui analyse des photos de frigo pour identifier les aliments visibles.

Je te montre une photo de l'intérieur d'un frigo ouvert. Ta mission : identifier tous les aliments CLAIREMENT VISIBLES et identifiables.

RÈGLES IMPORTANTES :
- Identifie uniquement les aliments que tu peux reconnaître AVEC CERTITUDE (pas de suppositions hasardeuses sur des contenants fermés sans étiquette)
- Pour chaque aliment, extrait :
  * Le nom en français, SIMPLIFIÉ et MINUSCULE (ex: 'TOMATES CERISES BIO' → 'tomates cerises')
  * La quantité visuelle estimée (ex: 3 tomates visibles → quantity=3)
  * L'unité appropriée :
    - 'unité' pour les fruits/légumes entiers (3 pommes, 2 citrons)
    - 'g' pour les aliments emballés si le poids est lisible sur l'étiquette (ex: '500g' sur un paquet)
    - 'ml' ou 'L' pour les liquides (1L lait, 50cl crème)
    - null si impossible à estimer
  * Ton niveau de confiance : 'high', 'medium', ou 'low' selon la clarté de l'identification

- Ne devine PAS le contenu de pots/contenants fermés sans étiquette visible
- Ignore les emballages vides, les éléments du frigo lui-même (clayettes, bacs), et les non-aliments
- Si le frigo est vide ou si la photo n'est pas un frigo, retourne []

- Sois conservateur sur les quantités : en cas de doute, préfère null plutôt qu'un mauvais chiffre. L'utilisateur corrigera lui-même.

Réponds UNIQUEMENT en JSON strict, pas de markdown, pas de commentaires. Format :

[
  { "name": "tomates cerises", "quantity": 8, "unit": "unité", "confidence": "high" },
  { "name": "lait", "quantity": 1, "unit": "L", "confidence": "high" },
  { "name": "fromage blanc", "quantity": null, "unit": null, "confidence": "medium" }
]

Tableau vide [] si rien d'identifiable détecté.`;

  return _scanImage({ prompt, logPrefix: '[scanFridge]', imageBase64, mimeType });
}

export async function adjustRecipeServings({ recipe, newServings, userId }) {
  await _checkQuota(userId, 'user', 'adjustRecipeServings');
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
