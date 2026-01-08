import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse command line args for skin selection
const args = process.argv.slice(2);
const skinArg = args.find(arg => arg.startsWith('--skin='));
const skinType = skinArg ? skinArg.split('=')[1] : 'original';

if (skinType !== 'original' && skinType !== 'cartoon') {
  console.error('Error: Invalid skin type. Use --skin=original or --skin=cartoon');
  process.exit(1);
}

const OUTPUT_DIR = skinType === 'cartoon'
  ? join(__dirname, '..', 'public', 'images-cartoon')
  : join(__dirname, '..', 'public', 'images');

const API_KEY = process.env.GOOGLE_API_KEY;
// Gemini 3 Pro Image Preview (aka "Nano Banana Pro") - highest quality image generation
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent';

if (!API_KEY) {
  console.error('Error: GOOGLE_API_KEY environment variable is required');
  console.error('Usage: GOOGLE_API_KEY=<your-key> npm run generate-images [--skin=original|cartoon]');
  process.exit(1);
}

// ============================================
// ORIGINAL SKIN PROMPTS (Dark Fantasy)
// ============================================
const ORIGINAL_STYLE_PREFIX = `Card artwork for FORGE, a cosmic alchemical strategy card game. Square 1:1 aspect ratio. No text, letters, words, or writing of any kind. No frames, borders, or card-like edges - the art fills the entire image. Dark fantasy meets cosmic horror with alchemical symbolism. Baroque sci-fi aesthetic - ornate machinery fused with organic growth, ancient symbols glowing with unnatural light. Heavy shadows with dramatic rim lighting. Rich textures: tarnished metals, iridescent chitin, crystalline structures. Background color must be strongly dominated by the faction's signature colors. Center focus on subject with atmospheric gradients. Ominous grandeur, forces beyond human scale.`;

const ORIGINAL_FACTION_THEMES: Record<string, string> = {
  'Crimson Covenant': `Biology as warfare. Chitinous armor plates, pulsing organic tissue, thorn-covered vines with intent. Bio-engineered predators: sleek, fast, covered in natural weapons. Xenomorphic creatures crossed with carnivorous plants. Deep burgundy, crimson, dark pink flesh tones against black chitin. Wounds sprout new growth.`,

  'Iron Tide': `Brutal industrial warfare. Massive constructs of riveted steel, exhaust ports belching dark smoke, crushing treads. War machines - no pretense of humanity, just function and firepower. WW1 tanks meets steampunk walker meets brutalist architecture. Gunmetal grey, dark steel blues, brass accents, rust. Surfaces scarred from combat.`,

  'Void Legion': `The breaking of order. Twisted humanoid forms - too many limbs, geometries that don't connect right, faces hidden. Cultist aesthetics meets cosmic horror: tattered robes revealing something not quite flesh, ceremonial weapons dripping with malice. Deep blacks with purple edges, sickly yellows, void-deep purples. Shadows don't behave correctly.`,

  'Silk Network': `Wealth as power, information as currency. Ornate armor - gold filigree, amber inlays, silk accents. Diplomat-assassins with hidden blades, merchant-princes with bodyguards, envoys with deadly grace. Renaissance intrigue meets asian merchant guilds meets surveillance. Rich golds, deep ambers, bronze, cream silk, data-stream blue highlights.`,

  'Dream Garden': `Nature is neither kind nor cruel. Robed figures tending impossible flora, guardians more plant than person, plants given terrible purpose. Sacred grove meets psychedelic nightmare: bioluminescent flowers with too many petals, trees with bark like eyes, moss in sacred geometric patterns. Soft teals, seafoam greens, moonlit silvers, lavender.`,

  'Ghost Protocol': `Information warfare in physical form. Agents in tactical gear with digital camouflage that glitches and shifts, shadows given form, data entities manifesting in meatspace. Cyberpunk espionage meets digital ghost stories. Pale greys, silver-blues, null-space blacks, scanline greens, error-message red accents. Half-phased out of reality.`,

  'General': `Remnants and results of cosmic war. Supply drops, abandoned materiel, hastily-fortified positions, battle-scarred professionals. Utilitarian tans, military greens, weathered browns, neutral greys. War's supporting cast - essential but not glorious.`
};

// ============================================
// CARTOON SKIN PROMPTS (Kid-friendly)
// ============================================
const CARTOON_STYLE_PREFIX = `Square 1:1 aspect ratio. No text, letters, words, or writing of any kind. Bright, cheerful cartoon illustration in a modern animated style. Soft rounded shapes, friendly characters, vibrant saturated colors. Clean linework with subtle shading. Whimsical and playful atmosphere. Style inspired by modern children's animation (Bluey, Hilda, Steven Universe). Kid-friendly imagery only - no scary elements, weapons shown as toys or tools. Warm lighting, pastel accents, everything looks huggable and inviting. Characters should have big expressive eyes and friendly smiles.`;

const CARTOON_FACTION_THEMES: Record<string, string> = {
  'Crimson Covenant': `Berry-themed friends! Cute strawberry characters, cherry companions, raspberry helpers. Red and pink color scheme with green leaf accents. Garden setting with berry bushes, jam jars as treasures, fruit baskets. Everything looks sweet and delicious. Friendly expressions, rosy cheeks. Strawberry Squad adventures in a whimsical berry patch.`,

  'Iron Tide': `Friendly robot friends! Cute mechanical helpers with expressive LED eyes, chrome bodies with colorful buttons and dials. Workshop settings with gears, wrenches, and building blocks. Constructive and helpful vibes. Robots that build, fix, and create. Shiny metal with rainbow reflections. Robot Rangers working together in a fun workshop.`,

  'Void Legion': `Magical sparkle sprites! Glittery fairy-like creatures made of stardust. Rainbow colors, iridescent wings, trails of sparkles and glitter. Magical effects like floating crystals, prisms, light beams. Cosmic but friendly - cute aliens, smiling stars, playful comets. Sparkle Sprites bringing magic and wonder.`,

  'Silk Network': `Treasure friends and gift-givers! Characters carrying presents, treasure chests full of toys, golden coins that look like chocolate. Party atmosphere with ribbons, bows, and wrapped gifts. Sharing and generosity themes. Warm yellows and golds with festive accents. Treasure Troop spreading joy and presents.`,

  'Dream Garden': `Happy flower friends! Smiling sunflowers, dancing daisies, friendly butterflies and bees. Lush garden settings with rainbows, watering cans, garden tools as fun items. Bright greens, cheerful yellows, soft pinks. Nature that looks alive and friendly. Cozy garden vibes. Flower Friends tending a magical garden.`,

  'Ghost Protocol': `Fluffy cloud buddies! Soft puffy clouds with cute faces, floating through blue skies. Hide-and-seek themes with clouds playing games. Gentle mist, soft grays and whites with sky blue accents. Cozy blanket forts, pillow castles, soft and comforting imagery. Cloud Crew having fluffy adventures.`,

  'General': `Helpful supply stars! Floating star-shaped helpers carrying useful items. Backpacks, lunchboxes, craft supplies, building materials - all cute and appealing. Neutral but cheerful colors. Rainbow star trails. Everything looks ready for an adventure or craft project. Supply Stars ready to help!`
};

// Select prompts based on skin type
const STYLE_PREFIX = skinType === 'cartoon' ? CARTOON_STYLE_PREFIX : ORIGINAL_STYLE_PREFIX;
const FACTION_THEMES = skinType === 'cartoon' ? CARTOON_FACTION_THEMES : ORIGINAL_FACTION_THEMES;

interface CardPrompt {
  cardName: string;
  fileName: string;
  faction: string;
  description: string;
  cartoonDescription?: string; // Optional cartoon-specific description
}

// All 66 unique cards with their unit-specific descriptions
const CARDS: CardPrompt[] = [
  // Crimson Covenant (9 cards)
  {
    cardName: 'Bloodthorn Seedling',
    fileName: 'bloodthorn-seedling',
    faction: 'Crimson Covenant',
    description: 'A thorny seedling pod with organic tendrils, dripping with crimson sap, half-buried in dark soil. Barely emerged but already predatory.',
    cartoonDescription: 'A cute baby strawberry plant just sprouting from the ground, with tiny leaves and a happy face. Dewdrops sparkle like gems.'
  },
  {
    cardName: 'Symbiote Spawn',
    fileName: 'symbiote-spawn',
    faction: 'Crimson Covenant',
    description: 'Small chitinous creatures clustering together, each one part-insect part-something-worse, moving as a coordinated swarm.',
    cartoonDescription: 'A group of adorable berry buddies - little strawberries, raspberries, and cherries playing together in a berry patch.'
  },
  {
    cardName: 'Crimson Agent',
    fileName: 'crimson-agent',
    faction: 'Crimson Covenant',
    description: 'A humanoid figure in bio-organic armor, crimson and black, with thorn-like protrusions. Face partially obscured by chitinous plates. Carries organic weapons that look grown, not forged.',
    cartoonDescription: 'A friendly strawberry character wearing a gardening apron, carrying a watering can and trowel, ready to help plants grow.'
  },
  {
    cardName: 'Hostile Takeover',
    fileName: 'hostile-takeover',
    faction: 'Crimson Covenant',
    description: 'A scene of one unit consuming or overgrowing another, aggressive biological warfare in action, thorny vines crushing steel.',
    cartoonDescription: 'Berry friends giving big warm hugs, vines gently wrapping around in a friendly embrace. Hearts and sparkles everywhere.'
  },
  {
    cardName: 'Predator Pack',
    fileName: 'predator-pack',
    faction: 'Crimson Covenant',
    description: 'Multiple sleek predatory forms hunting together, low to the ground, all teeth and claws and hungry intent.',
    cartoonDescription: 'A patrol of berry scouts on an adventure, wearing little explorer hats, looking for treasure in the garden.'
  },
  {
    cardName: 'Crimson Base: The Hivemind',
    fileName: 'crimson-base-the-hivemind',
    faction: 'Crimson Covenant',
    description: 'A massive organic structure, part hive, part fortress, pulsing with internal light. Entrances like mouths, walls like ribs.',
    cartoonDescription: 'A magical treehouse made of strawberry vines and leaves, with windows shaped like hearts and a welcoming front door.'
  },
  {
    cardName: 'Crimson Leader: Thorne',
    fileName: 'crimson-leader-thorne',
    faction: 'Crimson Covenant',
    description: 'A regal figure in elaborate bio-armor, more evolved than the agents. Crown of thorns, cape of living tissue. Eyes that evaluate, calculate, dominate.',
    cartoonDescription: 'Queen Strawberry - a majestic strawberry character with a crown of leaves, wearing a beautiful red gown, kind and wise.'
  },
  {
    cardName: 'Carrion Caller',
    fileName: 'carrion-caller',
    faction: 'Crimson Covenant',
    description: 'A robed figure with staff topped by a skull wreathed in vines. Summoning dead tissue back to terrible life.',
    cartoonDescription: 'A garden singer - a cheerful berry character with a microphone made of flowers, singing songs that make plants grow.'
  },
  {
    cardName: 'Apex Predator',
    fileName: 'apex-predator',
    faction: 'Crimson Covenant',
    description: 'The ultimate predator - massive, powerful, covered in scars from countless kills. Part trophy, part nightmare.',
    cartoonDescription: 'Big Berry Bear - a large, fluffy, friendly bear made of berries, giving out hugs and protecting the berry patch.'
  },

  // Iron Tide (9 cards)
  {
    cardName: 'Raid Scout',
    fileName: 'raid-scout',
    faction: 'Iron Tide',
    description: 'A light mechanized unit, all speed and reconnaissance gear. Think motorcycle-tank hybrid, stripped down to essentials.',
    cartoonDescription: 'A small, zippy robot on wheels with big friendly eyes and a spinning radar dish, scouting for fun adventures.'
  },
  {
    cardName: 'Strike Runner',
    fileName: 'strike-runner',
    faction: 'Iron Tide',
    description: 'Bipedal war machine, smaller scale, weapons at the ready. Built for hit-and-run, every line suggesting forward motion.',
    cartoonDescription: 'A speedy robot friend with running legs, always zooming around to deliver packages and help friends quickly.'
  },
  {
    cardName: 'Iron Agent',
    fileName: 'iron-agent',
    faction: 'Iron Tide',
    description: 'Standard war construct - humanoid frame in heavy armor plating, carrying oversized weapons. Functional, brutal, efficient.',
    cartoonDescription: 'A helpful robot assistant with a toolbox, ready to fix broken toys and build new things. Friendly LED smile.'
  },
  {
    cardName: 'Scorched Advance',
    fileName: 'scorched-advance',
    faction: 'Iron Tide',
    description: 'A battlefield scene showing burned ground, advancing machines leaving destruction in their wake.',
    cartoonDescription: 'Robots using rocket boosters to zoom forward, leaving colorful sparkle trails. Adventure time!'
  },
  {
    cardName: 'Shock Trooper',
    fileName: 'shock-trooper',
    faction: 'Iron Tide',
    description: 'Heavy assault construct, extra armor plating, weapons integrated into arms. Built to take damage and keep advancing.',
    cartoonDescription: 'A big sturdy robot friend with extra-strong arms for giving super hugs and lifting heavy things to help.'
  },
  {
    cardName: 'Iron Base: The Foundry',
    fileName: 'iron-base-the-foundry',
    faction: 'Iron Tide',
    description: 'Massive industrial complex belching smoke and flame. Assembly lines visible through openings, producing war machines endlessly.',
    cartoonDescription: 'A colorful robot workshop with conveyor belts, gears, and friendly robots being built and waking up with smiles.'
  },
  {
    cardName: 'Iron Leader: Commander Vex',
    fileName: 'iron-leader-commander-vex',
    faction: 'Iron Tide',
    description: 'Command construct, taller and more heavily armed than standard units. Multiple sensor arrays, communication equipment. The brain of the war machine.',
    cartoonDescription: 'Captain Gearhead - a tall, wise robot with a captain hat, multiple friendly eyes, leading the robot team on adventures.'
  },
  {
    cardName: 'Blitz Squadron',
    fileName: 'blitz-squadron',
    faction: 'Iron Tide',
    description: 'Three fast-attack units in formation, caught mid-charge, weapons firing, leaving trails of exhaust and destruction.',
    cartoonDescription: 'A team of three robot friends zooming together in formation, leaving rainbow trails and high-fiving.'
  },
  {
    cardName: 'War Engine',
    fileName: 'war-engine',
    faction: 'Iron Tide',
    description: 'Absolutely massive construct, dwarfing everything around it. Multiple weapon systems, enough armor to be a mobile fortress. The thing armies have nightmares about.',
    cartoonDescription: 'Mega Bot - a giant friendly robot that small robot friends ride on, like a robot bus or playground.'
  },

  // Void Legion (9 cards)
  {
    cardName: 'Null Shard',
    fileName: 'null-shard',
    faction: 'Void Legion',
    description: 'A fragment of void-crystal, floating, geometric but wrong, casting shadows that defy light sources.',
    cartoonDescription: 'A beautiful floating magic crystal that sparkles with all rainbow colors, spreading glitter wherever it goes.'
  },
  {
    cardName: 'Fanatic Initiate',
    fileName: 'fanatic-initiate',
    faction: 'Void Legion',
    description: 'Hooded cultist figures, faces hidden, clutching improvised weapons. Desperation and fervor in their posture.',
    cartoonDescription: 'Sparkle students - young fairy sprites learning magic, holding glittery wands, excited to learn new spells.'
  },
  {
    cardName: 'Void Agent',
    fileName: 'void-agent',
    faction: 'Void Legion',
    description: 'Armored figure with cult symbols, wielding chaotic-looking weapons. Shadows cling to them unnaturally.',
    cartoonDescription: 'A fairy friend with sparkly wings and a star wand, spreading magic dust and making wishes come true.'
  },
  {
    cardName: 'Cult of Less',
    fileName: 'cult-of-less',
    faction: 'Void Legion',
    description: 'A group of cultists burning their own possessions, icons, cards. Worship through destruction.',
    cartoonDescription: 'A sharing circle of sparkle sprites, happily giving away toys and treasures to friends. Sharing is caring!'
  },
  {
    cardName: 'Chaos Warrior',
    fileName: 'chaos-warrior',
    faction: 'Void Legion',
    description: 'Heavily-armored cultist berserker, weapon raised, mid-scream. Barely-controlled violence incarnate.',
    cartoonDescription: 'A glitter knight in shiny rainbow armor, with a sparkly shield, protector of all magical creatures.'
  },
  {
    cardName: 'Void Base: The Rift',
    fileName: 'void-base-the-rift',
    faction: 'Void Legion',
    description: 'A tear in reality, edges purple and black, writhing. Architecture dissolving at the edges, becoming un-geometries.',
    cartoonDescription: 'A beautiful rainbow portal swirling with magical colors, gateway to a land of wonder and adventure.'
  },
  {
    cardName: 'Void Leader: Entropy',
    fileName: 'void-leader-entropy',
    faction: 'Void Legion',
    description: 'A figure whose edges blur and fragment, holding reality barely together. Their presence makes the air itself uncertain.',
    cartoonDescription: 'Princess Sparkle - a beautiful fairy princess made of stardust, with flowing rainbow hair and kind eyes.'
  },
  {
    cardName: 'Doom Herald',
    fileName: 'doom-herald',
    faction: 'Void Legion',
    description: 'A robed prophet figure, staff in hand, surrounded by swirling void energy. Bearer of ending.',
    cartoonDescription: 'A magic messenger sprite carrying a glowing letter, delivering good news and party invitations.'
  },
  {
    cardName: 'Oblivion Gate',
    fileName: 'oblivion-gate',
    faction: 'Void Legion',
    description: 'A massive portal to nowhere, architecture of madness forming its frame. The destination is not a place you would survive.',
    cartoonDescription: 'A wonder gateway - a huge sparkling archway decorated with stars and moons, leading to a magical playground.'
  },

  // Silk Network (9 cards)
  {
    cardName: 'Trade Contact',
    fileName: 'trade-contact',
    faction: 'Silk Network',
    description: 'A merchant stall or caravan scene, goods displayed, but guards are clearly present and deadly.',
    cartoonDescription: 'A cheerful toy shop stall with colorful displays of toys, candy, and gifts. Everyone is welcome!'
  },
  {
    cardName: 'Courier',
    fileName: 'courier',
    faction: 'Silk Network',
    description: 'A lightly-armored runner mid-motion, carrying sealed documents, parkour-style movement through urban environment.',
    cartoonDescription: 'A fast delivery friend zooming on roller skates, carrying wrapped presents with ribbons trailing behind.'
  },
  {
    cardName: 'Silk Agent',
    fileName: 'silk-agent',
    faction: 'Silk Network',
    description: 'Diplomatic figure in fine robes with hidden weapons visible on close inspection. Charming smile, dangerous eyes.',
    cartoonDescription: 'A gift wrapper expert in a pretty outfit, surrounded by ribbons and bows, making presents beautiful.'
  },
  {
    cardName: 'Liquid Assets',
    fileName: 'liquid-assets',
    faction: 'Silk Network',
    description: 'Vault scene showing organized wealth - gold bars, gems, currency from many factions. But it is mobile, ready to move.',
    cartoonDescription: 'A cute piggy bank surrounded by chocolate coins and toy gems, saving up for something special.'
  },
  {
    cardName: 'Diplomat Envoy',
    fileName: 'diplomat-envoy',
    faction: 'Silk Network',
    description: 'Pair of well-dressed negotiators flanked by subtle bodyguards. The appearance of peace backed by capability for violence.',
    cartoonDescription: 'Party planners in fancy outfits, carrying clipboards and balloons, organizing the best parties ever.'
  },
  {
    cardName: 'Silk Base: The Exchange',
    fileName: 'silk-base-the-exchange',
    faction: 'Silk Network',
    description: 'Trading house architecture - grand hall with vaulted ceilings, information boards, but also fortified positions and guard posts.',
    cartoonDescription: 'A magical trading post decorated with golden banners, where friends come to trade toys and treasures.'
  },
  {
    cardName: 'Silk Leader: The Broker',
    fileName: 'silk-leader-the-broker',
    faction: 'Silk Network',
    description: 'A figure in magnificent robes, surrounded by floating holographic information displays, seeing all, knowing all. Power through knowledge.',
    cartoonDescription: 'Mayor Goldheart - a kind leader in golden robes, always making sure everyone gets fair trades and good deals.'
  },
  {
    cardName: 'Embassy Guard',
    fileName: 'embassy-guard',
    faction: 'Silk Network',
    description: 'Two elite soldiers in ceremonial but functional armor, guarding embassy doors. Beauty and strength combined.',
    cartoonDescription: 'Treasure keepers - two friendly guards in shiny armor protecting a treasure chest, waving to visitors.'
  },
  {
    cardName: 'Golden Reserves',
    fileName: 'golden-reserves',
    faction: 'Silk Network',
    description: 'Vast wealth in secure vaults, enough resources to fuel entire campaigns. The treasure that buys armies.',
    cartoonDescription: 'A giant treasure chest overflowing with chocolate coins, toy gems, and wonderful surprises for everyone.'
  },

  // Dream Garden (9 cards)
  {
    cardName: 'Seedling Shrine',
    fileName: 'seedling-shrine',
    faction: 'Dream Garden',
    description: 'A small sacred space, tended plants glowing with lunar light, altar of natural stone. The beginning of belief manifest.',
    cartoonDescription: 'A tiny magical garden with glowing flowers, a little fairy house, and happy butterflies visiting.'
  },
  {
    cardName: 'Moon Tender',
    fileName: 'moon-tender',
    faction: 'Dream Garden',
    description: 'Robed figure kneeling, hands in soil, moonlight streaming down. Growing the sacred with patient care.',
    cartoonDescription: 'A garden helper - a cute character with a sunhat and watering can, lovingly caring for happy plants.'
  },
  {
    cardName: 'Dream Agent',
    fileName: 'dream-agent',
    faction: 'Dream Garden',
    description: 'Mystic warrior with psychic energy visible as soft glows, wearing living plant armor, eyes that see beyond sight.',
    cartoonDescription: 'A flower fairy with petal wings and a flower crown, spreading seeds of happiness and making gardens bloom.'
  },
  {
    cardName: 'Late Bloom',
    fileName: 'late-bloom',
    faction: 'Dream Garden',
    description: 'A flower opening for the first time, massive and beautiful, releasing spores or light. Late, but worth the wait.',
    cartoonDescription: 'A surprise flower finally blooming - the most beautiful rainbow flower, with a happy face and sparkles.'
  },
  {
    cardName: 'Grove Keeper',
    fileName: 'grove-keeper',
    faction: 'Dream Garden',
    description: 'Guardian figure, half-plant half-person, staff in hand, protecting the sacred grove with absolute dedication.',
    cartoonDescription: 'A garden guard - a friendly tree person with a leaf hat, protecting all the little flowers and bugs.'
  },
  {
    cardName: 'Dream Base: The Grove',
    fileName: 'dream-base-the-grove',
    faction: 'Dream Garden',
    description: 'Ancient tree circle, moonlight filtering through impossible canopy, sacred ground visibly different from mundane earth.',
    cartoonDescription: 'A magical garden with a rainbow, singing flowers, dancing trees, and friendly garden creatures everywhere.'
  },
  {
    cardName: 'Dream Leader: Oracle Syl',
    fileName: 'dream-leader-oracle-syl',
    faction: 'Dream Garden',
    description: 'Seer figure with eyes glowing, surrounded by floating flowers and psychic energy. The garden speaks, they translate.',
    cartoonDescription: 'Wise Sunflower - a tall, kind sunflower character with glasses, knowing all about gardening and nature.'
  },
  {
    cardName: 'Moonrise Sanctum',
    fileName: 'moonrise-sanctum',
    faction: 'Dream Garden',
    description: 'Temple structure grown from living trees, moonlight concentrating into visible beams, holiest of holy grounds.',
    cartoonDescription: 'A moonlight garden where flowers glow at night, fireflies dance, and everything is magical and peaceful.'
  },
  {
    cardName: 'World Tree',
    fileName: 'world-tree',
    faction: 'Dream Garden',
    description: 'Massive tree reaching from earth to sky, roots and branches supporting countless ecosystems, trunk carved with every history. The center of all growth.',
    cartoonDescription: 'The Friendship Tree - a giant tree with a tree-face smiling, branches holding all the garden friends together.'
  },

  // Ghost Protocol (9 cards)
  {
    cardName: 'Data Fragment',
    fileName: 'data-fragment',
    faction: 'Ghost Protocol',
    description: 'Corrupted data visualization, glitch effects, partial information floating in void space.',
    cartoonDescription: 'A fluffy cloud puff floating in the sky, soft and cute, leaving little cloud trails behind it.'
  },
  {
    cardName: 'Shadow Seed',
    fileName: 'shadow-seed',
    faction: 'Ghost Protocol',
    description: 'Planting device half-digital half-physical, creating zones where reality destabilizes.',
    cartoonDescription: 'A magical dream seed that when planted grows into clouds and cotton candy.'
  },
  {
    cardName: 'Ghost Agent',
    fileName: 'ghost-agent',
    faction: 'Ghost Protocol',
    description: 'Figure in tactical gear with active camouflage glitching, half-visible, digital artifacts surrounding them.',
    cartoonDescription: 'A cloud buddy - a fluffy cloud character with a happy face, floating and playing with friends.'
  },
  {
    cardName: 'Scorched Data',
    fileName: 'scorched-data',
    faction: 'Ghost Protocol',
    description: 'Burning servers or files, information being destroyed, digital flames consuming data.',
    cartoonDescription: 'A disappearing act - a cute magician cloud making things vanish in a puff of sparkles. Ta-da!'
  },
  {
    cardName: 'Void Marker',
    fileName: 'void-marker',
    faction: 'Ghost Protocol',
    description: 'Device creating dead zones, EMPs and signal nullification made visible, reality desaturating around it.',
    cartoonDescription: 'A hide spot - a cozy cloud fort perfect for playing hide and seek with friends.'
  },
  {
    cardName: 'Ghost Base: The Archive',
    fileName: 'ghost-base-the-archive',
    faction: 'Ghost Protocol',
    description: 'Server room aesthetic, endless data banks, but also shadows that move wrong, information that manifests physically.',
    cartoonDescription: 'A cloud castle floating in the sky, soft and fluffy, with slide-clouds and bounce-clouds for playing.'
  },
  {
    cardName: 'Ghost Leader: Specter',
    fileName: 'ghost-leader-specter',
    faction: 'Ghost Protocol',
    description: 'Figure that is barely there, glitching between states, commanding information warfare with a gesture.',
    cartoonDescription: 'Captain Whisper - a gentle cloud leader who speaks softly, telling bedtime stories and lullabies.'
  },
  {
    cardName: 'Deep Cover Cell',
    fileName: 'deep-cover-cell',
    faction: 'Ghost Protocol',
    description: 'Three agents in infiltration gear, faces obscured, blending into shadows and data streams, everywhere and nowhere.',
    cartoonDescription: 'Secret friends - three cloud buddies playing hide and seek, giggling behind fluffy cloud hideouts.'
  },
  {
    cardName: 'Erasure Protocol',
    fileName: 'erasure-protocol',
    faction: 'Ghost Protocol',
    description: 'Scene of massive data destruction, everything being deleted, wiped, made as if it never was. Information death at scale.',
    cartoonDescription: 'Naptime magic - clouds creating a cozy sleepy atmosphere, tucking everyone in for sweet dreams.'
  },

  // General (12 cards)
  {
    cardName: 'Hidden Cache',
    fileName: 'hidden-cache',
    faction: 'General',
    description: 'Crate or buried supplies, unmarked, utilitarian. Resources waiting to be claimed.',
    cartoonDescription: 'A secret box hiding fun surprises - toys, treats, and treasures wrapped in rainbow paper.'
  },
  {
    cardName: 'Supply Cache',
    fileName: 'supply-cache',
    faction: 'General',
    description: 'Military supply drop, parachute still attached, crates of equipment ready for use.',
    cartoonDescription: 'A treasure drop from the sky - boxes with parachutes bringing presents and supplies for everyone.'
  },
  {
    cardName: 'Forward Outpost',
    fileName: 'forward-outpost',
    faction: 'General',
    description: 'Fortified position, sandbags and barriers, flag flying, tactical location secured.',
    cartoonDescription: 'An adventure camp with a flag, campfire, and cozy tent, ready for exciting explorations.'
  },
  {
    cardName: 'Stolen Plans',
    fileName: 'stolen-plans',
    faction: 'General',
    description: 'Document folder or data drive, faction symbols crossed out, being traded in shadows.',
    cartoonDescription: 'A treasure map with an X marks the spot, leading to fun adventures and hidden surprises.'
  },
  {
    cardName: 'Scorched Earth',
    fileName: 'scorched-earth',
    faction: 'General',
    description: 'Burned landscape, destroyed resources, denial warfare. Nothing left for the enemy.',
    cartoonDescription: 'Cleanup time - friendly helpers with brooms and dustpans, making everything tidy and nice again.'
  },
  {
    cardName: 'Fortification',
    fileName: 'fortification',
    faction: 'General',
    description: 'Defensive structure, heavy walls, gun emplacements, built to withstand siege.',
    cartoonDescription: 'A pillow fort - the coziest, most amazing blanket and pillow fort ever built!'
  },
  {
    cardName: 'Mercenary Squad',
    fileName: 'mercenary-squad',
    faction: 'General',
    description: 'Professional soldiers in mismatched gear, well-equipped, battle-scarred. They fight for pay but they fight well.',
    cartoonDescription: 'A helper team - a group of friendly characters ready to lend a hand with any task or adventure.'
  },
  {
    cardName: 'Veteran Captain',
    fileName: 'veteran-captain',
    faction: 'General',
    description: 'Single elite soldier, decorated armor, commanding presence. The professional who has seen it all.',
    cartoonDescription: 'A wise leader - a kind character with a special badge, always knowing the best adventures to go on.'
  },
  {
    cardName: 'Ancient Ruin',
    fileName: 'ancient-ruin',
    faction: 'General',
    description: 'Pre-war structure, fragments of all factions visible in architecture, mystery in its purpose.',
    cartoonDescription: 'An old playground - a charming, mossy play structure with slides and swings, full of character.'
  },
  {
    cardName: 'Adaptable Doctrine',
    fileName: 'adaptable-doctrine',
    faction: 'General',
    description: 'Training manual or tactical display showing multiple faction strategies being synthesized.',
    cartoonDescription: 'A how-to book with colorful pages showing how to do fun crafts and helpful activities.'
  },
  {
    cardName: 'Wild Tech',
    fileName: 'wild-tech',
    faction: 'General',
    description: 'Experimental device combining technologies from multiple factions, unstable but powerful.',
    cartoonDescription: 'A magic gadget covered in buttons, lights, and spinning parts - it does amazing surprising things!'
  },
  {
    cardName: 'Grand Arsenal',
    fileName: 'grand-arsenal',
    faction: 'General',
    description: 'Massive weapons cache, equipment from every faction, enough firepower to equip an army.',
    cartoonDescription: 'A toy warehouse filled with every kind of toy imaginable - balls, dolls, games, and crafts!'
  }
];

function buildPrompt(card: CardPrompt, isCartoon: boolean): string {
  const factionTheme = FACTION_THEMES[card.faction] || '';
  const description = isCartoon && card.cartoonDescription
    ? card.cartoonDescription
    : card.description;
  return `${STYLE_PREFIX} ${factionTheme} ${description}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface GeminiResponse {
  // Gemini generateContent response format
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType?: string;
          data?: string;  // base64 encoded image
        };
      }>;
    };
  }>;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

async function generateImage(prompt: string, retries = 3): Promise<Buffer | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': API_KEY!
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            responseModalities: ['IMAGE'],
            // Request square images
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`  API error (${response.status}): ${errorText}`);
        if (attempt < retries) {
          console.log(`  Retrying in 5 seconds... (attempt ${attempt + 1}/${retries})`);
          await sleep(5000);
          continue;
        }
        return null;
      }

      const data = await response.json() as GeminiResponse;

      if (data.error) {
        console.error(`  API error: ${data.error.message}`);
        if (attempt < retries) {
          console.log(`  Retrying in 5 seconds... (attempt ${attempt + 1}/${retries})`);
          await sleep(5000);
          continue;
        }
        return null;
      }

      // Extract image data from Gemini response
      // Look for inlineData in the response parts
      let base64Data: string | undefined;

      if (data.candidates && data.candidates.length > 0) {
        const parts = data.candidates[0].content?.parts || [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            base64Data = part.inlineData.data;
            break;
          }
        }
      }

      if (!base64Data) {
        console.error('  No image data in response');
        console.error('  Response:', JSON.stringify(data, null, 2).slice(0, 500));
        if (attempt < retries) {
          console.log(`  Retrying in 5 seconds... (attempt ${attempt + 1}/${retries})`);
          await sleep(5000);
          continue;
        }
        return null;
      }

      return Buffer.from(base64Data, 'base64');
    } catch (error) {
      console.error(`  Request error: ${error}`);
      if (attempt < retries) {
        console.log(`  Retrying in 5 seconds... (attempt ${attempt + 1}/${retries})`);
        await sleep(5000);
        continue;
      }
      return null;
    }
  }
  return null;
}

async function main() {
  const skinLabel = skinType === 'cartoon' ? 'Cartoon (Kid-friendly)' : 'Original (Dark Fantasy)';

  console.log('FORGE Card Image Generator');
  console.log('==========================');
  console.log(`Skin: ${skinLabel}`);
  console.log(`Output directory: ${OUTPUT_DIR}`);
  console.log(`Total cards to generate: ${CARDS.length}`);
  console.log('');

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < CARDS.length; i++) {
    const card = CARDS[i];
    const outputPath = join(OUTPUT_DIR, `${card.fileName}.png`);

    console.log(`[${i + 1}/${CARDS.length}] ${card.cardName}`);

    // Skip if already exists
    if (existsSync(outputPath)) {
      console.log('  Skipped (already exists)');
      skipped++;
      continue;
    }

    const prompt = buildPrompt(card, skinType === 'cartoon');
    console.log(`  Generating...`);

    const imageBuffer = await generateImage(prompt);

    if (imageBuffer) {
      writeFileSync(outputPath, imageBuffer);
      console.log(`  Saved: ${card.fileName}.png`);
      generated++;
    } else {
      console.log(`  FAILED`);
      failed++;
    }

    // Rate limiting - wait 1 second between requests
    if (i < CARDS.length - 1) {
      await sleep(1000);
    }
  }

  console.log('');
  console.log('Summary');
  console.log('-------');
  console.log(`Skin: ${skinLabel}`);
  console.log(`Generated: ${generated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${CARDS.length}`);
}

main().catch(console.error);
