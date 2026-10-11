// Pure end-of-game data: the run summary and the credits text.
export function runStats(state, creatures = {}) {
  const kills = Object.values(state.bestiary?.kills ?? {}).reduce((s, n) => s + n, 0);
  const rare = Object.entries(creatures).filter(([id, c]) => c.hybrid && (state.bestiary?.kills?.[id] ?? 0) > 0).length;
  const rareTotal = Object.values(creatures).filter((c) => c.hybrid).length;
  const m = state.party[0];
  return { name: state.heroName, cls: state.heroClass, level: m?.level ?? 1, playtime: state.playtime ?? 0, kills, rare, rareTotal, gold: state.gold, chapter: state.chapter };
}

export const CREDITS = [
  ['THE DROWNED SUN', 'title'],
  ['', ''],
  ['Story, art, music and code', 'head'],
  ['all made for this game', ''],
  ['', ''],
  ['Built with', 'head'],
  ['Phaser 3 and Electron', ''],
  ['', ''],
  ['The people you met', 'head'],
  ['Elder Maren Salt and the salt-pan folk of Brinewick', ''],
  ['Reeve Aldous and the River Roads', ''],
  ['The delvers of the Sedge Mines', ''],
  ['Everyone at Khesh Ura, Silverhush and Mirrorfall', ''],
  ['Ashra Vell and the hearth-wardens of Kindle Rest', ''],
  ['Eilidh Strand and the Drowned Choir', ''],
  ['Kaer Solenne and the Last Lamp', ''],
  ['', ''],
  ['And the bees', 'head'],
  ['', ''],
  ['The sun is up.', 'head'],
  ['Thank you for playing.', 'title'],
];
