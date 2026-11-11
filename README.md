# RED DOT

A tense, ~10-minute brinkmanship game. You are Singapore's Prime Minister (2027–2031). Eight neighbours,
two great powers, twenty quarters. Keep Stability, Deterrence, Hub and Resilience above zero and don't blink.

Inspired by the structure of *Conflict: Middle East Political Simulator* (1990): a monthly/quarterly turn,
reactive neighbours with hidden intentions, and a few competing budgets, rebuilt for a modern, stylised setting.

## Play locally

ES modules need a web server (opening `index.html` by double-click will not work):

```bash
python3 -m http.server 8080      # then open http://localhost:8080
```

## Deploy on GitHub Pages

1. Create a repo and push this folder's contents to the root of `main`.
2. Repo **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/ (root)`**.
3. Open `https://<you>.github.io/<repo>/`. All paths are relative, so sub-path hosting works.
4. On iPhone: Share → **Add to Home Screen** for a full-screen app with an icon.

`sw.js` is network-first, so new pushes show up on the next load while the game still opens offline.

## Layout

| File | Purpose |
| --- | --- |
| `js/data.js` | Nations (incl. military strength), great powers, player actions, crisis templates. **Most balancing/content edits go here.** |
| `js/forces.js` | Order of battle: named equipment, suppliers, costs, upkeep, supplier politics, Deterrence formula. **Add or retune equipment here.** |
| `js/engine.js` | Pure game logic (turn loop, crises, procurement, wars, scoring). No DOM. |
| `js/main.js` | UI: radar map, HUD, action panel, crisis sheets, hold-to-commit, audio/haptics. |
| `css/style.css` | Responsive layout: stacked on phones, two-pane when width ≥ 640px (unfolded foldables, landscape, desktop). |
| `tests/sim.mjs` | Balance harness: `node tests/sim.mjs 400` plays seeded games with idle / random / smart bots. |

## Forces and war

- **Deterrence is derived from your forces** (Land, Air, Sea power) minus a regional arms race that creeps up every turn, plus short-lived posture from drills and events. Stand still and it erodes.
- **Procurement** (Forces tab): ~30 named formations from the US, Germany, France, Sweden, Israel, South Korea, Italy, Singapore itself, China and Russia. Max 2 orders per turn, delivered after 2–3 turns, each adds upkeep to your budget.
- **Tiers:** better kit needs earlier purchases from the same supplier (and Washington/Beijing trust for US/China tier 2–3), like Conflict's arms vendors. Buying from a supplier also moves trust: US ↔ China pull against each other, Russia costs you Washington's trust, Israel strains ties with Malaysia and Indonesia.
- **Wars** start from a failed or ignored ultimatum, an armed option in a crisis (water, standoff), a neighbour attacking at extreme tension, a second-time supply collapse, or **Go to War** in the Defence tab. Each round you pick Air, Sea, Land, Precision Strikes or Ceasefire. Odds come from the force balance, air superiority helps the other arms, and you lose equipment. Win, force a favourable ceasefire, or go down.
- Resilience hitting zero no longer ends the game outright: the first two times it triggers a supply war (you start behind). The third time is fatal.

## Balance snapshot (500 seeds)

Idle bot 0% wins, random bot ~17%, a competent heuristic bot ~65% (about half a war per game). Tune in `data.js` / `forces.js` / `engine.js` and re-run `node tests/sim.mjs 500`.

## Adding a crisis

Add an entry to `CRISES` in `js/data.js`: `nations` (who can trigger it), `timer`, `text`, `erupt` (penalty if ignored)
and `options`. An option is either a safe `fx`, a gamble (`brink: true` with `win`/`lose`), or a `free` "ride it out".
Opportunities set `opp: true`. The UI picks everything up automatically.

## Notes

- Haptics: Android uses the Vibration API; iOS Safari has none, so the game uses the switch-checkbox trick (iOS 17.4+, best effort).
- Daily Seed mode seeds from the UTC date so everyone gets the same term that day.
- Best score is stored in `localStorage`.
- Nations are stylised as interests and incentives, not a political study.
