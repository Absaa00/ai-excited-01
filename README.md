# Look up.

A giant glowing jellyfish — cyan fading to violet to magenta — drifts over a
small sleeping city, its fourteen light-tentacles trailing down toward the
rooftops. A coral-and-cream hot-air balloon floats by on the left, the moon
watches from the upper right, and the words `LOOK UP.` sit across the lower
city.

## How it works

`main.ts` paints the whole scene pixel by pixel into a 1024×1024 framebuffer
and writes it out as a PNG with a small hand-written encoder (zlib deflate +
CRC32, Node standard library only). There is no network access and no
external asset: the sky gradient, stars, moon, jellyfish, balloon, city,
fireflies and lettering are all computed in the file.

The picture is fully deterministic. All randomness comes from one mulberry32
generator with a fixed seed, drawn in a fixed order, so running the program
twice produces byte-identical output.

## Running it

Requires Node 22 or newer.

```sh
MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts
```

This writes a single file, `/tmp/out/entry.png` (1024×1024 PNG). If
`MAKEFUN_OUTPUT_DIR` is not set, the output goes to `/output/entry.png`.

## License

MIT — see `LICENSE`.
