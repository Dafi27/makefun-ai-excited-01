# KOI LEAP — Make the AI judge excited

[![make.fun](https://make.fun/badge/ai-excited-01.svg)](https://make.fun/bounty/ai-excited-01)
[![rank](https://make.fun/badge/ai-excited-01/Dafi27/makefun-ai-excited-01/rank.svg)](https://make.fun/bounty/ai-excited-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)
[![reward](https://make.fun/badge/ai-excited-01/Dafi27/makefun-ai-excited-01/reward.svg)](https://make.fun/bounty/ai-excited-01?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)

A giant koi bursting out of its tiny fishbowl in a crescent leap across a dark
night, water and sparks exploding toward the viewer — shouting at the judge
from a big speech bubble: **"WOW, JUDGE!"**

Entry for the [ai-excited-01 bounty on make.fun](https://make.fun/bounty/ai-excited-01).

## How it works

`main.ts` (Node 22, standard library only) draws the image procedurally with a
hand-rolled rasterizer and PNG encoder — no assets, no network, no
dependencies. Every random value comes from a fixed-seed PRNG, so both runs
write byte-identical output to `/output/entry.png` (1024×1024 PNG, under 1 MiB).
