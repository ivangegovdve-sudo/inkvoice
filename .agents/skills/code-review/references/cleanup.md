Applies when: always.

# Cleanup

Look for cost introduced by the change:

- logic duplicated from an existing helper, hook, service, or design-system
  primitive;
- redundant or derivable state;
- dead branches, obsolete compatibility code, stale comments, and abandoned
  files;
- repeated I/O, serial independent awaits, unbounded batches, or expensive
  work added to startup and playback hot paths;
- a special case layered onto shared infrastructure when one deeper rule
  would cover both paths;
- thin abstractions, pass-through helpers, or generic buckets that add
  indirection without reducing concepts.

Do not report micro-optimizations or file length by itself. Name the existing
thing to reuse or the simpler target shape.
