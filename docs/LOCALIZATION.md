# Localization

The game supports Spanish (`es`), English (`en`), Simplified Chinese (`zh-CN`),
and Traditional Chinese (`zh-TW`). The saved `ps.lang` choice takes priority.
Without a saved choice, `/en/`, `/zh/`, and `/zh-tw/` select their respective
languages. Other entries use the browser language: `zh-Hant`, `zh-TW`, `zh-HK`,
and `zh-MO` select Traditional Chinese; `zh-Hans` and other `zh` variants select
Simplified Chinese. An explicit script tag takes priority over the region.
Spanish browser locales select Spanish, with English as the fallback.
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
call a translation service. Both Chinese locales use local Fusion Pixel 12px
proportional fonts: `zh_hans` for Simplified Chinese and `zh_tw` for Traditional
Chinese. The original font files come from release `2026.09.25`; they are not
subsetted or converted. Existing UI sizes stay unchanged. Other locales keep
Pixelify. CSS and canvas share the active font stack. Startup loads the font
at normal and bold UI weights before opening the game. Font loading failures
fall back to system fonts. Static guides and Contact use the same Chinese
fonts. See `THIRD_PARTY_NOTICES.md` for sources, hashes, and licenses.

Each `{x}` placeholder must retain its source order and count. Add a complete
sentence or a specific template before relying on word fragments. Tests check
English dictionary coverage, official terms, all playable Pokemon names, news,
language selection, and canvas translation. Use browser checks for new screens,
dynamic text, Chinese name search, and desktop/mobile layout.

## Traditional Chinese

- `js/data/lang-zh-TW.js`: interface translations adapted from the supplied
  Traditional Chinese patch v1.3.3, with current UI and release notes added.
- `js/data/names-zh-TW.js`: all playable names from PokeAPI language 4 (`zh-hant`).
- `tests/fixtures/official-zh-TW.json`: official move, item, type, region, and
  ability terms matched by their IDs to the Simplified Chinese fixtures.

The two Chinese locales have distinct dictionaries. Use official Traditional
Chinese names, including 謎擬Ｑ and 多邊獸Ｚ; these are not character conversions
of the Simplified Chinese names. See the [Taiwan Pokedex](https://tw.portal-pokemon.com/pokedex/),
including [Mimikyu](https://tw.portal-pokemon.com/pokedex/0778/) and
[Porygon-Z](https://tw.portal-pokemon.com/pokedex/0474/).
Use 異色 for Shiny, as in the [official Shiny Eternatus event](https://tw.portal-pokemon.com/topics/receive_shiny_eternatus/).
Keep 閃光 for flashes and visual effects.

Regenerate names with `python3 tools/fetch_zh_names.py --locale zh-TW`.
The default command continues to generate Simplified Chinese names. Keep both
dictionaries complete when adding source strings. Use `G.I18n.moveName(name)`
when displaying moves: the Spanish label `Psíquico` means the Psychic type
(超能力) or the Psychic move (精神强念 / 精神強念), depending on context.
This helper changes display text only, not move definitions or save data.

The reference userscript remains unchanged and is not loaded by the game.
Only its translation data was adapted; its DOM hooks and frame messaging are
not used. Attribution and its supplied MIT notice are in `THIRD_PARTY_NOTICES.md`.
Static prose is maintained explicitly in the page generator. Neither gameplay
nor builds require a Chinese conversion package or an external translation service.

## Static pages

`tools/make_seo_pages.py` generates Spanish, English, Simplified Chinese, and
Traditional Chinese pages. Chinese pages live under `/zh/` and `/zh-tw/`: guide, Pokedex, legendaries, shinies,
types, moves, items, achievements, news, and support. Both Chinese game entries
use the same production bundle. Contact also follows the game language.

Run `node tools/export_data.js` before the page generator. It exports all
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
