// Trainers mapping for /train enemies (tier-locked, element-specific)
// Generated from provided image URLs

export const TRAINERS = [
  // FIRE
  {
    id: 'fledgling_ember',
    name: 'Fledgling Ember',
    element: 'FIRE',
    tier: 1,
    tier_level_range: [1, 8],
    image_url: 'https://github.com/EM-ade/realmkin-monsters/blob/main/Fledgling%20Ember.png?raw=true',
    lore: 'A novice touched by the first sparks, Ember learns to tame the flicker before the blaze. Every victory fans the flame a little brighter.',
    tags: ['elemental', 'starter']
  },
  {
    id: 'furious_blaze',
    name: 'Furious Blaze',
    element: 'FIRE',
    tier: 2,
    tier_level_range: [9, 17],
    image_url: 'https://github.com/EM-ade/realmkin-monsters/blob/main/Furious%20Blaze.png?raw=true',
    lore: 'The Blaze roars with tempered fury, armor charred and runes glowing. It advances without fear, leaving heat-haze in its wake.',
    tags: ['elemental']
  },
  {
    id: 'raging_pyre',
    name: 'Raging Pyre',
    element: 'FIRE',
    tier: 3,
    tier_level_range: [18, 25],
    image_url: 'https://github.com/EM-ade/realmkin-monsters/blob/main/Raging%20Pyre.png?raw=true',
    lore: 'A walking bonfire with a will of iron. The Pyre’s molten strikes melt shields and resolve alike.',
    tags: ['elemental', 'elite']
  },
  {
    id: 'cataclysmic_inferno',
    name: 'Cataclysmic Inferno',
    element: 'FIRE',
    tier: 4,
    tier_level_range: [18, 25],
    image_url: 'https://github.com/EM-ade/realmkin-monsters/blob/main/Cataclysmic%20Inferno.png?raw=true',
    lore: 'The apex of flame—an eruption given form. Where the Inferno walks, ash follows and the horizon glows red.',
    tags: ['elemental', 'boss']
  },

  // LIGHTNING
  {
    id: 'spark_striker',
    name: 'Spark Striker',
    element: 'LIGHTNING',
    tier: 1,
    tier_level_range: [1, 8],
    image_url: 'https://github.com/EM-ade/realmkin-monsters/blob/main/Spark%20Striker.png?raw=true',
    lore: 'Quick-tempered and quicker still with a blade, the Striker crackles with mischief and momentum.',
    tags: ['elemental', 'starter']
  },
  {
    id: 'conduit_champion',
    name: 'Conduit Champion',
    element: 'LIGHTNING',
    tier: 2,
    tier_level_range: [9, 17],
    image_url: 'https://github.com/EM-ade/realmkin-monsters/blob/main/Conduit%20Champion%20(Advanced).png?raw=true',
    lore: 'Battle-tested and wired to the storm, the Champion channels arcs through coil-forged gauntlets.',
    tags: ['elemental']
  },
  {
    id: 'conduit_champion_advanced',
    name: 'Conduit Champion (Advanced)',
    element: 'LIGHTNING',
    tier: 3,
    tier_level_range: [18, 25],
    image_url: 'https://github.com/EM-ade/realmkin-monsters/blob/main/Conduit%20Champion%20(Advanced).png?raw=true',
    lore: 'Surging with refined current, this Champion conducts power with precision—every motion a measured thunderclap.',
    tags: ['elemental', 'elite']
  },
  {
    id: 'maelstrom_incarnate',
    name: 'Maelstrom Incarnate',
    element: 'LIGHTNING',
    tier: 4,
    tier_level_range: [18, 25],
    image_url: 'https://github.com/EM-ade/realmkin-monsters/blob/main/Maelstrom%20Incarnate.png?raw=true',
    lore: 'The storm made sovereign. Lightning crowns its brow and the earth blackens under each step.',
    tags: ['elemental', 'boss']
  },

  // NATURE
  {
    id: 'verdant_scout',
    name: 'Verdant Scout',
    element: 'NATURE',
    tier: 1,
    tier_level_range: [1, 8],
    image_url: 'https://github.com/EM-ade/realmkin-monsters/blob/main/Verdant%20Scout.png?raw=true',
    lore: 'A swift ward of the green, the Scout moves with quiet step and watchful eyes. The forest whispers warnings and welcomes.',
    tags: ['elemental', 'starter']
  },
  {
    id: 'sylvan_knight',
    name: 'Sylvan Knight',
    element: 'NATURE',
    tier: 2,
    tier_level_range: [9, 17],
    image_url: 'https://github.com/EM-ade/realmkin-monsters/blob/main/Sylvan%20Knight.png?raw=true',
    lore: 'Barkbound and oath-sworn, the Knight stands as the forest’s firm reply to steel.',
    tags: ['elemental']
  },
  {
    id: 'sylvan_knight_advanced',
    name: 'Sylvan Knight (Advanced)',
    element: 'NATURE',
    tier: 3,
    tier_level_range: [18, 25],
    image_url: 'https://github.com/EM-ade/realmkin-monsters/blob/main/Sylvan%20Knight%20(Advanced).png?raw=true',
    lore: 'Old growth and older vows—this Knight wields blooming resolve and thorned judgment.',
    tags: ['elemental', 'elite']
  },
  {
    id: 'terran_avatar',
    name: 'Terran Avatar',
    element: 'NATURE',
    tier: 4,
    tier_level_range: [18, 25],
    image_url: 'https://github.com/EM-ade/realmkin-monsters/blob/main/Terran%20Avatar.png?raw=true',
    lore: 'Bedrock and root intertwined. The earth itself rises to answer in this living mantle.',
    tags: ['elemental', 'boss']
  },

  // LIGHT
  {
    id: 'initiate_of_dawn',
    name: 'Initiate of Dawn',
    element: 'LIGHT',
    tier: 1,
    tier_level_range: [1, 8],
    image_url: 'https://github.com/EM-ade/realmkin-monsters/blob/main/Initiate%20of%20Dawn.png?raw=true',
    lore: 'A pilgrim of first light, humbly armored and bright-eyed. The dawn’s promise steadies their hand.',
    tags: ['elemental', 'starter']
  },
  {
    id: 'vindicator',
    name: 'Vindicator',
    element: 'LIGHT',
    tier: 2,
    tier_level_range: [9, 17],
    image_url: 'https://github.com/EM-ade/realmkin-monsters/blob/main/Vindicator.png?raw=true',
    lore: 'Justice tempered by mercy. Under the sigil of light, the Vindicator shields the weak and rebukes the wicked.',
    tags: ['elemental']
  },
  {
    id: 'paragon_of_light',
    name: 'Paragon of Light',
    element: 'LIGHT',
    tier: 3,
    tier_level_range: [18, 25],
    image_url: 'https://github.com/EM-ade/realmkin-monsters/blob/main/Paragon%20of%20Light.png?raw=true',
    lore: 'Radiance given purpose. Their presence is a benediction; their edge, a lesson carved in gold.',
    tags: ['elemental', 'elite']
  },
  {
    id: 'living_legend',
    name: 'Living Legend',
    element: 'LIGHT',
    tier: 4,
    tier_level_range: [18, 25],
    image_url: 'https://github.com/EM-ade/realmkin-monsters/blob/main/Living%20Legend.png?raw=true',
    lore: 'A tale still being told in blazing script. Wherever they stride, the world remembers.',
    tags: ['elemental', 'boss']
  },

  // NEUTRAL / Weapon mastery track (optional)
  {
    id: 'proving_grounds_recruit',
    name: 'Proving Grounds Recruit',
    element: 'NEUTRAL',
    tier: 1,
    tier_level_range: [1, 8],
    image_url: 'https://github.com/EM-ade/realmkin-monsters/blob/main/Proving%20Grounds%20Recruit.png?raw=true',
    lore: 'Fresh from trials, the Recruit bears more grit than polish—but grit wins long wars.',
    tags: ['neutral', 'starter']
  },
  {
    id: 'master_at_arms',
    name: 'Master-at-Arms',
    element: 'NEUTRAL',
    tier: 2,
    tier_level_range: [9, 17],
    image_url: 'https://github.com/EM-ade/realmkin-monsters/blob/main/Master-at-Arms.png?raw=true',
    lore: 'A tactician of steel and stance, honed on countless sparring floors.',
    tags: ['neutral']
  },
  {
    id: 'master_at_arms_advanced',
    name: 'Master-at-Arms (Advanced)',
    element: 'NEUTRAL',
    tier: 3,
    tier_level_range: [18, 25],
    image_url: 'https://github.com/EM-ade/realmkin-monsters/blob/main/Master-at-Arms%20(Advanced).png?raw=true',
    lore: 'Technique perfected until it sings. Every motion is a measured checkmate.',
    tags: ['neutral', 'elite']
  },
  {
    id: 'vindicator_advanced',
    name: 'Vindicator (Advanced)',
    element: 'NEUTRAL',
    tier: 4,
    tier_level_range: [18, 25],
    image_url: 'https://github.com/EM-ade/realmkin-monsters/blob/main/Vindicator%20(Advanced).png?raw=true',
    lore: 'Doctrine and discipline refined to brilliance. Mercy when earned; judgment when required.',
    tags: ['neutral', 'boss']
  }
];

export function selectTrainer(playerTier = 1, playerTierLevel = 1) {
  const tier = Math.max(1, Math.min(4, playerTier));
  const lvl = Math.max(1, Math.min(25, playerTierLevel));

  // Prefer same tier; 25% chance to use tier-1 (if available)
  const preferLower = Math.random() < 0.25 && tier > 1;
  const allowedTiers = preferLower ? [tier - 1, tier] : [tier, tier - 1].filter(t => t >= 1);

  // Filter by allowed tiers and level range
  let candidates = TRAINERS.filter(t => allowedTiers.includes(t.tier) && lvl >= t.tier_level_range[0] && lvl <= t.tier_level_range[1]);

  // Fallback: if empty, relax level check within allowed tiers
  if (candidates.length === 0) {
    candidates = TRAINERS.filter(t => allowedTiers.includes(t.tier));
  }

  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
