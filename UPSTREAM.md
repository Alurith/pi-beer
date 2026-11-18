# Upstream code

`native-screen.js`, `raster.js`, `animation.js`, the model constructor in
`model.js`, and the startup help layout in `index.ts` adapt Pi 1.5.2 code
from `@earendil-works/pi-coding-agent`.

Source repository: https://github.com/earendil-works/pi

Original renderer:
`packages/coding-agent/src/modes/interactive/components/easter-egg-3d.ts`.

The renderer is split into local modules without changing its animation maths.
The adapter injects the public theme and keybindings, removes Armin support,
adds disposal, and supplies the beer model. The extension uses only public host
imports in production. Tests compare against the installed native renderer.

The upstream MIT license is reproduced in `LICENSE`, retrieved from
https://raw.githubusercontent.com/earendil-works/pi/main/LICENSE.
