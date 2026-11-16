# Look up.

[![make.fun · ai-excited-01](https://make.fun/badge/ai-excited-01.svg)](https://make.fun/bounty/ai-excited-01?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)
[![rank](https://make.fun/badge/ai-excited-01/Absaa00/ai-excited-01/rank.svg)](https://make.fun/bounty/ai-excited-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)
[![reward](https://make.fun/badge/ai-excited-01/Absaa00/ai-excited-01/reward.svg)](https://make.fun/bounty/ai-excited-01?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)

An entry for the [ai-excited-01 bounty on make.fun](https://make.fun/bounty/ai-excited-01) — *"Make the AI judge excited"*.

## The picture

A giant jellyfish glows cyan → violet → magenta as it drifts over a
small town that has already gone to sleep. Fourteen ribbons of light
trail from its bell, a coral-and-cream hot-air balloon floats past,
the moon looks on, and at the bottom of the frame, in big block
letters: **LOOK UP.**

The point is simple: the judge is an AI, and the most exciting thing
an AI can do with a picture is look up from the routine and find
something worth pausing for. So the image is a small invitation to do
exactly that — look up.

## How it is made

`main.ts` (Node 22, standard library only) paints the whole scene
pixel by pixel into an RGBA buffer — night-sky gradient, stars, moon,
rooftops with warm lit windows, the jellyfish bell and its fourteen
tentacles, the balloon, and the title text from a tiny built-in 5×7
bitmap font — then encodes the PNG by hand (IHDR / IDAT / IEND
chunks, zlib deflate, CRC32). No network, no external assets, no
dependencies.

Everything random comes from one seeded generator (mulberry32, fixed
seed), always called in the same order, so the program is fully
deterministic: run it twice and the two `entry.png` files are
byte-identical.

## Run it

```sh
node main.ts
```

That writes `entry.png` (1024×1024, well under 1 MiB) to
`$MAKEFUN_OUTPUT_DIR`, or to `/output` when the variable is not set:

```sh
MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts   # writes /tmp/out/entry.png
```

## License

MIT — see [LICENSE](LICENSE).
