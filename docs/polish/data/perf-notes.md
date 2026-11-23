## Notes

- **WebGL resources.** The scene exposes no renderer statistics at baseline, so geometry/texture counts could not be sampled during the memory run; the undisposed-texture and rebuild findings in AUDIT.md come from code review. Phase 3 adds a read-only counter to `window.__stellarUniverse` and the after-run records it.
- **SPEC §12 targets vs baseline.** First contentful paint is about 0.78 s under Lighthouse's slow-4G profile, but LCP waits for data-bound content (up to 7.5 s) and the main thread is blocked for 0.8–2.1 s during start-up. Those are the numbers Phase 3 §4.5/§4.6 has to move.
