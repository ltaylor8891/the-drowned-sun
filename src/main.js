import { Boot } from './scenes/Boot.js';
import { Title } from './scenes/Title.js';
import { NewGame } from './scenes/NewGame.js';
import { Slots } from './scenes/Slots.js';
import { PauseMenu } from './scenes/PauseMenu.js';
import { Options } from './scenes/Options.js';
import { NameHero } from './scenes/NameHero.js';
import { DebugMenu } from './scenes/DebugMenu.js';
import { NpcMenu } from './scenes/NpcMenu.js';
import { Shop } from './scenes/Shop.js';
import { Forge } from './scenes/Forge.js';
import { Shrine } from './scenes/Shrine.js';
import { Cook } from './scenes/Cook.js';
import { MerchantShop } from './scenes/MerchantShop.js';
import { RecruitPrompt } from './scenes/RecruitPrompt.js';
import { Ascension } from './scenes/Ascension.js';
import { RuneTable } from './scenes/RuneTable.js';
import { Brew } from './scenes/Brew.js';
import { Fishing } from './scenes/Fishing.js';
import { Credits } from './scenes/Credits.js';
import { Overworld } from './scenes/Overworld.js';
import { BattleScene } from './scenes/Battle.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game',
  backgroundColor: '#000000',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [Boot, Title, NewGame, Slots, PauseMenu, Options, NameHero, DebugMenu, NpcMenu, Shop, RecruitPrompt, Forge, MerchantShop, Shrine, Cook, Ascension, RuneTable, Brew, Fishing, Credits, Overworld, BattleScene],
});

if (new URLSearchParams(location.search).has('dev')) window.__game = game;
