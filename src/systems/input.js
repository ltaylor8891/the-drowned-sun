// Action-based input: keyboard (rebindable via settings) and Xbox-style controller (Confirm and Cancel rebindable).
import { settings } from './settings.js';
import { padActions, PadTracker, firstPad, buttonMap } from './gamepad.js';

const held = () => padActions(firstPad(), buttonMap(settings.pad));

export class Input {
  constructor(scene, bindings = settings.bindings) {
    this.keys = {};
    for (const [action, names] of Object.entries(bindings)) {
      this.keys[action] = names.filter(Boolean).map((n) => scene.input.keyboard.addKey(n));
    }
    this.pad = new PadTracker(held());
    scene.events.on('preupdate', () => this.pad.poll(held()));
    // When an overlay closes and this scene resumes, buttons still held (the press that closed it) must not count.
    scene.events.on('resume', () => { this.pad = new PadTracker(held()); });
    scene.events.once('shutdown', () => scene.input.keyboard.removeAllKeys(true));
  }
  pressed(action) {
    return this.keys[action].some((k) => Phaser.Input.Keyboard.JustDown(k)) || this.pad.take(action);
  }
  down(action) {
    return this.keys[action].some((k) => k.isDown) || this.pad.held.has(action);
  }
}
