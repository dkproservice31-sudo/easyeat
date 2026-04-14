#!/usr/bin/env node
/**
 * Génère 20 recettes françaises classiques via Gemini 2.5 Flash
 * et les insère dans Supabase avec featured=true, generated_by_ai=true.
 *
 * Variables d'environnement requises (dans .env) :
 *   EXPO_PUBLIC_SUPABASE_URL    — URL du projet Supabase
 *   SUPABASE_SERVICE_ROLE_KEY   — clé service_role (bypass RLS, NE PAS exposer côté client)
 *   EXPO_PUBLIC_GEMINI_KEY      — clé Gemini
 *   FEATURED_OWNER_ID           — UUID d'un utilisateur existant qui "possède" les recettes featured
 *
 * Usage :
 *   node src/scripts/generateFeaturedRecipes.js
 */

const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '..', '.env');
console.log('ENV PATH:', envPath);
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
  });
}

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = process.env.EXPO_PUBLIC_GEMINI_KEY;
const OWNER_ID = process.env.FEATURED_OWNER_ID;

if (!SUPABASE_URL || !SERVICE_KEY || !GEMINI_KEY || !OWNER_ID) {
  console.error(
    'ERREUR: variables manquantes. Requis: EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EXPO_PUBLIC_GEMINI_KEY, FEATURED_OWNER_ID'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const dedupe = (arr) => [...new Set(arr)];

const CUISINES = {
  française: dedupe([
    // Existantes
    'Bœuf Bourguignon',
    'Coq au Vin',
    'Ratatouille',
    'Quiche Lorraine',
    "Soupe à l'Oignon",
    'Bouillabaisse',
    'Crêpes',
    'Tarte Tatin',
    'Cassoulet',
    'Pot-au-feu',
    'Blanquette de Veau',
    'Gratin Dauphinois',
    'Moules Marinières',
    'Salade Niçoise',
    'Magret de Canard',
    'Foie Gras Poêlé',
    'Confit de Canard',
    'Vichyssoise',
    'Crème Brûlée',
    'Profiteroles',
    // Ajouts
    'Sole Meunière',
    'Coquilles Saint-Jacques',
    'Terrine de Campagne',
    'Pissaladière',
    'Poulet Rôti',
    'Gratin de Poireaux',
    'Brandade de Morue',
    'Tartiflette',
    'Fondue Savoyarde',
    'Daube Provençale',
    "Navarin d'Agneau",
    "Gigot d'Agneau",
    'Pain Perdu',
    'Clafoutis aux Cerises',
    'Far Breton',
    'Kouign-Amann',
    'Madeleines',
    'Financiers',
    'Tarte aux Pommes',
    'Île Flottante',
  ]),
  italienne: dedupe([
    // Existantes
    'Pizza Margherita',
    'Spaghetti Carbonara',
    'Lasagnes à la Bolognaise',
    'Risotto aux Champignons',
    'Tiramisu',
    'Osso Buco',
    'Minestrone',
    'Gnocchi à la Sauce Tomate',
    'Penne Arrabbiata',
    'Saltimbocca alla Romana',
    'Panna Cotta',
    'Bruschetta',
    // Ajouts
    'Spaghetti Bolognese',
    'Lasagnes',
    'Saltimbocca',
    'Vitello Tonnato',
    'Gnocchi Sorrentina',
    "Penne all'Arrabbiata",
    'Tagliatelle al Ragù',
    'Fettuccine Alfredo',
    'Focaccia',
    'Ribollita',
    'Zuppa di Pesce',
    'Branzino al Forno',
    'Parmigiana di Melanzane',
    'Arancini',
    'Caponata',
    'Baccalà alla Vicentina',
    'Polpette al Sugo',
    'Porchetta',
    'Bistecca alla Fiorentina',
    'Tiramisù',
    'Cannoli Siciliani',
    'Zabaione',
    'Torta Caprese',
    'Affogato',
  ]),
  espagnole: dedupe([
    // Existantes
    'Paella Valenciana',
    'Gazpacho',
    'Tortilla Española',
    'Patatas Bravas',
    'Churros au Chocolat',
    'Pulpo a la Gallega',
    'Gambas al Ajillo',
    'Fabada Asturiana',
    'Crema Catalana',
    'Albondigas',
    'Pisto Manchego',
    'Sangria',
    // Ajouts
    'Salmorejo',
    'Cocido Madrileño',
    'Albondigas en Salsa',
    'Pollo al Ajillo',
    'Cordero Asado',
    'Merluza a la Vasca',
    'Bacalao al Pil Pil',
    'Croquetas de Jamón',
    'Pan con Tomate',
    'Ensaladilla Rusa',
    'Pimientos del Piquillo Rellenos',
    'Churros con Chocolate',
    'Paella de Mariscos',
    'Cochinillo Asado',
    'Lentejas con Chorizo',
    'Migas',
    'Porrusalda',
    'Marmitako',
    'Fideuà',
    'Arroz con Leche',
    'Turrón',
  ]),
};

const SCHEMA = {
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

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

async function generateRecipe(name, cuisine) {
  const adjectif = {
    française: 'française',
    italienne: 'italienne',
    espagnole: 'espagnole',
  }[cuisine] || cuisine;

  const prompt = `Tu es un chef cuisinier francophone. Donne la recette traditionnelle ${adjectif} classique de "${name}" pour 2 personnes.

Contraintes :
- "title" : exactement "${name}"
- "description" : 1 à 2 phrases qui présentent le plat
- "ingredients" : une ligne par ingrédient avec quantité et unité (ex : "200g de farine\\n3 œufs")
- "steps" : étapes numérotées, une par ligne (ex : "1. Préchauffer le four...\\n2. ...")
- "duration" : durée totale en minutes (entier)
- "cooking_temp" : température en °C (entier, ou 0 si pas de four)
- "cooking_type" : l'une de : "Au four", "Poêle", "Vapeur", "Grill", "Friture", "Mijotage", "Wok", "Sans cuisson"
- "fat_type" : l'une de : "Huile d'olive", "Huile de tournesol", "Beurre", "Huile de coco", "Huile de sésame", "Saindoux", "Sans matière grasse"
- Réponds en français, recette pour 2 personnes uniquement.`;

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: SCHEMA,
        temperature: 0.6,
      },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini ${res.status}: ${t}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Réponse Gemini vide');
  return JSON.parse(text);
}

async function run() {
  const total = Object.values(CUISINES).reduce((n, arr) => n + arr.length, 0);
  console.log(`Génération de ${total} recettes...\n`);
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const [cuisine, names] of Object.entries(CUISINES)) {
    console.log(`\n— Cuisine ${cuisine} —`);
    for (const name of names) {
      const { data: existing } = await supabase
        .from('recipes')
        .select('id, cuisine')
        .eq('featured', true)
        .eq('title', name)
        .maybeSingle();

      if (existing) {
        // Si la cuisine n'est pas encore renseignée, on la met à jour
        if (!existing.cuisine) {
          await supabase
            .from('recipes')
            .update({ cuisine })
            .eq('id', existing.id);
          console.log(`↻  ${name} (cuisine mise à jour)`);
        } else {
          console.log(`⏭  ${name} (déjà existante)`);
        }
        skipped++;
        continue;
      }

      try {
        console.log(`→  ${name}...`);
        const r = await generateRecipe(name, cuisine);
        const { error } = await supabase.from('recipes').insert({
          user_id: OWNER_ID,
          title: r.title || name,
          description: r.description || null,
          ingredients: r.ingredients || null,
          steps: r.steps || null,
          servings: 2,
          duration: r.duration || null,
          cooking_temp:
            r.cooking_temp && r.cooking_temp > 0 ? r.cooking_temp : null,
          cooking_type: r.cooking_type || null,
          fat_type: r.fat_type || null,
          featured: true,
          generated_by_ai: true,
          cuisine,
        });
        if (error) throw error;
        console.log(`✓  ${name}`);
        ok++;
      } catch (err) {
        console.error(`✗  ${name} — ${err.message}`);
        failed++;
      }
    }
  }

  console.log(`\nTerminé. ${ok} créées, ${skipped} ignorées, ${failed} échouées.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
