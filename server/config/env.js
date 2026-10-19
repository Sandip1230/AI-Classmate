const DEFAULT_PORT = 5000;

export function getServerConfig(env = process.env) {
  const port = env.PORT === undefined ? DEFAULT_PORT : Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  if (!env.MONGO_URI?.trim()) {
    throw new Error("MONGO_URI is required.");
  }
  if (!env.GEMINI_API_KEY?.trim()) {
    throw new Error("GEMINI_API_KEY is required.");
  }

  const trustProxy = env.TRUST_PROXY ?? "0";
  if (!/^(0|[1-9]\d*|loopback|linklocal|uniquelocal)$/.test(trustProxy)) {
    throw new Error(
      "TRUST_PROXY must be 0, a trusted proxy hop count, loopback, linklocal, or uniquelocal."
    );
  }
  const trustProxyHopCount = /^\d+$/.test(trustProxy) ? Number(trustProxy) : null;
  if (trustProxyHopCount !== null && !Number.isSafeInteger(trustProxyHopCount)) {
    throw new Error("TRUST_PROXY hop count must be a safe integer.");
  }

  const clientOrigins = (env.CLIENT_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const origin of clientOrigins) {
    let parsedOrigin;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      throw new Error(`CLIENT_ORIGINS contains an invalid origin: ${origin}`);
    }
    if (parsedOrigin.origin !== origin || !["http:", "https:"].includes(parsedOrigin.protocol)) {
      throw new Error(`CLIENT_ORIGINS entries must be plain HTTP(S) origins: ${origin}`);
    }
  }

  return {
    port,
    mongoUri: env.MONGO_URI.trim(),
    geminiApiKey: env.GEMINI_API_KEY.trim(),
    geminiModel: env.GEMINI_MODEL?.trim() || "gemini-3.8-flash",
    nodeEnv: env.NODE_ENV || "development",
    trustProxy: trustProxyHopCount ?? trustProxy,
    clientOrigins
  };
}
