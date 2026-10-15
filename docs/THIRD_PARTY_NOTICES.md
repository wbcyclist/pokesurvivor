# Third-party notices

## Fusion Pixel Font

Chinese text uses unmodified Fusion Pixel 12px proportional WOFF2 files from
[release 2026.09.25](https://github.com/TakWolf/fusion-pixel-font/releases/tag/2026.09.25).
The `zh_hans` variant serves `zh-CN`; the Taiwan `zh_tw` variant serves `zh-TW`.
The fonts are served locally and loaded only when used by the active language.

Copyright (c) 2022, TakWolf (https://takwolf.com).
The fonts use SIL Open Font License 1.1. The full license and the release's
upstream font notices are included in `assets/fonts/fusion-pixel-12px-2026.09.25/`.

Source archive: `fusion-pixel-font-12px-proportional-otf.woff2-v2026.09.25.zip`.
Its SHA-256 matches the GitHub release asset digest:
`44b456f6f920d700f98d5865e03152d6a7357ed0a8ee388376ac0530d2d57072`.

| Font file | SHA-256 |
| --- | --- |
| `fusion-pixel-12px-proportional-zh_hans.otf.woff2` | `0ebd99e6f1e9b650a793a3f759c1c3dfa99f0c5b6502e78569b48ddb43767e40` |
| `fusion-pixel-12px-proportional-zh_tw.otf.woff2` | `3672c85ec9fdeb0024152acf8426fc6c6cd268852d7a8e7730fcf1c9a399083a` |

## Traditional Chinese translation reference

`js/data/lang-zh-TW.js` adapts interface translations from the user-provided
`pokesurvivor繁体中文补丁.js`, version 1.3.3. Only translation data was reused;
the userscript hooks, frame messaging, and status UI are not part of the game.
The reference file remains unchanged and is not a build dependency.

- Published source: https://greasyfork.org/zh-TW/scripts/599869
- Reference SHA-256: `316b89001d90ccaa7d6980ebd9f7c15e2cb3a33803d1fc75a13237373a50b565`
- The supplied file declares MIT licensing. Its notice is retained below.
- Pokemon names and official terms are checked against PokeAPI's `zh-hant`
  tables and the official Taiwan Pokedex. See `LOCALIZATION.md`.

MIT License — upstream source strings: https://github.com/JPTER78/pokesurvivor
Copyright (c) 2026 JPTER78

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
