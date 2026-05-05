# TISC — Toy Instruction Set Computer

An interactive CPU simulator that teaches how processors work from first principles.

Built as a web app — no dependencies, no build step. Just open `index.html` in a browser.

## What You'll Learn

Each iteration introduces one major CPU concept:

| Iteration | Concept | Status |
|-----------|---------|--------|
| 1 | **Fetch–Decode–Execute cycle**, registers, basic instructions | ✅ Done |
| 2 | **ALU operations** & flags register (Z, N, C) | ✅ Done |
| 3 | **RAM** (load/store) | ✅ Done |
| 4 | **Branching** & loops (JMP, JZ, JNZ, JN, CMP) | ✅ Done |
| 5 | **Per-phase stepping** (Fetch → Decode → Execute as separate steps) | ✅ Done |
| 6 | Stack & subroutines | 🔜 Next |
| 7 | I/O & interrupts | ⬜ |
| 8 | **Pipelining** (overlap phases across instructions) | ⬜ |

## Running

```bash
# Option 1: Just open the file
start index.html

# Option 2: Use a local server
npx serve
```

## Files

- `cpu.js` — The CPU engine (fetch/decode/execute logic)
- `app.js` — UI controller (connects the engine to the DOM)
- `index.html` — Page structure
- `style.css` — Visual design
