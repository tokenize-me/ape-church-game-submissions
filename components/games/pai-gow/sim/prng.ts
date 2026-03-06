// Vendored from: C:\Users\echom\clawd\apechurch\ape-gow\sim\src\prng.ts

// Deterministic PRNG: xorshift32. Good for *simulation determinism*.
// For production/on-chain, randomness must come from VRF or commit-reveal; this
// is just the reproducible engine.

export function xorshift32(seed: number): () => number {
  let x = seed | 0;
  return () => {
    // xorshift32
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    // convert to [0,1)
    return ((x >>> 0) / 0x1_0000_0000);
  };
}

export function hashSeedToU32(seed: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
