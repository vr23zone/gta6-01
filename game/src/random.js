// A small seeded random source (mulberry32): the same seed always grows the same city,
// the same traffic and the same screenshot scenes, which is what makes ?seed= and ?shot= honest.

/** Create a generator from a 32-bit seed; every method advances the one stream. */
export function createRandom(seed) {
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    /** Float in [min, max). */
    range(min, max) { return min + next() * (max - min); },
    /** Integer in [min, max]. */
    int(min, max) { return min + Math.floor(next() * (max - min + 1)); },
    /** One element of the array. */
    pick(items) { return items[Math.floor(next() * items.length)]; },
    /** True with the given probability. */
    chance(p) { return next() < p; },
  };
}
