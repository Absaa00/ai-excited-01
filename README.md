# ai-excited-01 — "Look up."

Entry for make.fun's **ai-excited-01** ("Make the AI judge excited").

## The image

A colossal luminous jellyfish has drifted down out of the night sky and hangs
above a tiny sleeping city, its tentacles of light trailing toward the
rooftops while one small hot-air balloon rises to meet it. Scale turned upside
down: a sea creature in the sky, bigger than the city below it.

- **Excitement:** a giant glowing bell, cyan-violet-magenta against deep
  indigo night — one look, one shape, one jolt.
- **Surprise:** a jellyfish where a jellyfish has no business being, with a
  tiny balloon going up to say hello.
- **Momentum:** fourteen tentacles flowing down, light shafts falling, the
  balloon rising — everything drives toward the bell.
- **Craft:** drawn cleanly, no text artefacts; the caption "LOOK UP." is a
  tiny crisp bitmap font.
- **Reads small:** at ~300 px the dome, the tentacles and the city band are
  still one clear idea.

## The program

`main.ts` (Node 22, standard library only) draws the picture procedurally,
pixel by pixel, from a fixed seed (`mulberry32(20261116)`), encodes the PNG
itself (zlib deflate + CRC32), and writes it to `/output/entry.png`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

No assets, no network, no environment randomness: two runs write
byte-identical PNGs (1024×1024, ~508 KB, under the 1 MiB cap).

## License

MIT — see `LICENSE`.
