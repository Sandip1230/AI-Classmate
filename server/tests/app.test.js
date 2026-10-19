import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

const { createApp } = await import("../app.js");
const { getAiProviderError, getUserApiKey } = await import("../routes/chatRoutes.js");
const { parseRoleplayResponse } = await import("../services/geminiService.js");

async function withServer(callback, appOptions = {}) {
  const server = createApp({
    clientOrigins: ["https://classmate.example.com"],
    trustProxy: 0,
    ...appOptions
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
    assert.equal(
      response.headers.get("cross-origin-opener-policy"),
      "same-origin-allow-popups"
    );
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
        "Access-Control-Request-Headers": "content-type,x-gemini-api-key"
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
    assert.match(
      allowed.headers.get("access-control-allow-headers"),
      /x-gemini-api-key/i
    );
    assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
  });
});

test("requires account authentication for private stories and reports sign-in configuration", async () => {
  await withServer(async (baseUrl) => {
    const anonymousAccount = await fetch(`${baseUrl}/api/auth/me`);
    const anonymousAccountBody = await anonymousAccount.json();
    const privateStories = await fetch(`${baseUrl}/api/session`);
    const deleteAccount = await fetch(`${baseUrl}/api/auth/account`, {
      method: "DELETE",
      headers: { Origin: "https://classmate.example.com" }
    });
    const createStory = await fetch(`${baseUrl}/api/session/init`, {
      method: "POST",
      headers: {
        Origin: "https://classmate.example.com",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ playerName: "Alex" })
    });
    const googleSignIn = await fetch(`${baseUrl}/api/auth/google`, {
      method: "POST",
      headers: {
        Origin: "https://classmate.example.com",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ credential: "test-token" })
    });
    const untrustedOrigin = await fetch(`${baseUrl}/api/session/init`, {
      method: "POST",
      headers: {
        Origin: "https://unexpected.example",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ playerName: "Alex" })
    });
    const config = await fetch(`${baseUrl}/api/auth/config`);
    const configBody = await config.json();
    const unknown = await fetch(`${baseUrl}/api/unknown`);
    const unknownBody = await unknown.json();

    assert.equal(anonymousAccount.status, 200);
    assert.deepEqual(anonymousAccountBody, { user: null });
    assert.equal(privateStories.status, 401);
    assert.equal(deleteAccount.status, 401);
    assert.match((await privateStories.json()).error, /Sign in with Google/);
    assert.equal(createStory.status, 401);
    assert.equal(googleSignIn.status, 503);
    assert.equal(untrustedOrigin.status, 403);
    assert.deepEqual(configBody, { googleClientId: null });
    assert.equal(unknown.status, 404);
    assert.deepEqual(unknownBody, { error: "Not found." });
  }, { googleClientId: "" });
});

test("verifies Google credentials against the configured OAuth client", async () => {
  let verifiedCredential;
  await withServer(
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/auth/google`, {
        method: "POST",
        headers: {
          Origin: "https://classmate.example.com",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ credential: "invalid-token" })
      });

      assert.equal(response.status, 401);
      assert.match((await response.json()).error, /could not be verified/);
      assert.deepEqual(verifiedCredential, {
        idToken: "invalid-token",
        audience: "web-client-id"
      });
    },
    {
      googleClientId: "web-client-id",
      googleClient: {
        async verifyIdToken(options) {
          verifiedCredential = options;
          throw new Error("invalid credential");
        }
      }
    }
  );
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

test("explains common Gemini API failures without exposing provider error details", () => {
  assert.match(
    getAiProviderError({ status: 400, message: "API key not valid" }).message,
    /key created in Google AI Studio/
  );
  assert.match(
    getAiProviderError({ status: 404, message: "not found" }).message,
    /GEMINI_MODEL/
  );
  assert.equal(
    getAiProviderError({ status: 429, message: "quota exceeded" }).status,
    429
  );
  assert.equal(
    getAiProviderError({ name: "APIConnectionError", message: "Connection error" }).status,
    503
  );
  assert.match(
    getAiProviderError({ name: "APIConnectionTimeoutError" }).message,
    /timed out/
  );
  assert.doesNotMatch(
    getAiProviderError({ status: 400, message: "API key secret-value" }).message,
    /secret-value/
  );
});

test("uses the server Gemini key when no browser override is sent", () => {
  const response = {
    statusCode: null,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
  const request = { get: () => undefined };

  assert.equal(getUserApiKey(request, response, "  server-key  "), "server-key");
  assert.equal(response.statusCode, null);
  assert.equal(
    getUserApiKey({ get: () => " browser-key " }, response, "server-key"),
    "browser-key"
  );
  assert.equal(getUserApiKey(request, response, ""), null);
  assert.equal(response.statusCode, 400);
  assert.match(response.body.error, /GEMINI_API_KEY/);
});

test("parses Gemini roleplay JSON with code fences and trailing commas", () => {
  const response = parseRoleplayResponse(
    '```json\n{"loveDelta":1,"reasonForDelta":"A clever reply","blocks":[{"type":"dialogue","speaker":"Isha","text":"Nice try."},],}\n```'
  );
  assert.equal(response.loveDelta, 1);
  assert.equal(response.blocks[0].text, "Nice try.");
  assert.throws(
    () => parseRoleplayResponse('{"loveDelta":1,"blocks":[{"type":"dialogue",'),
    SyntaxError
  );
  assert.throws(
    () => parseRoleplayResponse('{"loveDelta":"many","blocks":[]}'),
    /expected reply structure/
  );
});
