# AI-Classmate

AI-Classmate is an AI-powered fictional roleplay app. The React/Vite client
connects to an Express API, MongoDB stores story sessions, and Google Gemini
generates replies.

## Requirements

- Node.js 20+
- MongoDB
- A Google Gemini API key

## Setup

1. Copy `server/.env.example` to `server/.env` and set `MONGO_URI` and
   `GEMINI_API_KEY`.
2. Install and start the API:

   ```sh
   cd server
   npm install
   npm run dev
   ```

3. In another terminal, install and start the client:

   ```sh
   cd client
   npm install
   npm run dev
   ```

The client runs at `http://localhost:5173` and the API at
`http://localhost:5000`. The Vite development server proxies `/api` to the API.

## Production deployment

Deploy the client as a static site and the API as a Node.js 20+ web service.
MongoDB must be reachable by the API (for example, a managed MongoDB deployment).
Build the client with `npm ci && npm run build` from `client`, and publish
`client/dist`. Run `npm ci && npm start` from `server`.

Configure these server environment variables in the hosting provider; never
commit real credentials:

- `NODE_ENV=production`
- `PORT` (provided by most hosting services)
- `MONGO_URI` (MongoDB connection URI; restrict database network access)
- `GEMINI_API_KEY` (server-side Google AI Studio key)
- `GEMINI_MODEL` (optional; defaults to `gemini-3.8-flash`)
- `CLIENT_ORIGINS` (comma-separated exact origins, e.g. `https://classmate.example.com`; do not include paths or trailing slashes)
- `TRUST_PROXY` (default `0`; set to the exact trusted proxy hop count only when the host sits behind a proxy)

If the client and API use different domains, set
`VITE_API_BASE_URL=https://api.example.com/api/session` in the client build
environment. For a same-origin reverse-proxy deployment, leave it unset so the
client uses `/api/session`; route `/api` to the Node service. The API CORS
allow-list is controlled by `CLIENT_ORIGINS`.

`GET /api/health` is a readiness check and returns HTTP 503 until MongoDB is
connected. The API also applies request limits, security headers, payload
validation, and per-IP rate limits. Configure the host's own rate limiting and
monitoring as well; the built-in limiter is per API process. MongoDB session
IDs currently act as bearer capabilities: anyone who obtains an ID can access
that session. This app does not provide user accounts or identity-based access
control, so do not store sensitive conversations or expose session IDs in logs
or publicly shared URLs. Add authentication before using it for private data.

## Validation

Run `npm test` from `server`, then `npm run build` from `client`.

The scene artwork is served from `client/public/isha-scene.jpg`.