// Mapping cuisine (en français, insensible à la casse et aux accents) →
// emoji drapeau + courte description.

const FLAGS = {
  francaise: '🇫🇷',
  italienne: '🇮🇹',
  espagnole: '🇪🇸',
  armenienne: '🇦🇲',
  armenie: '🇦🇲',
  libanaise: '🇱🇧',
  japonaise: '🇯🇵',
  mexicaine: '🇲🇽',
  marocaine: '🇲🇦',
  indienne: '🇮🇳',
  turque: '🇹🇷',
  grecque: '🇬🇷',
  portugaise: '🇵🇹',
  thailandaise: '🇹🇭',
  chinoise: '🇨🇳',
  coreenne: '🇰🇷',
  roumaine: '🇷🇴',
  georgienne: '🇬🇪',
};

const DESCRIPTIONS = {
  francaise: "La gastronomie française, patrimoine mondial de l'UNESCO",
  italienne: 'La cucina italiana, tradition et simplicité',
  espagnole: 'Tapas, paella et saveurs méditerranéennes',
  armenienne: "Une des plus anciennes cuisines du monde",
  armenie: "Une des plus anciennes cuisines du monde",
  libanaise: 'Mezzés, épices et convivialité du Levant',
  japonaise: 'Raffinement, umami et produits de la mer',
  mexicaine: 'Maïs, piment et saveurs ensoleillées',
  marocaine: 'Tajines, couscous et épices envoûtantes',
  indienne: 'Un univers d’épices et de currys parfumés',
  turque: 'Kebabs, mezze et douceurs de l’Orient',
  grecque: 'Huile d’olive, feta et soleil méditerranéen',
  portugaise: 'Morue, pastéis et chaleur de l’Atlantique',
  thailandaise: 'Équilibre sucré, salé, acide et pimenté',
  chinoise: 'Wok, nouilles et cinq saveurs millénaires',
  coreenne: 'Kimchi, barbecue et piquant bienfaisant',
  roumaine: 'Cuisine généreuse des Carpates',
  georgienne: 'Khachapouri, khinkali et vins ancestraux',
};

function normalize(s) {
  if (!s) return '';
  return s
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function getCountryFlag(cuisine) {
  const key = normalize(cuisine);
  return FLAGS[key] || '🏳️';
}

export function getCountryDescription(cuisine) {
  const key = normalize(cuisine);
  return DESCRIPTIONS[key] || 'Découvrez les saveurs de ce pays';
}
