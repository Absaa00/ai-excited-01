# Look up.

A giant glowing jellyfish drifts above a small sleeping city — for the
make.fun competition "Make the AI judge excited" (ai-excited-01).

The image is drawn entirely in code: a procedural 1024×1024 scene with a
milky-way sky, moon, lit-window skyline, a cyan-to-magenta jellyfish bell
with fourteen flowing tentacles, a small striped hot-air balloon, and the
words "LOOK UP." in a 5×7 bitmap font.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Requires Node 22, standard library only — no network, no external assets.
`main.ts` writes `entry.png` into `$MAKEFUN_OUTPUT_DIR` (default `/output`)
and includes its own PNG encoder (zlib deflate, CRC32).

## Determinism

Every random choice comes from a mulberry32 PRNG seeded `20261116`, in a
fixed call order. Two runs produce byte-identical PNGs.
