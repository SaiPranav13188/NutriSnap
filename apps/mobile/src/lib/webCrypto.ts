import * as ExpoCrypto from 'expo-crypto';

/**
 * A `crypto.subtle` shim for React Native, backed by the platform's native
 * crypto through expo-crypto.
 *
 * Hermes ships no WebCrypto, so `crypto.subtle` is undefined on device.
 * Supabase's auth client checks for it and, when it is missing, quietly
 * downgrades PKCE to the `plain` challenge method — it sends the code
 * verifier itself to the provider instead of its SHA-256 hash. That is what
 * the "WebCrypto API is not supported. Code challenge method will default to
 * use plain instead of sha256." warning is reporting. A `plain` challenge is
 * readable by anything that can see the authorize URL, which defeats the
 * point of PKCE on a device that cannot keep a secret.
 *
 * Only digests are implemented, because that is all the auth flow needs.
 * This module must be imported before the Supabase client is created.
 */

/** WebCrypto names, which differ from expo-crypto's enum. */
const ALGORITHMS: Record<string, ExpoCrypto.CryptoDigestAlgorithm> = {
  'SHA-1': ExpoCrypto.CryptoDigestAlgorithm.SHA1,
  'SHA-256': ExpoCrypto.CryptoDigestAlgorithm.SHA256,
  'SHA-384': ExpoCrypto.CryptoDigestAlgorithm.SHA384,
  'SHA-512': ExpoCrypto.CryptoDigestAlgorithm.SHA512,
};

async function digest(
  algorithm: AlgorithmIdentifier,
  data: BufferSource,
): Promise<ArrayBuffer> {
  const name = (typeof algorithm === 'string' ? algorithm : algorithm.name).toUpperCase();
  const mapped = ALGORITHMS[name];
  if (!mapped) {
    throw new Error(`crypto.subtle.digest: unsupported algorithm "${name}".`);
  }
  return ExpoCrypto.digest(mapped, data);
}

const existing = (globalThis as { crypto?: Crypto }).crypto;

if (!existing?.subtle) {
  // Keep whatever the runtime already provides and add only what is absent.
  // Defining the whole `crypto` global at once avoids having to write onto an
  // object the engine may have frozen.
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    writable: true,
    value: {
      getRandomValues:
        existing?.getRandomValues?.bind(existing) ?? ExpoCrypto.getRandomValues,
      randomUUID: existing?.randomUUID?.bind(existing) ?? ExpoCrypto.randomUUID,
      subtle: { digest },
    },
  });
}
