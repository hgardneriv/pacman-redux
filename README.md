# PACMAN REDUX

An original-code homage to the 1980 arcade classic. All graphics are drawn with
canvas primitives and all audio is synthesized live with the Web Audio API —
no original art, sprites, or music are used.

## Play

- **Desktop:** Arrow keys or WASD to move · `P` pause · `M` mute · `Enter` start
- **Mobile:** On-screen joystick widget (bottom-left) or swipe anywhere on the maze

## Faithful arcade mechanics

- The classic 28×31 maze layout with 240 dots + 4 energizers and the side tunnel
- Authentic ghost AI personalities:
  - **Blinky** (red) — chases your tile directly, becomes "Cruise Elroy" as dots run out
  - **Pinky** (pink) — ambushes 4 tiles ahead of you (including the famous up-direction quirk)
  - **Inky** (cyan) — flanks using a vector doubled from Blinky's position
  - **Clyde** (orange) — chases until he gets within 8 tiles, then shies away
- Scatter/chase wave scheduling with per-level timings, and ghost reversal on mode change
- Per-level speed tables (Pac-Man, ghosts, tunnel slowdown, frightened speeds) with a
  gentler-than-arcade early ramp — ghosts start slow and reach authentic arcade speeds by level 7
- Frightened time and flash counts that shrink each level (gone by level 17+)
- Ghost-house dot counters, post-death global counter, and starvation-timeout release
- Fruit at 70 and 170 dots: cherry → strawberry → orange → apple → melon → rocket → bell → key
- Ghost combo scoring 200/400/800/1600, extra life at 10,000, persistent high score

## Run locally

Any static file server works:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy

Static site — deploys to Vercel with zero configuration (`vercel.json` included).

## Files

- `index.html` — page shell, CRT scanline overlay, joystick styling
- `game.js` — the entire game (maze, AI, renderer, synth audio, input)
