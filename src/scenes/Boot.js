import { loadSettings, applyDisplay } from '../systems/settingsIO.js';

export class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    this.add.text(640, 360, 'Loading...', { fontFamily: 'monospace', fontSize: '28px', color: '#ffffff' }).setOrigin(0.5);
    this.load.json('classes', 'src/data/classes.json');
    this.load.json('classes_t2', 'src/data/classes_t2.json');
    this.load.json('classes_t3', 'src/data/classes_t3.json');
    this.load.json('creatures', 'src/data/creatures.json');
    this.load.json('abilities', 'src/data/abilities.json');
    this.load.json('statuses', 'src/data/statuses.json');
    this.load.json('encounters', 'src/data/encounters.json');
    this.load.json('companions', 'src/data/companions.json');
    this.load.json('items', 'src/data/items.json');
    this.load.json('jobs', 'src/data/jobs.json');
    this.load.json('merchant_pool', 'src/data/merchant/pool.json');
    this.load.json('merchant_locations', 'src/data/merchant/locations.json');
    this.load.json('dialogue_merchant', 'src/data/dialogue/merchant.json');
    this.load.json('chapters', 'src/data/chapters.json');
    const maps = ['brinewick', 'maren_house', 'shop', 'inn', 'net_shed', 'pell_house', 'salt_pans', 'mire_marsh', 'hollow_cove',
      'north_road', 'tallow_ford', 'smithy', 'thistle_store', 'tallow_inn', 'goblin_camp', 'spider_den',
      'river_road', 'reedhollow', 'drowned_anchor', 'brackwater_store', 'lamp_house', 'toll_dock', 'wolfwood', 'echo_culvert',
      'old_tramway', 'lanternmoor', 'lantern_inn', 'guildhall', 'rivet_stores', 'upper_works', 'lower_shafts', 'seep_cavern',
      'dune_road', 'ogre_canyon', 'khesh_ura', 'water_gate', 'boar_hollow', 'sand_warren', 'khesh_bazaar', 'khesh_inn', 'hunters_lodge',
      'scorch_road', 'waystation', 'toll_fort', 'scorpion_burrow', 'waystation_store', 'waystation_inn',
      'cliff_road', 'perch_village', 'harpy_cliffs', 'whisper_tombs', 'bat_roost', 'perch_store', 'perch_inn', 'cooks_hall',
      'glass_dunes', 'mirrorfall', 'glass_temple', 'buried_crypt', 'mirrorfall_store', 'mirrorfall_inn', 'traders_guild',
      'labyrinth_road', 'lastlight_camp', 'labyrinth_halls', 'glass_throne', 'minotaur_den', 'lastlight_store', 'lastlight_inn',
      'frost_road', 'silverhush', 'hush_keep', 'ruined_stacks', 'silverhush_store', 'silverhush_inn', 'grand_library',
      'rootmere_wood', 'rootmere_hamlet', 'frozen_shrine', 'mossy_hollow', 'rootmere_store', 'rootmere_inn', 'explorers_lodge',
      'moor_road', 'lantern_hold', 'moor_depths', 'grave_barrow', 'lanternhold_store', 'lanternhold_inn',
      'black_cliffs', 'ashfall_camp', 'keep_courtyard', 'keep_halls', 'vael_throne', 'vael_chapel', 'rune_vault', 'vael_catacombs', 'ashfall_store', 'ashfall_inn', 'runewright_hut',
      'ridge_pass', 'ridgewatch_camp', 'gallow_courtyard', 'gallow_chapel', 'tusk_pit', 'quartermaster_tent', 'surgeon_tent'];
    for (const id of maps) this.load.json(`map_${id}`, `src/data/maps/${id}.json`);
    this.load.json('shops', 'src/data/shops.json');
    this.load.json('story_ch1', 'src/data/story/chapter1.json');
    this.load.json('story_ch2', 'src/data/story/chapter2.json');
    this.load.json('story_ch3', 'src/data/story/chapter3.json');
    this.load.json('story_ch4', 'src/data/story/chapter4.json');
    this.load.json('story_ch5', 'src/data/story/chapter5.json');
    this.load.json('story_ch6', 'src/data/story/chapter6.json');
    this.load.json('story_ch7', 'src/data/story/chapter7.json');
    this.load.json('story_ch8', 'src/data/story/chapter8.json');
    this.load.json('story_ch9', 'src/data/story/chapter9.json');
    this.load.json('story_ch10', 'src/data/story/chapter10.json');
    this.load.json('story_ch11', 'src/data/story/chapter11.json');
    this.load.json('story_ch12', 'src/data/story/chapter12.json');
    this.load.json('story_ch13', 'src/data/story/chapter13.json');
    this.load.json('story_ch14', 'src/data/story/chapter14.json');
    this.load.json('dialogue_ashfall', 'src/data/dialogue/ashfall.json');
    this.load.json('dialogue_lanternhold', 'src/data/dialogue/lanternhold.json');
    this.load.json('dialogue_rootmere', 'src/data/dialogue/rootmere.json');
    this.load.json('dialogue_silverhush', 'src/data/dialogue/silverhush.json');
    this.load.json('dialogue_lastlight', 'src/data/dialogue/lastlight.json');
    this.load.json('dialogue_mirrorfall', 'src/data/dialogue/mirrorfall.json');
    this.load.json('dialogue_perch', 'src/data/dialogue/perch.json');
    this.load.json('dialogue_waystation', 'src/data/dialogue/waystation.json');
    this.load.json('dialogue_khesh_ura', 'src/data/dialogue/khesh_ura.json');
    this.load.json('dialogue_ridgewatch', 'src/data/dialogue/ridgewatch.json');
    this.load.json('dialogue_lanternmoor', 'src/data/dialogue/lanternmoor.json');
    this.load.json('dialogue_reedhollow', 'src/data/dialogue/reedhollow.json');
    this.load.json('dialogue_tallow_ford', 'src/data/dialogue/tallow_ford.json');
    this.load.json('quests', 'src/data/quests.json');
    this.load.json('dialogue_brinewick', 'src/data/dialogue/brinewick.json');
  }
  create() {
    const c = this.cache.json; // Tier 2 classes live in their own file; the game sees one merged table
    c.add('classes', { ...c.get('classes'), ...c.get('classes_t2'), ...c.get('classes_t3') });
    loadSettings().then(applyDisplay).then(() => this.scene.start('Title')); }
}
