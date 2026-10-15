# Localization

The game supports Spanish (`es`), English (`en`), and Simplified Chinese
(`zh-CN`). The saved `ps.lang` choice takes priority. Without a saved choice,
the `/en/` game entry selects English and `/zh/` selects Simplified Chinese; otherwise the browser language selects
Chinese for `zh` variants, Spanish for `es` variants, and English as fallback.
Change the language in Settings > Graphics > Language. A change reloads the game.

`js/core/i18n.js` translates Spanish source text in the DOM, canvas text and
measurement calls, and browser dialogs. User names and other user content marked
`translate="no"` stay unchanged. Keep identifiers, option values, and save data
in their source form. Only display text is translated.

## Simplified Chinese

- `js/data/lang-zh-CN.js`: interface text, gameplay descriptions, and release notes.
- `js/data/names-zh-CN.js`: all playable Pokemon names, keyed by the existing names.
- `tests/fixtures/official-zh-CN.json`: terminology checked against the Chinese game
  names in PokeAPI's move, item, type, region, and ability name tables.

Use the official Simplified Chinese game names, such as 皮卡丘, 阿尔宙斯,
十万伏特, 终极吸取, 吃剩的东西, and 气势披带. Do not translate an English
proper name literally. The source game's `focussash` item uses the Spanish label
`Banda Focus`; its item ID and effect identify Focus Sash, so use 气势披带.
Game-specific arenas, upgrades, and descriptions are localized for their actual
behavior; they are not official Pokemon game mechanics.

Name sources:

- [Official Chinese Pokedex](https://pokedex.pokemon.cn/)
- [PokeAPI language IDs](https://github.com/PokeAPI/pokeapi/blob/master/data/v2/csv/languages.csv)
- [Pokemon names](https://github.com/PokeAPI/pokeapi/blob/master/data/v2/csv/pokemon_species_names.csv)
- [Move names](https://github.com/PokeAPI/pokeapi/blob/master/data/v2/csv/move_names.csv)
- [Item names](https://github.com/PokeAPI/pokeapi/blob/master/data/v2/csv/item_names.csv)

Regenerate Pokemon names with `python3 tools/fetch_zh_names.py`. This reads the
local Pokedex and downloads PokeAPI CSV files into `tools/cache/` only when they
are absent. All translations ship in the local game bundle. Gameplay does not
call a translation service or download a Chinese font. Chinese glyphs use the
device's font fallback, while Latin text keeps Pixelify.

Each `{x}` placeholder must retain its source order and count. Add a complete
sentence or a specific template before relying on word fragments. Tests check
English dictionary coverage, official terms, all playable Pokemon names, news,
language selection, and canvas translation. Use browser checks for new screens,
dynamic text, Chinese name search, and desktop/mobile layout.

## Static pages

`tools/make_seo_pages.py` generates Spanish, English, and Simplified Chinese
pages. Chinese pages live under `/zh/`: guide, Pokedex, legendaries, shinies,
types, moves, items, achievements, news, and support. The `/zh/` game entry
uses the same production bundle. Contact also follows the game language.

Run `node tools/export_data.js` before the page generator. It exports both
translation dictionaries with the game data. Chinese data tables reuse the
same names and descriptions as the game; a missing translation stops the
build. Edit static prose in the generator, not in generated HTML.

Each page includes links to the same page in the other languages, canonical
and alternate URLs, and localized metadata. Clicking a language link or a
play button saves that explicit language choice for the game. Merely reading
a static page does not change the saved choice. Game links follow the active
game language, including links created in Settings and Support.

Run `node --test tests/*.test.js` after generating pages to check all language
routes, local links, official names, data coverage, and sitemap alternates.
