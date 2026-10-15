Read ../meta/AGENTS.md and ../meta/README.md before starting work.
Resolve these paths relative to this file.

# PokéSurvivor

- This game uses vanilla JavaScript and Canvas 2D. No framework is required.
- Read `CLAUDE.md` for the existing build and release rules.
- Edit `dev.html`. Generate `index.html` and `js/app.min.js` with `node tools/build.js`.
- Run `node --test tests/*.test.js` for localization regressions.
- For browser checks, run `python3 -m http.server 8765 --bind 127.0.0.1` and open `dev.html` or `index.html`.
- Use guest mode for local browser checks. Do not change live accounts or rankings.
- Keep Spanish source strings as translation keys. See `docs/LOCALIZATION.md` for Chinese terminology and data generation.
- Store temporary files in `work_tmp/` and browser screenshots in `output/playwright/`.
- Build all generated pages before delivery: `node tools/build.js`, `node tools/export_data.js`, then `python3 tools/make_seo_pages.py`.
- Commit, push, and deploy only when requested.
