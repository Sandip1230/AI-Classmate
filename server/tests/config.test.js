import assert from "node:assert/strict";
import test from "node:test";
import { getServerConfig } from "../config/env.js";

const validEnv = {
  MONGO_URI: "mongodb://localhost:27017/ai-classmate",
  GEMINI_API_KEY: "test-api-key",
  CLIENT_ORIGINS: "https://classmate.example.com, http://localhost:5173"
};

test("loads deployment configuration and defaults", () => {
  const config = getServerConfig(validEnv);

  assert.equal(config.port, 5000);
  assert.equal(config.nodeEnv, "development");
  assert.equal(config.trustProxy, 0);
  assert.equal(config.geminiModel, "gemini-3.8-flash");
  assert.deepEqual(config.clientOrigins, [
    "https://classmate.example.com",
    "http://localhost:5173"
  ]);
});

test("rejects missing secrets and invalid ports", () => {
  assert.throws(
    () => getServerConfig({ ...validEnv, MONGO_URI: " " }),
    /MONGO_URI is required/
  );
  assert.throws(
    () => getServerConfig({ ...validEnv, GEMINI_API_KEY: "" }),
    /GEMINI_API_KEY is required/
  );
  assert.throws(
    () => getServerConfig({ ...validEnv, PORT: "70000" }),
    /PORT must be an integer/
  );
});

test("rejects untrusted proxy settings and non-origin CORS URLs", () => {
  assert.throws(
    () => getServerConfig({ ...validEnv, TRUST_PROXY: "true" }),
    /TRUST_PROXY must be/
  );
  assert.throws(
    () => getServerConfig({ ...validEnv, CLIENT_ORIGINS: "https://example.com/app" }),
    /plain HTTP\(S\) origins/
  );
  assert.throws(
    () => getServerConfig({ ...validEnv, TRUST_PROXY: "999999999999999999999999" }),
    /safe integer/
  );
});
