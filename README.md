# The Drowned Sun

Play the browser edition: https://ltaylor8891.github.io/the-drowned-sun/

A turn-based adventure RPG. Use a desktop browser with a keyboard or compatible gamepad.

Current release: all 20 chapters, the ending and credits, procedural music, controller button rebinding, and key-item uses (M13 polish). See version.json for the original game revision.

## Controls

- Arrow keys or WASD: move / choose.
- Enter or Space: confirm / interact.
- Escape or X: cancel / open the menu.
- Options: change controls, sound, and fullscreen.

Saves and settings are stored in this browser on this device. They do not sync with the Windows edition or other browsers. Clearing site data removes browser saves.

## Website files

This repository is an independent copy of the game for GitHub Pages. The original desktop project is unchanged. Phaser is bundled in vendor/ with its MIT license. The game itself remains unlicensed; publishing this repository does not grant an open-source license.

No build or dependency installation is needed. GitHub Pages serves the main branch root. Commit and push website updates to main to publish them.

Run the existing game checks with Node.js 22 or newer:

    npm test

All local website source, tests, deployment metadata, and Git history are kept inside the Website folder in the original workspace. Local verification output is ignored under .local/.
