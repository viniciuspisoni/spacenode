# SpaceNode — Known Bugs & Open Issues

## Open ❌

### Output Quality — AI generates visually unchanged images
**Symptom**: Generated image has a different URL (confirmed via log: `same as input? false`) but is visually near-identical to the input or lacks photorealism.

**Test input**: SketchUp render of commercial façade (black panel, logo, side vegetation).

**What was tried**:

| Attempt | Result |
|---|---|
| `guidance_scale: 7.5` (SDXL range) | Worse — incorrect for Flux |
| `guidance_scale: 3.5` (Flux correct) | No visible improvement |
| `num_inference_steps: 28 → 40` | No perceptible difference |
| Prompt in Portuguese | Bad — Flux is English-trained |
| Prompt in English | Improved structure but not realism |
| Quality suffix with technical terms | No significant visual impact |
| `strength: 0.02` (geometry lock 98%) | 422 ValidationError |
| `strength: 0.6` (geometry lock 40%) | Image changes but not realistic |
| Flux Krea image-to-image | Similar quality to Dev |

**Root cause hypothesis**: `fal-ai/flux/dev/image-to-image` is a generalist model — not fine-tuned for 3D-to-photo architectural transformation. It preserves the input's aesthetic signature instead of replacing it.

**Next steps to try**:
1. ControlNet Canny/Depth — preserves geometry, forces photorealistic style over 3D lines
2. Architecture-specialized models on Fal.ai or Replicate (fine-tuned on architectural datasets)
3. Two-stage pipeline: extract Canny edges from SketchUp → txt2img from edges
4. Replicate models: `archilabs/archimind` or similar
5. `strength: 0.85–0.95` with geometry lock 5–15%
6. Fixed `seed` for reproducible A/B comparisons

---

## Fixed ✅

- `strength: 0.02` → 422 ValidationError from Fal.ai — minimum strength enforced in UI
- Preview width not filling full window — fixed with `width: 100%` on root grid
- Dark mode hydration mismatch (SSR) — fixed to only activate on explicit user choice
- Render model mapping incorrect — fixed field mapping in route handler
