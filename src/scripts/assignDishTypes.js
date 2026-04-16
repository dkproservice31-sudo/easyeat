#!/usr/bin/env node
/**
 * Assigne le bon dish_type à toutes les recettes ayant dish_type='tout'
 * via Gemini. Met à jour Supabase en bypass RLS via la service_role key.
 *
 * Variables d'environnement (.env) :
 *   EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   EXPO_PUBLIC_GEMINI_KEY
 *
 * Usage : node src/scripts/assignDishTypes.js
 */

const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
  });
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !GEMINI_KEY) {
  console.error('❌ Variables manquantes dans .env');
  process.exit(1);
}

const ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

async function classify(title, ingredients) {
  const prompt = `Voici une recette :
Titre : ${title || '(sans titre)'}.
Ingrédients : ${ingredients || '(non précisés)'}.
Détermine le type de plat parmi EXACTEMENT une de ces valeurs : viande, poisson, vegan, végétarien, dessert.
Règles :
- viande = contient de la viande (bœuf, poulet, porc, agneau, canard, etc.)
- poisson = contient du poisson ou fruits de mer (saumon, morue, crevettes, etc.) mais PAS de viande
- vegan = AUCUN produit animal
- végétarien = pas de viande, pas de poisson, mais peut contenir lait, œuf, beurre, fromage
- dessert = plat sucré (gâteau, tarte, crème, glace, etc.)
Réponds UNIQUEMENT avec le mot, rien d'autre.`;

  const res = await fetch(`${ENDPOINT}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '')
    .trim()
    .toLowerCase();
  const VALID = ['viande', 'poisson', 'vegan', 'végétarien', 'vegetarien', 'dessert'];
  const found = VALID.find((v) => text.includes(v));
  if (!found) return null;
  return found === 'vegetarien' ? 'végétarien' : found;
}

async function fetchRecipes() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/recipes?select=id,title,ingredients,dish_type&dish_type=eq.tout`,
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    }
  );
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.json();
}

async function updateRecipe(id, dishType) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/recipes?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ dish_type: dishType }),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const recipes = await fetchRecipes();
  console.log(`📦 ${recipes.length} recette(s) à classifier`);
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < recipes.length; i++) {
    const r = recipes[i];
    try {
      const dt = await classify(r.title, r.ingredients);
      if (!dt) {
        console.log(`${i + 1}/${recipes.length} - ${r.title} → ⚠️  réponse invalide`);
        failed++;
      } else {
        await updateRecipe(r.id, dt);
        console.log(`${i + 1}/${recipes.length} - ${r.title} → ${dt}`);
        ok++;
      }
    } catch (err) {
      console.log(`${i + 1}/${recipes.length} - ${r.title} → ❌ ${err.message}`);
      failed++;
    }
    await sleep(500);
  }
  console.log(`\n✅ Terminé : ${ok} mises à jour, ${failed} échec(s)`);
})();
