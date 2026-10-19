import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

process.env.GEMINI_API_KEY ||= "test-only-api-key";

const { createApp } = await import("../app.js");

async function withServer(callback) {
  const server = createApp({
    clientOrigins: ["https://classmate.example.com"],
    trustProxy: 0
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();

  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("serves a safe readiness response and security headers", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(body.status, "unavailable");
    assert.equal(body.database, "disconnected");
    assert.equal(response.headers.get("x-powered-by"), null);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(Object.hasOwn(body, "uri"), false);
  });
});

test("allows only configured browser origins", async () => {
  await withServer(async (baseUrl) => {
    const allowed = await fetch(`${baseUrl}/api/session/init`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://classmate.example.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type"
      }
    });
    const denied = await fetch(`${baseUrl}/api/session/init`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://unexpected.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type"
      }
    });

    assert.equal(
      allowed.headers.get("access-control-allow-origin"),
      "https://classmate.example.com"
    );
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
  });
});

test("validates API input and returns JSON for unknown routes", async () => {
  await withServer(async (baseUrl) => {
    const missingBody = await fetch(`${baseUrl}/api/session/init`, {
      method: "POST"
    });
    const invalidSession = await fetch(`${baseUrl}/api/session/not-an-id/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Hello" })
    });
    const invalidGender = await fetch(`${baseUrl}/api/session/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerName: "Alex",
        playerGender: "unknown",
        friendName: "Isha",
        friendGender: "girl"
      })
    });
    const oversizedName = await fetch(`${baseUrl}/api/session/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerName: "A".repeat(41),
        playerGender: "male",
        friendName: "Isha",
        friendGender: "girl"
      })
    });
    const unknown = await fetch(`${baseUrl}/api/unknown`);
    const unknownBody = await unknown.json();

    assert.equal(missingBody.status, 400);
    assert.equal(invalidSession.status, 400);
    assert.equal(invalidGender.status, 400);
    assert.equal(oversizedName.status, 400);
    assert.equal(unknown.status, 404);
    assert.deepEqual(unknownBody, { error: "Not found." });
  });
});

test("returns client errors for malformed and oversized JSON", async () => {
  await withServer(async (baseUrl) => {
    const malformed = await fetch(`${baseUrl}/api/session/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{"
    });
    const oversized = await fetch(`${baseUrl}/api/session/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: "x".repeat(40_000) })
    });

    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), {
      error: "Request body must contain valid JSON."
    });
    assert.equal(oversized.status, 413);
    assert.deepEqual(await oversized.json(), {
      error: "Request body is too large."
    });
  });
});
