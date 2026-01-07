import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'public', 'images');

const API_KEY = process.env.GOOGLE_API_KEY;
// Gemini 3 Pro Image Preview (aka "Nano Banana Pro") - highest quality image generation
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent';

if (!API_KEY) {
  console.error('Error: GOOGLE_API_KEY environment variable is required');
  console.error('Usage: GOOGLE_API_KEY=<your-key> npm run generate-images');
  process.exit(1);
}

// General style prefix for all cards
const STYLE_PREFIX = `Card artwork for FORGE, a cosmic alchemical strategy card game. Square 1:1 aspect ratio. No text, letters, words, or writing of any kind. No frames, borders, or card-like edges - the art fills the entire image. Dark fantasy meets cosmic horror with alchemical symbolism. Baroque sci-fi aesthetic - ornate machinery fused with organic growth, ancient symbols glowing with unnatural light. Heavy shadows with dramatic rim lighting. Rich textures: tarnished metals, iridescent chitin, crystalline structures. Background color must be strongly dominated by the faction's signature colors. Center focus on subject with atmospheric gradients. Ominous grandeur, forces beyond human scale.`;

// Faction-specific theme prefixes
const FACTION_THEMES: Record<string, string> = {
  'Crimson Covenant': `Biology as warfare. Chitinous armor plates, pulsing organic tissue, thorn-covered vines with intent. Bio-engineered predators: sleek, fast, covered in natural weapons. Xenomorphic creatures crossed with carnivorous plants. Deep burgundy, crimson, dark pink flesh tones against black chitin. Wounds sprout new growth.`,

  'Iron Tide': `Brutal industrial warfare. Massive constructs of riveted steel, exhaust ports belching dark smoke, crushing treads. War machines - no pretense of humanity, just function and firepower. WW1 tanks meets steampunk walker meets brutalist architecture. Gunmetal grey, dark steel blues, brass accents, rust. Surfaces scarred from combat.`,

  'Void Legion': `The breaking of order. Twisted humanoid forms - too many limbs, geometries that don't connect right, faces hidden. Cultist aesthetics meets cosmic horror: tattered robes revealing something not quite flesh, ceremonial weapons dripping with malice. Deep blacks with purple edges, sickly yellows, void-deep purples. Shadows don't behave correctly.`,

  'Silk Network': `Wealth as power, information as currency. Ornate armor - gold filigree, amber inlays, silk accents. Diplomat-assassins with hidden blades, merchant-princes with bodyguards, envoys with deadly grace. Renaissance intrigue meets asian merchant guilds meets surveillance. Rich golds, deep ambers, bronze, cream silk, data-stream blue highlights.`,

  'Dream Garden': `Nature is neither kind nor cruel. Robed figures tending impossible flora, guardians more plant than person, plants given terrible purpose. Sacred grove meets psychedelic nightmare: bioluminescent flowers with too many petals, trees with bark like eyes, moss in sacred geometric patterns. Soft teals, seafoam greens, moonlit silvers, lavender.`,

  'Ghost Protocol': `Information warfare in physical form. Agents in tactical gear with digital camouflage that glitches and shifts, shadows given form, data entities manifesting in meatspace. Cyberpunk espionage meets digital ghost stories. Pale greys, silver-blues, null-space blacks, scanline greens, error-message red accents. Half-phased out of reality.`,

  'General': `Remnants and results of cosmic war. Supply drops, abandoned materiel, hastily-fortified positions, battle-scarred professionals. Utilitarian tans, military greens, weathered browns, neutral greys. War's supporting cast - essential but not glorious.`
};

interface CardPrompt {
  cardName: string;
  fileName: string;
  faction: string;
  description: string;
}

// All 66 unique cards with their unit-specific descriptions
const CARDS: CardPrompt[] = [
  // Crimson Covenant (9 cards)
  {
    cardName: 'Bloodthorn Seedling',
    fileName: 'bloodthorn-seedling',
    faction: 'Crimson Covenant',
    description: 'A thorny seedling pod with organic tendrils, dripping with crimson sap, half-buried in dark soil. Barely emerged but already predatory.'
  },
  {
    cardName: 'Symbiote Spawn',
    fileName: 'symbiote-spawn',
    faction: 'Crimson Covenant',
    description: 'Small chitinous creatures clustering together, each one part-insect part-something-worse, moving as a coordinated swarm.'
  },
  {
    cardName: 'Crimson Agent',
    fileName: 'crimson-agent',
    faction: 'Crimson Covenant',
    description: 'A humanoid figure in bio-organic armor, crimson and black, with thorn-like protrusions. Face partially obscured by chitinous plates. Carries organic weapons that look grown, not forged.'
  },
  {
    cardName: 'Hostile Takeover',
    fileName: 'hostile-takeover',
    faction: 'Crimson Covenant',
    description: 'A scene of one unit consuming or overgrowing another, aggressive biological warfare in action, thorny vines crushing steel.'
  },
  {
    cardName: 'Predator Pack',
    fileName: 'predator-pack',
    faction: 'Crimson Covenant',
    description: 'Multiple sleek predatory forms hunting together, low to the ground, all teeth and claws and hungry intent.'
  },
  {
    cardName: 'Crimson Base: The Hivemind',
    fileName: 'crimson-base-the-hivemind',
    faction: 'Crimson Covenant',
    description: 'A massive organic structure, part hive, part fortress, pulsing with internal light. Entrances like mouths, walls like ribs.'
  },
  {
    cardName: 'Crimson Leader: Thorne',
    fileName: 'crimson-leader-thorne',
    faction: 'Crimson Covenant',
    description: 'A regal figure in elaborate bio-armor, more evolved than the agents. Crown of thorns, cape of living tissue. Eyes that evaluate, calculate, dominate.'
  },
  {
    cardName: 'Carrion Caller',
    fileName: 'carrion-caller',
    faction: 'Crimson Covenant',
    description: 'A robed figure with staff topped by a skull wreathed in vines. Summoning dead tissue back to terrible life.'
  },
  {
    cardName: 'Apex Predator',
    fileName: 'apex-predator',
    faction: 'Crimson Covenant',
    description: 'The ultimate predator - massive, powerful, covered in scars from countless kills. Part trophy, part nightmare.'
  },

  // Iron Tide (9 cards)
  {
    cardName: 'Raid Scout',
    fileName: 'raid-scout',
    faction: 'Iron Tide',
    description: 'A light mechanized unit, all speed and reconnaissance gear. Think motorcycle-tank hybrid, stripped down to essentials.'
  },
  {
    cardName: 'Strike Runner',
    fileName: 'strike-runner',
    faction: 'Iron Tide',
    description: 'Bipedal war machine, smaller scale, weapons at the ready. Built for hit-and-run, every line suggesting forward motion.'
  },
  {
    cardName: 'Iron Agent',
    fileName: 'iron-agent',
    faction: 'Iron Tide',
    description: 'Standard war construct - humanoid frame in heavy armor plating, carrying oversized weapons. Functional, brutal, efficient.'
  },
  {
    cardName: 'Scorched Advance',
    fileName: 'scorched-advance',
    faction: 'Iron Tide',
    description: 'A battlefield scene showing burned ground, advancing machines leaving destruction in their wake.'
  },
  {
    cardName: 'Shock Trooper',
    fileName: 'shock-trooper',
    faction: 'Iron Tide',
    description: 'Heavy assault construct, extra armor plating, weapons integrated into arms. Built to take damage and keep advancing.'
  },
  {
    cardName: 'Iron Base: The Foundry',
    fileName: 'iron-base-the-foundry',
    faction: 'Iron Tide',
    description: 'Massive industrial complex belching smoke and flame. Assembly lines visible through openings, producing war machines endlessly.'
  },
  {
    cardName: 'Iron Leader: Commander Vex',
    fileName: 'iron-leader-commander-vex',
    faction: 'Iron Tide',
    description: 'Command construct, taller and more heavily armed than standard units. Multiple sensor arrays, communication equipment. The brain of the war machine.'
  },
  {
    cardName: 'Blitz Squadron',
    fileName: 'blitz-squadron',
    faction: 'Iron Tide',
    description: 'Three fast-attack units in formation, caught mid-charge, weapons firing, leaving trails of exhaust and destruction.'
  },
  {
    cardName: 'War Engine',
    fileName: 'war-engine',
    faction: 'Iron Tide',
    description: 'Absolutely massive construct, dwarfing everything around it. Multiple weapon systems, enough armor to be a mobile fortress. The thing armies have nightmares about.'
  },

  // Void Legion (9 cards)
  {
    cardName: 'Null Shard',
    fileName: 'null-shard',
    faction: 'Void Legion',
    description: 'A fragment of void-crystal, floating, geometric but wrong, casting shadows that defy light sources.'
  },
  {
    cardName: 'Fanatic Initiate',
    fileName: 'fanatic-initiate',
    faction: 'Void Legion',
    description: 'Hooded cultist figures, faces hidden, clutching improvised weapons. Desperation and fervor in their posture.'
  },
  {
    cardName: 'Void Agent',
    fileName: 'void-agent',
    faction: 'Void Legion',
    description: 'Armored figure with cult symbols, wielding chaotic-looking weapons. Shadows cling to them unnaturally.'
  },
  {
    cardName: 'Cult of Less',
    fileName: 'cult-of-less',
    faction: 'Void Legion',
    description: 'A group of cultists burning their own possessions, icons, cards. Worship through destruction.'
  },
  {
    cardName: 'Chaos Warrior',
    fileName: 'chaos-warrior',
    faction: 'Void Legion',
    description: 'Heavily-armored cultist berserker, weapon raised, mid-scream. Barely-controlled violence incarnate.'
  },
  {
    cardName: 'Void Base: The Rift',
    fileName: 'void-base-the-rift',
    faction: 'Void Legion',
    description: 'A tear in reality, edges purple and black, writhing. Architecture dissolving at the edges, becoming un-geometries.'
  },
  {
    cardName: 'Void Leader: Entropy',
    fileName: 'void-leader-entropy',
    faction: 'Void Legion',
    description: 'A figure whose edges blur and fragment, holding reality barely together. Their presence makes the air itself uncertain.'
  },
  {
    cardName: 'Doom Herald',
    fileName: 'doom-herald',
    faction: 'Void Legion',
    description: 'A robed prophet figure, staff in hand, surrounded by swirling void energy. Bearer of ending.'
  },
  {
    cardName: 'Oblivion Gate',
    fileName: 'oblivion-gate',
    faction: 'Void Legion',
    description: 'A massive portal to nowhere, architecture of madness forming its frame. The destination is not a place you would survive.'
  },

  // Silk Network (9 cards)
  {
    cardName: 'Trade Contact',
    fileName: 'trade-contact',
    faction: 'Silk Network',
    description: 'A merchant stall or caravan scene, goods displayed, but guards are clearly present and deadly.'
  },
  {
    cardName: 'Courier',
    fileName: 'courier',
    faction: 'Silk Network',
    description: 'A lightly-armored runner mid-motion, carrying sealed documents, parkour-style movement through urban environment.'
  },
  {
    cardName: 'Silk Agent',
    fileName: 'silk-agent',
    faction: 'Silk Network',
    description: 'Diplomatic figure in fine robes with hidden weapons visible on close inspection. Charming smile, dangerous eyes.'
  },
  {
    cardName: 'Liquid Assets',
    fileName: 'liquid-assets',
    faction: 'Silk Network',
    description: 'Vault scene showing organized wealth - gold bars, gems, currency from many factions. But it is mobile, ready to move.'
  },
  {
    cardName: 'Diplomat Envoy',
    fileName: 'diplomat-envoy',
    faction: 'Silk Network',
    description: 'Pair of well-dressed negotiators flanked by subtle bodyguards. The appearance of peace backed by capability for violence.'
  },
  {
    cardName: 'Silk Base: The Exchange',
    fileName: 'silk-base-the-exchange',
    faction: 'Silk Network',
    description: 'Trading house architecture - grand hall with vaulted ceilings, information boards, but also fortified positions and guard posts.'
  },
  {
    cardName: 'Silk Leader: The Broker',
    fileName: 'silk-leader-the-broker',
    faction: 'Silk Network',
    description: 'A figure in magnificent robes, surrounded by floating holographic information displays, seeing all, knowing all. Power through knowledge.'
  },
  {
    cardName: 'Embassy Guard',
    fileName: 'embassy-guard',
    faction: 'Silk Network',
    description: 'Two elite soldiers in ceremonial but functional armor, guarding embassy doors. Beauty and strength combined.'
  },
  {
    cardName: 'Golden Reserves',
    fileName: 'golden-reserves',
    faction: 'Silk Network',
    description: 'Vast wealth in secure vaults, enough resources to fuel entire campaigns. The treasure that buys armies.'
  },

  // Dream Garden (9 cards)
  {
    cardName: 'Seedling Shrine',
    fileName: 'seedling-shrine',
    faction: 'Dream Garden',
    description: 'A small sacred space, tended plants glowing with lunar light, altar of natural stone. The beginning of belief manifest.'
  },
  {
    cardName: 'Moon Tender',
    fileName: 'moon-tender',
    faction: 'Dream Garden',
    description: 'Robed figure kneeling, hands in soil, moonlight streaming down. Growing the sacred with patient care.'
  },
  {
    cardName: 'Dream Agent',
    fileName: 'dream-agent',
    faction: 'Dream Garden',
    description: 'Mystic warrior with psychic energy visible as soft glows, wearing living plant armor, eyes that see beyond sight.'
  },
  {
    cardName: 'Late Bloom',
    fileName: 'late-bloom',
    faction: 'Dream Garden',
    description: 'A flower opening for the first time, massive and beautiful, releasing spores or light. Late, but worth the wait.'
  },
  {
    cardName: 'Grove Keeper',
    fileName: 'grove-keeper',
    faction: 'Dream Garden',
    description: 'Guardian figure, half-plant half-person, staff in hand, protecting the sacred grove with absolute dedication.'
  },
  {
    cardName: 'Dream Base: The Grove',
    fileName: 'dream-base-the-grove',
    faction: 'Dream Garden',
    description: 'Ancient tree circle, moonlight filtering through impossible canopy, sacred ground visibly different from mundane earth.'
  },
  {
    cardName: 'Dream Leader: Oracle Syl',
    fileName: 'dream-leader-oracle-syl',
    faction: 'Dream Garden',
    description: 'Seer figure with eyes glowing, surrounded by floating flowers and psychic energy. The garden speaks, they translate.'
  },
  {
    cardName: 'Moonrise Sanctum',
    fileName: 'moonrise-sanctum',
    faction: 'Dream Garden',
    description: 'Temple structure grown from living trees, moonlight concentrating into visible beams, holiest of holy grounds.'
  },
  {
    cardName: 'World Tree',
    fileName: 'world-tree',
    faction: 'Dream Garden',
    description: 'Massive tree reaching from earth to sky, roots and branches supporting countless ecosystems, trunk carved with every history. The center of all growth.'
  },

  // Ghost Protocol (9 cards)
  {
    cardName: 'Data Fragment',
    fileName: 'data-fragment',
    faction: 'Ghost Protocol',
    description: 'Corrupted data visualization, glitch effects, partial information floating in void space.'
  },
  {
    cardName: 'Shadow Seed',
    fileName: 'shadow-seed',
    faction: 'Ghost Protocol',
    description: 'Planting device half-digital half-physical, creating zones where reality destabilizes.'
  },
  {
    cardName: 'Ghost Agent',
    fileName: 'ghost-agent',
    faction: 'Ghost Protocol',
    description: 'Figure in tactical gear with active camouflage glitching, half-visible, digital artifacts surrounding them.'
  },
  {
    cardName: 'Scorched Data',
    fileName: 'scorched-data',
    faction: 'Ghost Protocol',
    description: 'Burning servers or files, information being destroyed, digital flames consuming data.'
  },
  {
    cardName: 'Void Marker',
    fileName: 'void-marker',
    faction: 'Ghost Protocol',
    description: 'Device creating dead zones, EMPs and signal nullification made visible, reality desaturating around it.'
  },
  {
    cardName: 'Ghost Base: The Archive',
    fileName: 'ghost-base-the-archive',
    faction: 'Ghost Protocol',
    description: 'Server room aesthetic, endless data banks, but also shadows that move wrong, information that manifests physically.'
  },
  {
    cardName: 'Ghost Leader: Specter',
    fileName: 'ghost-leader-specter',
    faction: 'Ghost Protocol',
    description: 'Figure that is barely there, glitching between states, commanding information warfare with a gesture.'
  },
  {
    cardName: 'Deep Cover Cell',
    fileName: 'deep-cover-cell',
    faction: 'Ghost Protocol',
    description: 'Three agents in infiltration gear, faces obscured, blending into shadows and data streams, everywhere and nowhere.'
  },
  {
    cardName: 'Erasure Protocol',
    fileName: 'erasure-protocol',
    faction: 'Ghost Protocol',
    description: 'Scene of massive data destruction, everything being deleted, wiped, made as if it never was. Information death at scale.'
  },

  // General (12 cards)
  {
    cardName: 'Hidden Cache',
    fileName: 'hidden-cache',
    faction: 'General',
    description: 'Crate or buried supplies, unmarked, utilitarian. Resources waiting to be claimed.'
  },
  {
    cardName: 'Supply Cache',
    fileName: 'supply-cache',
    faction: 'General',
    description: 'Military supply drop, parachute still attached, crates of equipment ready for use.'
  },
  {
    cardName: 'Forward Outpost',
    fileName: 'forward-outpost',
    faction: 'General',
    description: 'Fortified position, sandbags and barriers, flag flying, tactical location secured.'
  },
  {
    cardName: 'Stolen Plans',
    fileName: 'stolen-plans',
    faction: 'General',
    description: 'Document folder or data drive, faction symbols crossed out, being traded in shadows.'
  },
  {
    cardName: 'Scorched Earth',
    fileName: 'scorched-earth',
    faction: 'General',
    description: 'Burned landscape, destroyed resources, denial warfare. Nothing left for the enemy.'
  },
  {
    cardName: 'Fortification',
    fileName: 'fortification',
    faction: 'General',
    description: 'Defensive structure, heavy walls, gun emplacements, built to withstand siege.'
  },
  {
    cardName: 'Mercenary Squad',
    fileName: 'mercenary-squad',
    faction: 'General',
    description: 'Professional soldiers in mismatched gear, well-equipped, battle-scarred. They fight for pay but they fight well.'
  },
  {
    cardName: 'Veteran Captain',
    fileName: 'veteran-captain',
    faction: 'General',
    description: 'Single elite soldier, decorated armor, commanding presence. The professional who has seen it all.'
  },
  {
    cardName: 'Ancient Ruin',
    fileName: 'ancient-ruin',
    faction: 'General',
    description: 'Pre-war structure, fragments of all factions visible in architecture, mystery in its purpose.'
  },
  {
    cardName: 'Adaptable Doctrine',
    fileName: 'adaptable-doctrine',
    faction: 'General',
    description: 'Training manual or tactical display showing multiple faction strategies being synthesized.'
  },
  {
    cardName: 'Wild Tech',
    fileName: 'wild-tech',
    faction: 'General',
    description: 'Experimental device combining technologies from multiple factions, unstable but powerful.'
  },
  {
    cardName: 'Grand Arsenal',
    fileName: 'grand-arsenal',
    faction: 'General',
    description: 'Massive weapons cache, equipment from every faction, enough firepower to equip an army.'
  }
];

function buildPrompt(card: CardPrompt): string {
  const factionTheme = FACTION_THEMES[card.faction] || '';
  return `${STYLE_PREFIX} ${factionTheme} ${card.description}`;
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
  console.log('FORGE Card Image Generator');
  console.log('==========================');
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

    const prompt = buildPrompt(card);
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
  console.log(`Generated: ${generated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${CARDS.length}`);
}

main().catch(console.error);
