#!/usr/bin/env node
/**
 * Enqueue EVEN MORE fantasy scene prompts — wildly creative and diverse.
 * Round 2: mythological creatures, alchemical realms, clockwork worlds,
 *            color planes, dream architecture, celestial courts, and more.
 * Run: node enqueue-fantasy-scenes-2.js
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, 'data/lovioa.db');
const db = new Database(DB_FILE);

const prompts = [
  // ── Mythological Creature Lairs ───────────────────────────────────────────
  ['text', 'The lair of a phoenix in an ancient volcanic crater, the entire crater floor is covered in warm orange embers that never fully cool, the phoenix nest at the center is made of crystallized flame, a massive sun-disc hovering above the nest, a figure with a torch approaching cautiously, warm red-orange-gold palette, fiery fantasy atmosphere, epic scale composition'],
  ['text', 'The nest of a sea kraken in an underwater cliff cave, giant tentacles wrapped around the cave entrance, bioluminescent deep-sea jellyfish illuminating the scene from above, ancient stone anchors with barnacles, the kraken eye glowing in the darkness, dark blue atmospheric underwater with glowing elements, mysterious deep fantasy'],
  ['text', 'The den of a sphinx at the entrance to a desert tomb, massive stone sphinx body half-buried in sand, the riddle pillars surrounding it with ancient hieroglyphs glowing, a traveler kneeling before it answering a riddle, endless golden desert in background, warm amber and deep blue contrast, mysterious Egyptian fantasy atmosphere'],
  ['text', 'A griffin nest on a mountain peak above the clouds, enormous griffin with eagle head and lion body, massive golden feathers, the nest made of collected treasure and bright silks, storm clouds below the nest with sun breaking through above, epic aerial fantasy scene, rich warm gold and royal blue contrast'],
  ['text', 'The cave of a dragon made of living ice, its scales are translucent ice panels with ancient runes visible beneath the surface, breath is a blizzard, the cave interior filled with frozen treasure, a tiny figure with a torch at the cave entrance looking up at the massive creature, cold blue-white palette with warm torch highlight, epic fantasy dragon lair'],

  // ── Alchemical & Magical Laboratory Fantasy ────────────────────────────────
  ['text', 'An alchemist laboratory in a fantasy dimension where gravity is liquid, flasks and equipment floating in a curved gravity field, potions of different colors orbiting a central workbench, a robed alchemist in a bubble of normal gravity working, surreal magical science fiction, rich jewel tones with dramatic lighting, Escher-inspired fantasy lab'],
  ['text', 'A massive underground alchemical forge, giant cauldrons the size of pools with rivers of molten gold flowing between them, alchemical symbols carved into the stone floor, dwarven alchemists in fireproof gear working the forges, steam and heat haze everywhere, warm orange and deep amber palette, epic fantasy industrial alchemy'],
  ['text', 'A magical botanical garden where every plant is an alchemical experiment, plants with glowing bottles growing instead of fruit, trees with bubbling flasks as flowers, vines growing from test tubes inserted into the soil, a robed figure sketching in their journal, magical botany fantasy, saturated green and glass-blue palette, whimsical science-magic hybrid aesthetic'],
  ['text', 'An ancient alchemist tower on a cliff, multiple floors visible through cut-away architecture, each floor a different color of alchemical smoke, ground floor has red smoke, first floor orange, second floor yellow, top floor pure white, a figure climbing the exterior staircase between the color layers, surreal fantasy tower, rainbow smoke gradient, dramatic vertical composition'],
  ['text', 'A transmutation laboratory where failed experiments create living creatures, a monster made of fused metal and organic matter standing in the corner, bubbling vats with strange floating shapes, notes pinned everywhere with crossed-out theories, an alchemist in protective gear sweeping something into a containment jar, dark gritty alchemical fantasy, warm amber and rusted metal tones'],

  // ── Clockwork & Mechanical Fantasy ─────────────────────────────────────────
  ['text', 'A clockwork city powered by a massive central mechanism, the city is built around and inside an enormous exposed gear mechanism the size of a building, tiny people living in the spaces between gears, oil rivers flowing, steam vents everywhere, warm brass and dark iron palette, industrial steampunk city fantasy, epic mechanical scale composition'],
  ['text', 'A clocktower at the center of a frozen moment in time, giant clock hands stopped mid-tick, snow frozen in mid-air around the tower, people frozen in various poses around the tower in an instant of a moment, a single figure not frozen walking among them, surreal fantasy time-stop scene, cold silver-blue palette with warm warm golden clock face, dramatic atmosphere'],
  ['text', 'An underground mechanical dungeon where the floor is a giant clock mechanism, gears visible beneath transparent floor tiles, a figure jumping between gear teeth as they rotate, trap mechanisms triggered by clock timing, a way to solve the puzzle by reading the clock, mechanical dungeon fantasy, warm brass gears against dark stone floor, intricate detail composition'],
  ['text', 'A fantasy train station where trains are powered by magical clockwork, three ornate steam-clockwork hybrid trains on parallel tracks, each train is a different color (gold, silver, copper), passengers boarding in Victorian fantasy dress, a massive clock tower above the station with time portal visible in the clock face, warm steampunk palette of brass and wood, busy fantasy train station atmosphere'],

  // ── Color Plane / Elemental Fantasy ────────────────────────────────────────
  ['text', 'A dimension where the entire world is made of stained glass, buildings are solid stained glass blocks with light passing through creating rainbow patterns on the ground, a figure walking through this rainbow cathedral city, no two adjacent surfaces are the same color, stunning glass cathedral fantasy, vibrant saturated color spectrum, prismatic light everywhere'],
  ['text', 'A world painted entirely in one color at a time, a scene at the moment of transition from blue to red, one half of the landscape is deep blue, the other half deep red, the transition zone is where artists are painting the world from blue to red in real time, surreal color theory fantasy, bold saturated color split composition'],
  ['text', 'A realm where shadows have physical form, the shadows cast by objects are solid black sculptures that extend into the ground, a street in this shadow-realm where buildings have enormous cast shadows that people walk on and through, surreal shadow dimension fantasy, deep black contrast against warm lit environment, Escher meets Tim Burton atmosphere'],
  ['text', 'A dimension of pure light and reflection, a landscape where every surface is a perfect mirror, an impossible world of infinite reflections, a figure standing in a field of their own reflections from every angle, surreal mirror dimension, cool silver and white palette, geometric kaleidoscope composition, beautiful surreal repetition'],
  ['text', 'A world of bioluminescent monochrome, everything glows in a single shifting color, the entire world pulses between deep blue, purple, and green as if breathing, creatures and plants in this world absorb and re-emit the same color, a lone traveler experiencing this monochromatic bioluminescent world, hypnotic fantasy color atmosphere, deep saturated blue-purple-green shift'],

  // ── Dream Architecture ──────────────────────────────────────────────────────
  ['text', 'A building that is a giant sleeping face, the architecture resembles a colossal stone face lying on its back, windows and doorways as closed eyes, main entrance as a mouth, a staircase descending into the mouth, people going about daily life on the sleeping face building, surreal architecture of a giant resting, warm stone and earthy tones, whimsical fantasy building'],
  ['text', 'A library that is a tree made of bookshelves, the trunk and branches are all shelf units packed with books, reading nooks built into hollow spaces between branches, a spiral staircase wrapped around the trunk, a scholar climbing the tree to reach the highest books, books hanging on vines from the branches, magical literary tree fantasy, warm amber lamplight and rich brown wood palette'],
  ['text', 'A staircase that goes nowhere and everywhere, a spiral staircase in a void ascending forever, each level shows a glimpse of a different world through the surrounding void: a beach, a mountain, a city, a forest, all visible from different steps of the same staircase, surreal dream architecture, different world glimpses each with distinct color palette, mysterious infinite stair composition'],
  ['text', 'A fortress built inside a thundercloud, massive stone walls rising from the center of an enormous storm cloud, lightning forking around the walls, a drawbridge extending from the cloud fortress to a distant peak, two guards at the gates looking down at the tiny world below, dramatic stormy fantasy, deep purple and electric blue lightning contrast, epic storm fortress atmosphere'],

  // ── Celestial Courts & Divine Fantasy ──────────────────────────────────────
  ['text', 'The court of a sun deity, a vast open-air throne room on the edge of the sun, the floor is molten gold and sunlight, massive golden columns with sun motifs, lesser deities and spirits attending the court, a human petitioner kneeling at the foot of the golden throne, blindingly bright and warm golden atmosphere, divine celestial fantasy'],
  ['text', 'The court of a moon goddess, an ethereal silver garden, silver-white flowers that only bloom at night, a moon pool reflecting the night sky, the moon goddess on a throne of frozen moonlight with frost and starlight on her robes, silver-blue and cool white palette, serene moonlit celestial court, transcendent calm atmosphere'],
  ['text', 'The divine realm of a god of death, not dark but overwhelmingly peaceful, white marble colonnades surrounding a still pond reflecting an eternal twilight sky, the god of death as a gentle giant in white robes tending to the pond, no grim reaper imagery but peaceful beautiful death, serene cool white and soft purple twilight palette, beautiful Thanatos fantasy'],
  ['text', 'Heaven as a city, massive floating white stone city with golden domes and silver spires, inhabitants in flowing white and silver robes, streets paved in luminous pearl-white stone, a waterfall cascading off the city edge into clouds below, blindingly bright but not harsh, peaceful eternal divine city fantasy, warm white and soft gold palette'],
  ['text', 'A celestial war between light and shadow, two massive armies clashing in a cosmic arena, one side pure blinding golden light, the other pure deep shadow, a figure in mortal armor standing at the dividing line between the armies, epic cosmic battle fantasy, stark black-white contrast with golden glow, dramatic scale composition'],

  // ── Underground Fantasy Civilizations ──────────────────────────────────────
  ['text', 'An underground city lit entirely by giant glowing mushrooms, purple and blue bioluminescent mushrooms the size of trees, buildings built from the mushroom stems, bridges between them made of woven mycelium, a underground river flowing through the city with boats, people harvesting mushroom spores as lanterns, dark atmospheric underground city with glowing blue-purple palette'],
  ['text', 'A vast underground cavern where a civilization lives in stalactites, buildings carved into the ceiling stalactites with rope bridges connecting them, the ground far below is an underground sea, villagers climbing up and down the massive stalactite buildings on ropes, glowing crystals embedded in the cavern ceiling as sun substitutes, surreal upside-down underground fantasy'],
  ['text', 'An underground mining city built into the walls of a giant geode, giant amethyst and quartz crystals growing from every surface, the city carved into and around the crystals, small dwellings built into crystal hollows, a crystal merchant market at the center, purple and white crystal light everywhere, surreal fantasy underground gem city'],
  ['text', 'A subterranean realm where the ceiling is the ocean floor, visible through massive natural glass domes in the cavern roof, above are fish and underwater scenes visible like a living aquarium, below is a bustling underground city with fishers and divers going up through the domes to fish in the world above, surreal glass-dome underwater ceiling fantasy'],

  // ── Carnival & Festival Fantasy ────────────────────────────────────────────
  ['text', 'A fantasy carnival set up inside a dormant volcano, colorful tents with magical pennants, performers with minor magical abilities doing shows, a fortune-teller tent with a glowing crystal ball, carnival games with enchanted prizes, the volcano walls providing dramatic red-lit backdrop, warm carnival colors (red yellow orange) contrasting with dark volcanic stone, magical circus fantasy atmosphere'],
  ['text', 'An eternal festival in a fantasy dimension, the festival has been going on for a thousand years and everything is slightly worn, faded colorful banners, a tired-looking juggler still juggling with three enchanted orbs, worn velvet curtains on the stages, a musician still playing a song that has played for centuries, warm but melancholic festival fantasy, rich faded warm palette of red velvet and brass, beautiful melancholic atmosphere'],
  ['text', 'A mask festival in a Venetian-style fantasy city, every citizen wearing elaborate ornate masks, a masked ball in a grand plaza, gondolas in canals, a masquerade procession with dancers in incredible feathered costumes, mysterious and magical atmosphere, rich jewel tone costumes of purple red and gold, fantasy Venice carnival atmosphere'],
  ['text', 'A harvest festival on a floating island, the entire island is celebrating with magical abundance, giant floating pumpkins, enchanted wheat sheaves standing by themselves, a bonfire that burns in all colors, forest spirits dancing at the edge of the forest, a village feast spread across the island, warm orange and red harvest colors, festive fantasy harvest celebration'],

  // ── War & Battle Fantasy Landscapes ───────────────────────────────────────
  ['text', 'A frozen lake battlefield where two armies face off on ice, the ice cracking under the weight of armored knights, soldiers falling through into dark water below, banners of opposing houses frozen in the moment of battle, an ice mage in the center freezing the battle mid-conflict, cold blue-grey palette with iron grey armor and warm torch fire, epic frozen battle fantasy'],
  ['text', 'A cliff battlefield at sunset, two armies clashing on a narrow mountain pass, the losing army retreating over a narrow bridge over a vast chasm, a hero holding the bridge alone against the horde, dramatic sunset backlighting silhouettes, epic last-stand fantasy battle scene, warm orange sunset contrasting with dark army silhouettes, dramatic heroic composition'],
  ['text', 'A magical war zone where spellcasters have permanently altered the landscape, a valley of solidified magical energy, rivers of crystallized fire still glowing, lightning-bolt shaped craters frozen in stone, a lone historian sketching the aftermath of this arcane battlefield, surreal magical warfare aftermath, rich contrasting warm fire colors against cool blue stone, detailed fantasy battlefield ruins'],
  ['text', 'A night siege of a floating castle, massive siege towers made of stone connected by rope bridges, attackers climbing with grappling hooks, defenders on the walls with boiling oil, the moon full and bright above, clouds below providing the floating effect, two moons visible in sky, dramatic night siege fantasy, dark blue night palette with warm fire and torch light, cinematic night assault atmosphere'],

  // ── Train Journeys & Mobile Fantasy ───────────────────────────────────────
  ['text', 'A fantasy train journey through impossible biomes, the train window showing a cross-section of four worlds: left window shows an underwater scene, right window shows a forest, top window shows clouds with birds, bottom window shows caves with crystals — all visible simultaneously through different windows of the same carriage, surreal multi-world fantasy train ride, four distinct color palettes in one scene'],
  ['text', 'A sky train floating on magnetic rails between floating islands, ornate fantasy train with crystal engines, passengers looking out at the view between islands with clouds far below, a vast mountain range visible in the distance, warm golden sunset light, floating island fantasy landscape from the perspective of the sky train, dreamy fantasy train journey'],
  ['text', 'A train station at the edge of reality, the last platform before the tracks go into pure white void, a train that travels between dimensions waiting at the station, a conductor checking a pocket watch made of starlight, travelers with one foot in normal world one foot on the threshold, surreal fantasy train terminus, warm amber train light against stark white void, mysterious portal station atmosphere'],

  // ── Spirit & Afterlife Fantasy ─────────────────────────────────────────────
  ['text', 'The river of souls in an afterlife realm, an infinite river of glowing spirit lights flowing through a dark void, each light a different color representing a different life, boats made of moonlight carrying the spirits to a distant shore, a ferryman in a hooded cloak, peaceful soul-transit fantasy, warm gold and cool silver spirit lights on dark blue void, serene ethereal atmosphere'],
  ['text', 'A spirit garden where ghosts grow like plants, a forest of translucent ghost trees with spirit-lights blooming in their branches, ghost flowers growing in the meadow, a spirit naturalist with a notebook cataloging different ghost species, ethereal ghost ecology fantasy, cool blue-white ghostly palette with soft silver glow, beautiful haunting atmosphere'],
  ['text', 'The space between worlds, a vast white void with fragments of different worlds floating in it like debris, a piece of forest world, a fragment of a city, a piece of ocean world, all drifting in an infinite white emptiness, a figure on a small platform trying to navigate this in-between realm, surreal liminal space fantasy, stark white void contrast with colorful world fragments'],

  // ── Forbidden / Cursed Fantasy ───────────────────────────────────────────────
  ['text', 'A garden of cursed beautiful flowers, each flower has a different minor curse: one makes you forget your name, one makes your laughter sound like crying, one makes you briefly see dead loved ones, a botanist in protective gear studying them with a notebook, beautiful gorgeous flowers in jewel tones, dark undercurrent fantasy, beautiful dangerous botanical garden'],
  ['text', 'A cursed library where the books whisper, the books are chained to their shelves but the pages turn by themselves, words float out of books and dissipate, a librarian with earplugs trying to silence them, ornate ancient library beautiful architecture, dark academia cursed library fantasy, warm amber candlelight against deep shadow, intellectual horror atmosphere'],
  ['text', 'A wishing well in a cursed clearing, the well is full of glowing coins from a thousand years of wishes, the trees around the clearing have strange growths that look like hands reaching toward the well, a traveler throwing a coin over their shoulder walking away quickly, beautiful but unsettling cursed well fantasy, warm golden glow from the well contrasting with dark twisting tree branches, beautiful ominous atmosphere'],

  // ── Light & Shadow Realms ───────────────────────────────────────────────────
  ['text', 'The borderland between the realm of eternal light and the realm of eternal shadow, a narrow strip of twilight where creatures from both sides meet and trade, half the sky blazing golden light the other half pure darkness, a market bazaar in this eternal twilight zone, beings of light and shadow trading openly, surreal dual-reality fantasy marketplace, warm gold and deep purple contrast meeting in the middle'],
  ['text', 'A world where it is always the moment just before dawn, perpetual pre-dawn twilight in a medieval city, stars still visible in the sky while the eastern horizon glows pink, street lamps being lit by lamplighters, a lone figure walking across a stone bridge, quiet serene pre-dawn city fantasy, cool blue-grey sky and warm amber lamp light, beautiful peaceful atmosphere, soft color palette'],
  ['text', 'The last hour of sunlight in a dying fantasy world, golden rays cutting through a crimson storm, the sun setting for the last time and taking magic with it, ancient trees withering as the golden light touches them, a mage trying to capture the last rays of sunlight in a crystal vial, apocalyptic fantasy beauty, warm gold and deep crimson red, bittersweet dramatic atmosphere'],
  ['text', 'A realm of pure midnight with no darkness, a world where the night is illuminated by bioluminescent plants and crystals so the night is brighter than day, a nighttime market running at midnight, people reading without torches, a city of eternal soft blue-white night light, surreal inverted day-night fantasy, cool blue-white bioluminescent palette, beautiful soft glowing night atmosphere'],

  // ── Elemental Crossroads ───────────────────────────────────────────────────
  ['text', 'A crossroads where all four elemental planes meet, an intersection in the center where fire, water, earth, and air zones touch: one corner flames, one corner has a pool of water, one corner is solid stone, one corner is swirling wind, a figure standing at the exact center trying to figure out how to pass through, surreal elemental crossroads fantasy, four contrasting elemental palettes meeting at one point'],
  ['text', 'A market at the intersection of the material world and the elemental planes, stalls run by elemental beings selling elemental goods: a salamander selling fire in jars, a water elemental merchant selling bottled rain, an earth elemental selling crystallized gemstones, an air spirit selling bottled breezes, magical fantasy market, vibrant elemental colors, bustling fantasy market atmosphere'],
  ['text', 'A battlefield between elemental gods, a massive clash at a crossroads where a fire god and water goddess fight, steam clouds from their collision, an earth god raising mountains while a wind goddess tears at them, dramatic elemental divine warfare, rich contrast of red-orange flames against blue-white water, epic scale fantasy divine battle'],

  // ── Library & Archive Fantasy ───────────────────────────────────────────────
  ['text', 'A library built inside a massive ancient tree, multiple levels accessed by spiral staircases carved into the trunk, the canopy above is a living roof of leaves filtering golden light, a librarian cat perched on a high shelf overseeing the library, books made of different materials (stone, bark, papyrus) for different subjects, magical living library fantasy, warm amber light and rich brown-green palette'],
  ['text', 'An archive of dreams where recorded dreams are kept in physical form, floating crystalline spheres in glass cases throughout a grand hall, each sphere containing a visible swirling dream scene, a dream archivist selecting a dream sphere to study, surreal dream archive fantasy, glowing silver-blue spheres against dark library walls, mysterious ethereal atmosphere'],
  ['text', 'A forbidden archive where dangerous knowledge is kept, books with chains and locked behind iron cages, one book with the chain broken and open, a figure in scholarly robes reading it despite the warnings, dark forbidden archive fantasy, warm candlelight illuminating ominous locked books, intellectual danger atmosphere, deep shadows with warm amber highlights'],
  ['text', 'A library where books write themselves, a scene of a room where books are actively writing themselves on the shelves, pages turning and quills moving by themselves, a scholar frantically taking notes on what the books are recording, magical autopublishing library fantasy, warm lamplight and floating quill dust, whimsical magical library atmosphere'],

  // ── Divine Beasts & Legendary Creatures in Landscapes ─────────────────────
  ['text', 'A valley where the last unicorn lives, a pristine white unicorn in a meadow of white flowers, rainbows constantly forming around it from its horn, a small figure approaching with a flower in hand, the landscape around the valley is grey and lifeless while the unicorn valley itself is lush and blooming, contrast of grey world and vibrant unicorn sanctuary, magical holy light atmosphere, beautiful mythical creature scene'],
  ['text', 'A forest clearing where a dragon and a knight have made peace, both sitting together sharing a meal, a campfire between them, the dragon is enormous but gentle, the knight has removed their armor, trust built between former enemies, unexpected peaceful fantasy scene, warm firelight orange and cool forest green, emotional heartwarming fantasy atmosphere'],
  ['text', 'A legendary sea serpent living in a kelp forest, the serpent is ancient and gentle with bioluminescent markings, fish living in its coils harmlessly, a small community of sea people who worship it living in the kelp forest around it, deep ocean fantasy with benevolent sea god, cool blue-green bioluminescent palette, serene mythical sea creature landscape'],
  ['text', 'A mountain home of a thunderbird, the thunderbird nest at the mountain peak is made of collected cloud fragments and lightning-struck trees, lightning constantly crackling around the nest, three young thunderbirds practicing flying among the storm clouds, a parent thunderbird watching, epic aerial fantasy scene, electric blue and deep purple lightning against dark sky, powerful natural fantasy atmosphere'],

  // ── Surreal Bazaars & Markets ───────────────────────────────────────────────
  ['text', 'A black market in a fantasy dimension selling impossible goods, a stall selling bottled time in different hour bottles, another stall selling pieces of solidified sound, another selling bottled emotions, an inspector with a lantern examining goods, surreal fantasy black market, warm lantern light against deep shadow, mysterious forbidden goods atmosphere'],
  ['text', 'A cloud market at the top of the world, merchants on clouds trading with each other, clouds connected by rope bridges with market stalls on them, goods include bottled sunrise, condensed moonlight, bottled wind, a merchant weighing clouds on a scale, surreal sky market fantasy, warm golden sunrise light, whimsical floating cloud commerce atmosphere'],
  ['text', 'A night market that only appears once a decade, stalls made of shadow and light, goods from forgotten worlds, a figure with a single lantern shopping the midnight market, other shoppers barely visible as silhouettes, a clock striking midnight in the background, rare magical night market, dark atmosphere with warm lantern glows, mysterious once-in-a-decade atmosphere'],

  // ── Train, Cart & Journey Fantasy ─────────────────────────────────────────
  ['text', 'A fantasy caravan crossing a desert made of salt, white salt flat desert as far as the eye can see, a colorful caravan with wagons covered in cloth, people leading camels and horses, a mirage of an oasis in the distance that is not there, a desert of salt rather than sand, warm golden harsh sunlight, white salt and warm amber palette, epic salt desert fantasy journey'],
  ['text', 'A hot air balloon voyage over a fantasy landscape at sunset, three ornate hot air balloons connected by rope walkways between them, passengers in Victorian fantasy dress, the landscape below is a patchwork of different biomes visible from above: forest, desert, mountains, sea, a painted map brought to life, warm sunset colors, peaceful aerial voyage fantasy'],
  ['text', 'A fantasy caravan inn at a crossroads in a wildflower meadow, colorful wagons parked in a circle, a fire pit in the center, travelers sharing stories, a musician playing fiddle, horses grazing in the surrounding meadow, golden hour warm light, warm earth tones and jewel tone wagon colors, cozy communal journey atmosphere, warm peaceful fantasy caravan scene'],
];

console.log(`准备入队 ${prompts.length} 条幻想场景提示词（第二轮）...\n`);

const insert = db.prepare(`
  INSERT INTO gen_jobs
    (id, user_id, mode, model, size, quality, prompt, negative_prompt, reference_image_url, status, attempt_count, max_attempts, queued_at, created_at, updated_at)
  VALUES (?, NULL, ?, 'gpt-image-2', '1024x1024', 'medium', ?, '', NULL, 'queued', 0, 5, ?, ?, ?)
`);

const now = new Date().toISOString();
let added = 0;
let failed = 0;

for (const [mode, promptText] of prompts) {
  const id = randomUUID();
  try {
    insert.run(id, mode, promptText, now, now, now);
    added++;
    const tag = promptText.match(/^[^,]+/)[0].trim();
    console.log(`  + ${tag.slice(0, 58)}`);
  } catch (e) {
    failed++;
    console.log(`  x 失败: ${e.message}`);
  }
}

console.log(`\n成功入队: ${added} 条  |  失败: ${failed} 条`);

const queue = db.prepare("SELECT status, COUNT(*) as c FROM gen_jobs GROUP BY status ORDER BY status").all();
console.log('\n=== 当前队列状态 ===');
queue.forEach(r => console.log(`  ${r.status}: ${r.c}`));

db.close();