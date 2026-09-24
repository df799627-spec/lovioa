#!/usr/bin/env node
/**
 * enqueue-batch4.js — 第四批：文化/宗教/科学/工业/极限运动等
 */
import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, 'data/lovioa.db');
const db = new Database(DB_FILE);

const prompts = [
  // ── Medical / Scientific ─────────────────────────────────────────────────
  ['text', 'A photorealistic brain scan visualization, a coronal MRI slice rendered as art, neural pathways glowing in different colors representing activity, deep black background, neuroscience art, medical imaging as aesthetic art, the beauty of the human mind visualized'],
  ['text', 'A laboratory science photograph of a researcher in a white coat holding a glowing test tube, the liquid inside glowing bright green, the lab is filled with equipment and monitors showing data, scientific research aesthetic, laboratory science photography, the romance of scientific discovery'],
  ['text', 'A microscopy photograph of plant cells, the cell walls stained in fluorescent colors, a researcher\'s hand visible holding the microscope slide, scientific microscopy photography, the hidden world of plant biology revealed, laboratory science aesthetic'],
  ['text', 'A satellite image composition of Earth from space, the atmosphere glowing like a thin blue line around the planet, city lights visible on the night side, the day side showing cloud patterns and ocean blue, NASA photography aesthetic, Earth from space satellite view, planetary portrait of home'],
  ['text', 'A DNA double helix sculpture in a public plaza, the helix is massive, people walking around its base, the structure is made of glass and steel with light glowing through it, a modern city plaza background, science meets public art, DNA helix sculpture in urban public space'],

  // ── Cultural Celebrations & Festivals ──────────────────────────────────
  ['text', 'A Diwali celebration scene, an Indian family lighting oil lamps on their terrace at dusk, the lamps creating a chain of golden lights, rangoli patterns on the floor, warm celebration atmosphere, Diwali festival celebration photography, festival of lights, Indian cultural celebration'],
  ['text', 'A Chinese New Year dragon dance in a crowded street, the dragon is enormous and elaborate, firecrackers creating smoke and sparks, lanterns hanging overhead, crowds of people watching, Chinese New Year celebration, vibrant dragon dance, Chinese cultural celebration street scene'],
  ['text', 'A Day of the Dead altar in a Mexican home, the ofrenda covered in marigolds, candles, photos of deceased loved ones, calaveras sugar skulls, Pan de Muerto bread, bright yellow and orange decorations, Day of the Dead altar, Mexican cultural tradition, colorful memorial altar'],
  ['text', 'A Holi festival scene in India, thousands of people covered in bright colored powder, throwing colored water into the air, the air is thick with pink and purple and orange powder, joyful chaos, Holi festival celebration, India\'s festival of colors, vibrant celebration photography'],
  ['text', 'A Japanese matsuri festival at night, paper lanterns lighting the entire street, traditional food stalls, people wearing yukata, a portable shrine being carried through the crowd, summer matsuri festival, Japanese street celebration at night, festival atmosphere'],

  // ── Extreme Sports & Adventure ──────────────────────────────────────────
  ['text', 'A base jumper in mid-air deploying a parachute, the person is impossibly small against a massive mountain cliff face, the parachute is fully open in perfect circular form, dramatic mountain landscape, extreme sports photography, BASE jumping from a mountain cliff, death-defying sports photography'],
  ['text', 'A rock climber hanging from a single finger grip on a sheer rock face, the climber is in a challenging finger-lock position, vast landscape visible far below, the climber\'s focused expression, rock climbing extreme sports photography, climber at the edge of the world'],
  ['text', 'A big wave surfer riding a massive 30-foot wave at Pipeline, the surfer crouched on the board mid-turn, the wave beginning to curl and crash behind, deep blue water, Pipeline surf photography, extreme big wave surfing, the most dangerous wave in the world'],
  ['text', 'A skier in a wingsuit flying between two mountain peaks at high speed, the mountains on both sides, the skier\'s body horizontal in flight position, the arms and legs spread in the suit, wingsuit flying between peaks, extreme aerial sports photography, skydiving meets alpine environment'],
  ['text', 'A skateboarder performing a kickflip over a large staircase set, the skateboard is upside down mid-flip in the air, the skater in mid-motion, a crowd watching in the background, street skateboarding, skateboard kickflip over stairs, urban skateboarding culture photography'],
  ['text', 'A white water rafter going over a massive waterfall drop, the raft is at the edge of the falls, the water crashing ahead, the rafter\'s hands gripping the paddle, extreme white water rafting, waterfall drop in rapids, extreme river sports photography'],
  ['text', 'A freediver at 30 meters depth in the open ocean, perfectly still in the blue void, the surface light far above creating a distant ceiling of light, bioluminescent creatures visible in the darkness below, freediving deep ocean photography, silence in the deep blue'],

  // ── Industrial & Working ─────────────────────────────────────────────────
  ['text', 'An aerial photograph of a massive container ship at sea, the ship is impossibly huge, stacked containers in geometric patterns in every color, the wake trail behind, the ocean is deep dark blue, cargo shipping industry, container ship aerial photography, the scale of global trade'],
  ['text', 'A steel mill interior at night, molten steel flowing in the furnace, sparks flying, workers in protective gear silhouetted against the orange glow, industrial steel production, steel mill at night, dramatic industrial photography, heavy industry atmosphere'],
  ['text', 'A coal mine from above, the mine is carved into a mountainside, a single road winding up to the entrance, dump trucks the size of toys, a town at the base of the mountain, coal mining industry aerial photography, the human cost of energy production'],
  ['text', 'A NASA rocket launch at night, the rocket is ascending with a massive plume of fire, the launchpad smoke glowing orange and white, the night sky lit for miles, rocket launch photography, space program launch, dramatic NASA rocket at liftoff'],
  ['text', 'A Boeing 747 being assembled in a massive aircraft hangar, the fuselage is the dominant structure, workers on scaffolding for scale, every surface gleaming aluminum, aircraft manufacturing, airplane factory interior, the scale of commercial aviation manufacturing'],
  ['text', 'A fishing boat at sea in rough weather, the boat is pitching in high waves, the deck is covered in foam and spray, a lone fisherman securing equipment in the storm, commercial fishing at sea, rough weather maritime photography, fishing boat in a storm'],

  // ── Architecture Detail ─────────────────────────────────────────────────
  ['text', 'An extreme detail photograph of a Art Deco door handle, the brass has been worn smooth by a century of hands, every scratch and patina visible, a fingerprint visible in the oxidation, Art Deco door handle close-up, architectural hardware detail, the history in worn brass'],
  ['text', 'A spiral staircase photographed from directly below, the stairs twisting upward into darkness, each step creating a perfect geometric spiral, a single light at the top, architectural staircase perspective photography, spiral staircase from below, geometric architectural photography'],
  ['text', 'A brutalist concrete building photographed at a specific angle so it looks like a spaceship, the angular concrete forms create a sci-fi silhouette, one tree in the foreground, concrete brutalist architecture, modern brutalism photographed as alien architecture, architectural photography illusion'],
  ['text', 'A gothic cathedral ceiling from below, the ribbed vaulting creates an intricate geometric network, light streaming through stained glass windows in shafts of color, gothic cathedral ceiling, ecclesiastical architecture from below, the geometry of gothic vaulting'],
  ['text', 'An abandoned factory interior, nature has completely reclaimed the space, trees growing through the floor, a tree canopy visible where the roof has collapsed, a deer walking through the space, post-industrial nature reclamation, decay and regrowth in an abandoned factory, nature meets industry'],

  // ── Social Documentary ─────────────────────────────────────────────────
  ['text', 'A documentary photograph of a night shift nurse in an empty hospital corridor, the nurse walking alone under fluorescent lights, the empty hallway stretching ahead, night shift hospital atmosphere, healthcare workers documentary, the quiet loneliness of night shift work'],
  ['text', 'A street scene in Kolkata at dawn, the streets are completely filled with people sleeping on the sidewalks and streets, a man on a bicycle weaving through them, documentary street photography, Kolkata sleeping on streets, social documentary urban poverty photography'],
  ['text', 'A photograph of an elderly Japanese man sitting alone on a bench in a Tokyo park, feeding pigeons at sunset, the park is empty except for him, warm afternoon light, elderly social isolation in urban Japan, documentary photography, contemplative solitude in a city park'],
  ['text', 'A crowd photograph from directly above looking down, thousands of people walking through a city square in different directions, the patterns created by the movement, the density of human cities, aerial crowd photography, human anthill aerial view, urban density patterns'],

  // ── Pets & Animals ───────────────────────────────────────────────────────
  ['text', 'A wolf pack on a snow-covered hillside at dawn, the alpha pair at the front, the rest following in formation, breath visible in the cold air, snow drifting in the wind, wolf pack behavior, Arctic wolf pack on snow, dramatic pack behavior photography'],
  ['text', 'A kingfisher diving into water, the bird is a blur of iridescent blue and orange, the splash is just beginning, a ring of water rippling outward, the fish visible just below the surface, kingfisher dive sequence, wildlife action photography, bird hunting fish'],
  ['text', 'An elephant graveyard scene, massive elephant skulls and tusks scattered across a dry riverbed, the largest land animals reduced to bones, solemn and stark, elephant graveyard, African savanna elephant remains, wildlife mortality photography'],
  ['text', 'A close-up of a chameleon\'s eye, the eye is bulging and turret-like, one eye looking at camera, one eye looking in a different direction, the skin texture of the chameleon is extraordinary, chameleon eye macro photography, the alien vision of a chameleon, reptilian eye close-up'],
  ['text', 'A bear catching a salmon in mid-air in a river, the bear is leaping from the water, the salmon is a silver blur in the bear\'s jaws, spray and water everywhere, brown bear salmon fishing, Alaska grizzly bear jump, wildlife hunting action photography'],
  ['text', 'A barn owl in flight at night, the owl is perfectly white, glowing in the moonlight, wings fully spread, flying over a dark field, the moonlight creating a rim light on the owl\'s feathers, barn owl at night, nocturnal raptor flight photography, ghostly white owl flight'],
  ['text', 'A sea turtle swimming directly toward the camera, looking the viewer in the eye, massive and ancient, barnacles on the shell, the ocean blue behind, sea turtle portrait, giant sea turtle eye-level encounter, endangered marine life portrait'],

  // ── Weather & Natural Phenomena ──────────────────────────────────────────
  ['text', 'A lightning bolt striking the Eiffel Tower at night, the bolt is perfectly connected, the tower lit with warm yellow light, the sky an otherworldly flash, the Champ de Mars in the foreground, lightning strike on landmark, dramatic night storm landmark photography, urban lightning photography'],
  ['text', 'A tornado photographed from a safe distance in Kansas, the funnel is perfectly formed, touching ground and cloud, the surrounding landscape is green farmland, a storm chaser vehicle visible for scale, dramatic tornado landscape, extreme weather landscape photography, supercell tornado'],
  ['text', 'A volcanic eruption at night, the volcano is erupting with a massive lava fountain, molten rock flowing down the sides, the night sky lit by the orange glow, ash cloud rising above, volcanic eruption night photography, Iceland volcanic eruption, dramatic geological event'],
  ['text', 'A double rainbow over a vast landscape, the double rainbow is perfectly defined, the landscape below is a calm lake reflecting the sky, the colors are impossibly saturated, double rainbow over lake reflection, atmospheric optical phenomenon landscape, vivid double rainbow with reflection'],
  ['text', 'A fog bow over the ocean, a perfectly formed circular rainbow in the fog, a white arc against the grey fog, the sun behind the viewer, a fishing boat in the center of the arc, fog bow over sea, rare atmospheric phenomenon, white rainbow in fog over ocean'],

  // ── Space & Cosmic ────────────────────────────────────────────────────────
  ['text', 'A space station interior, an astronaut floating weightlessly in a corridor, the Earth visible through a porthole in the background, cables and equipment lining the walls, the International Space Station interior, space station habitat photography, life in orbit'],
  ['text', 'A black hole visualization, the accretion disk is made of superheated gas in swirling orange and white, the event horizon is a perfect circle of pure black, light bending around it, the singularity at the center, astrophysics black hole visualization, the most extreme object in the universe visualized'],
  ['text', 'A supernova remnant expanding from a central point, the explosion is beautiful and terrifying, filaments of gas expanding outward in all directions, a stellar explosion captured mid-expansion, supernova remnant nebula, stellar death visualized, cosmic explosion photography concept'],
  ['text', 'The surface of Mars photographed from ground level, the rust-red landscape extends to the horizon, dust devils in the distance, a horizon sky that is pink and orange, rocks and pebbles covering the ground, a solar panel visible from a rover, Mars surface landscape photography, Mars photographed like Earth landscape'],
  ['text', 'A galaxy collision in progress, two spiral galaxies in the process of merging, stars and gas streaming between them, the gravitational tidal forces creating beautiful tidal arms, galaxy merger visualization, cosmic scale interaction, two galaxies colliding in deep space'],
  ['text', 'A planet with two suns rising over a landscape, the planet is an alien world with exotic terrain, two suns in the sky, one larger and orange, one smaller and blue, a moonset happening simultaneously, binary star system planet, alien planet with two suns landscape, sci-fi planetary landscape concept art'],

  // ── Still Life & Objects ─────────────────────────────────────────────────
  ['text', 'A still life of a single perfect red apple on a black background, the apple is flawless with one single leaf on the stem, dramatic studio lighting creating reflections on the skin, the most technically perfect apple photograph possible, product still life, perfect apple with studio lighting'],
  ['text', 'A collection of vintage typewriters on a white table, five different models from different eras arranged perfectly, every typewriter in working condition, from Oliver to Corona to Remington, vintage typewriter collection still life, typewriter history arranged as art, vintage office equipment collection'],
  ['text', 'A still life of a broken antique clock on a surface, the clock face is cracked, the hands stopped at 3:42, the gears visible through the broken case, the broken mechanism exposed, the passage of time stopped, vintage broken clock still life, time frozen in a broken clock'],
  ['text', 'A single unopened red rose in a clear glass vase on a white background, the rose is perfect, every petal visible, one drop of morning dew on the petals, the vase has a single drop of condensation on the outside, single red rose still life, dew-covered rose in crystal vase, perfect botanical still life'],
  ['text', 'A minimalist arrangement of three objects on white: a stone, a glass sphere, and a feather, the stone is perfectly smooth grey river rock, the glass sphere is crystal clear with a single internal flaw, the feather is pure white, minimalist still life, three objects on white, the essence of still life'],

  // ── Botanical ──────────────────────────────────────────────────────────────
  ['text', 'An orchid photographed like a fashion portrait, the orchid is in full bloom, dramatic lighting showing texture in every petal, the background is pure black, a macro portrait of orchid beauty, orchid flower photography, the exotic beauty of orchid flowers under studio conditions'],
  ['text', 'A bonsai tree photographed as a mountain landscape, from a certain angle the trunk looks like a cliff face, the foliage like a forest canopy, a tiny figurine at the base for scale, bonsai tree as landscape photography, the art of bonsai as miniature landscape, Japanese bonsai photography'],
  ['text', 'A forest floor covered in mushrooms at the moment of a heavy rain, every mushroom has water droplets on the cap, the forest floor is dark rich earth, a macro view of the mycorrhizal world, forest floor mushroom in rain, mushroom macro photography with rain droplets, the hidden world of forest fungi'],
  ['text', 'A sunflower field at noon, every sunflower facing the same direction following the sun, the field extends to the horizon, the sky is cloudless blue, a single bee visiting one flower in the center, sunflower field at peak noon, agricultural landscape photography, sunflower field at solar noon'],
  ['text', 'A single carnivorous plant: a Venus flytrap with its trap fully open, waiting for prey, the trap is red on the inside with tiny trigger hairs visible, a single tiny insect visible at the edge of the trap, carnivorous plant macro photography, Venus flytrap in action, exotic plant photography'],

  // ── Religious & Sacred Spaces ────────────────────────────────────────────
  ['text', 'The interior of the Sistine Chapel ceiling photographed from directly below, every detail of Michelangelo\'s creation visible, the famous ceiling vault with God reaching toward Adam, Sistine Chapel interior, Michelangelo ceiling photography, the most famous ceiling in the world photographed perfectly'],
  ['text', 'A Buddhist monastery in Bhutan at dawn, the monastery is carved into the mountainside, prayer flags stretching between peaks, a single monk standing on a balcony in the cold morning air, Himalayan Buddhist monastery, Bhutan monastery at sunrise, sacred mountain architecture'],
  ['text', 'A Muslim prayer hall during the call to prayer, the mosque is full of worshippers on prayer mats, the geometric tile floor, light streaming through ornate windows, a Saudi mosque interior, Islamic prayer hall, mosque interior photography during prayer, Islamic worship space'],
  ['text', 'A Shinto torii gate in the middle of the ocean, a massive vermillion torii standing in deep blue ocean water, Japan, Miyajima island, the gate is half-submerged at high tide, the Itsukushima Torii gate, Shinto torii in ocean, the most iconic Shinto gate in Japan'],
  ['text', 'An underground ancient Christian catacomb, the stone walls covered in ancient frescoes and crosses, a single candle providing all light, a narrow stone passage stretching into darkness, Roman catacombs, underground Christian burial site, ancient religious catacombs photography'],

  // ── Misc / Unexpected ─────────────────────────────────────────────────────
  ['text', 'A photorealistic depiction of a perfect circle of 100 banknotes fanned out in a circle, every bill in a different world currency, the circle is rotating slowly, studio black background, banknotes fanned in a circle, currency collection still life, global wealth concept art'],
  ['text', 'A split-screen photograph: on the left, a beach in the Caribbean at sunrise — pristine white sand and turquoise water. On the right, the same beach 50 years later — erosion has claimed most of the sand, the water is darker, a single eroded post marks where the resort stood. Environmental change split-screen, climate change impact photography'],
  ['text', 'A self-portrait in a mirror by a photographer in their own studio, but the mirror shows a different version of the room — slightly wrong, slightly off, the reflections are not quite correct, surreal mirror self-portrait, surrealist self-portrait photography, the uncanny in domestic self-portrait'],
  ['text', 'A forensic facial reconstruction of a human skull, clay features built onto the bone structure, the eyes are missing and sockets are hollow, the beginning of reconstruction, forensic facial reconstruction, forensic anthropology visualization, a skull becoming a face'],
  ['text', 'A map of the world\'s internet cable network, the ocean floor visible as a dark surface, glowing lines of internet cables spanning the globe, the map shows the actual cable routes used by global internet, internet infrastructure map, undersea internet cable network visualization, global connectivity infrastructure'],
];

console.log(`准备入队 ${prompts.length} 条第四批提示词...\n`);

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
    console.log('  +', promptText.slice(0, 55));
  } catch(e) {
    failed++;
    console.log('  x', e.message.slice(0, 50));
  }
}

console.log(`\n成功: ${added}  |  失败: ${failed}`);

const q = db.prepare("SELECT status, COUNT(*) as c FROM gen_jobs GROUP BY status ORDER BY status").all();
console.log('\n=== 队列状态 ===');
q.forEach(r => console.log('  ' + r.status + ': ' + r.c));

db.close();