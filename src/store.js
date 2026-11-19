// Persistance de l'état du jeu.
// - Avec REDIS_URL (add-on Redis de Clever Cloud) : sauvegarde dans Redis.
// - Sans : état en mémoire uniquement (pratique en local).
import Redis from 'ioredis';

const KEY = process.env.STATE_KEY || 'brique-a-brique:state:v1';

function redisUrlFromEnv() {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  if (process.env.REDIS_HOST) {
    const pwd = process.env.REDIS_PASSWORD ? `:${encodeURIComponent(process.env.REDIS_PASSWORD)}@` : '';
    return `redis://${pwd}${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`;
  }
  // Materia KV (compatible protocole Redis, en TLS)
  if (process.env.KV_HOST && process.env.KV_TOKEN) {
    return `rediss://default:${encodeURIComponent(process.env.KV_TOKEN)}@${process.env.KV_HOST}:${process.env.KV_PORT || 6379}`;
  }
  return null;
}

export async function createStore() {
  const url = redisUrlFromEnv();
  if (!url) {
    console.log('[store] Aucun Redis configuré : état conservé en mémoire seulement.');
    return { kind: 'memory', load: async () => null, save: async () => {}, close: async () => {} };
  }

  const client = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
  client.on('error', (err) => console.error('[store] Erreur Redis :', err.message));
  try {
    await client.connect();
    console.log('[store] Connecté à Redis.');
  } catch (err) {
    console.error('[store] Connexion Redis impossible, repli en mémoire :', err.message);
    return { kind: 'memory', load: async () => null, save: async () => {}, close: async () => {} };
  }

  return {
    kind: 'redis',
    async load(key = KEY) {
      const raw = await client.get(key);
      return raw ? JSON.parse(raw) : null;
    },
    async save(state, key = KEY) {
      await client.set(key, JSON.stringify(state));
    },
    async close() {
      await client.quit().catch(() => {});
    },
  };
}
