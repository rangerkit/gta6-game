# Palm Vice

[![Competition](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/rangerkit/gta6-game/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/rangerkit/gta6-game/reward.svg)](https://make.fun/bounty/gta6-01)

Entry for https://make.fun/bounty/gta6-01 — see that page for the live ranking.

**Palm Vice** is an original open-world crime game that runs entirely from the static
files in `game/` — no build step, no libraries, no network requests, fully offline in a
desktop browser. Every name, character, place, line of story, piece of art and note of
music is our own; nothing is taken from any existing game.

You are **Jett Marlowe**, a wheelman who just hit the coastal city of Palm Vice with
twelve dollars and a borrowed name. Fixer **Marisol Vega** runs jobs out of the Coral
Diner, and rival operator **Vince Corso** would like the city — and Marisol's corner of
it — for himself. Work the story, build a roll, and stay ahead of the PVPD.

## The city

A seeded, tile-built coastal city, explorable end to end on foot and by car: eight
avenues by six streets of pastel blocks and labeled landmarks — the Coral Diner,
Palmetto Bank, the Vice Armory, PVPD headquarters, St. Coral Hospital, the Seabreeze
Hotel, Marisol's Garage, your hideout — plus parks, parking lots, a beach promenade,
a marina pier and the bay. Palm trees, street lamps that pool light after dark, and a
full day cycle from bright noon to a lamplit night.

## What you can do

- **Drive anything.** Six car types (sedan, coupe, wagon, van, taxi, patrol) with real
  driving physics — acceleration, braking, reverse, handbrake slides, crash damage.
  Walk up to any car and press F to steal it; traffic brakes, swerves and honks around
  you, and parked cars wait in lots all over the city.
- **Live streets.** Lane-following traffic with junction routing, pedestrians who
  stroll, chat on phones, flee danger, drop cash when knocked down, and witness crimes.
- **A wanted level that answers back.** Crimes witnessed by pedestrians or officers
  raise your heat across five stars: patrol cars spawn to match, pursue with lead-the-
  target steering and ramming, officers get out and give chase on foot, and at three
  stars and up they shoot. Break line of sight and stay clean to cool down — or get
  boxed in and busted, or shot down and wasted, and pay the fine.
- **A six-mission story.** *First Wheels*, *Dinner Rush*, *Coast Run* (a checkpoint
  race down the coast road), *Heat Sink* (shake a three-star tail), *The Palmetto
  Score* (hold the bank plaza, then run) and *Last Ferry* — with dialogue, objectives,
  timers, hold-outs, pursuits and cash rewards, plus a pistol unlock after the first job.
- **Side work between jobs.** Taxi fares and timed courier runs are offered as you roam.
- **Combat.** Fists or the pistol, mouse-aimed, with tracers, impact particles, screen
  shake and knockdowns.
- **Progression and saves.** Money, story progress, health and position persist in
  `localStorage`; continue from the title screen, or save from the pause menu.
- **Sound, synthesized live.** WebAudio engine and siren loops, gunshots, crashes,
  pickups, UI cues and a synthwave groove — no audio files.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Walk · drive · steer |
| Shift | Sprint on foot · handbrake in a car |
| F / Enter | Interact: talk, enter/exit a car, heal, start a job |
| Mouse | Aim |
| Click / Space | Punch or shoot |
| Esc / P | Pause (S saves, H shows help, Q quits to title) |

## Screenshots

1. `1-start.jpg` — the title screen over a living street.
2. `2-play.jpg` — on foot downtown, first job on the books.
3. `3-drive.jpg` — down the coast road past the Seabreeze Hotel.
4. `4-chase.jpg` — three stars: the PVPD in pursuit.

The scenes are staged deterministically by the game itself: open
`game/index.html?shot=<start|foot|drive|chase>&seed=<n>` and an autopilot drives the
world to that moment, then sets `window.__shotReady`.

## Running it

```sh
node serve.ts          # serves game/ at http://localhost:8080
node main.ts           # the hand-in: copies game/ + screenshots/ to /output with dossier.json
```

## Layout

Plain ES modules under `game/src/`, one job each: `city` (the seeded map), `vehicles`
(driving and traffic), `pedestrians`, `police` (wanted level and pursuit), `missions`
(the story and side work), `combat`, `world` (the simulation step), `render` (the
canvas painter), `hud` (interface and screens), `audio` (synthesized sound), `save`,
`input`, `shots` (the staged screenshot scenes) and `main` (the loop). The vendored
`vendor/makefun-game.ts` dossier library is the competition kit's, untouched.
