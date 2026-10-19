# AI-Classmate

AI-Classmate is a browser-based, AI-powered roleplay chat set at Xavier's
College. Players create a character, shape a story through conversations, and
can return to their saved stories by signing in with Google.

The project is a monorepo with a React/Vite frontend, an Express API, MongoDB
storage, Google Identity Services for account sign-in, and Google Gemini for
AI-generated story turns.

## Features

- Sign in with a verified Google account.
- Create, save, browse, and resume multiple stories from the same account.
- Keep each account's stories private from other signed-in accounts.
- Customize the player and AI character, add story characters, and track
  relationship scores.
- Send dialogue and actions, skip a turn, edit the latest player message, or
  regenerate the latest AI response.
- Supply a personal Google AI Studio Gemini API key when generating replies.
- Choose chat appearance, including the dark chat wallpaper.

## Project layout

```text
client/                 React application and Vite configuration
  public/               Static artwork and chat wallpaper
  src/                  UI and styles
server/                 Express API
  config/               Environment validation and MongoDB connection
  middleware/           Authentication middleware
  models/               MongoDB user, sign-in session, and story models
  routes/               Authentication and story API routes
  services/             Gemini roleplay generation
  tests/                Node.js test suite
```

## Requirements

- Node.js 20 or newer and npm.
- MongoDB, running locally or available through a MongoDB connection URI.
- A Google Cloud **Web application** OAuth client ID for Google sign-in.
- A Google AI Studio Gemini API key for generating story replies.

## Local setup

### 1. Configure Google sign-in

1. In the [Google Cloud Console](https://console.cloud.google.com/), create or
   select a project and configure the Google Auth Platform consent screen.
2. Create an OAuth client with application type **Web application**.
3. Add the exact frontend origin under **Authorized JavaScript origins**:
   `http://localhost:5173`.
4. If the consent screen is in testing mode, add the Google accounts that will
   sign in as test users.
5. Copy the OAuth **client ID**. This app verifies Google ID tokens on the
   server and does not require a Google OAuth client secret.

For a deployed site, add its exact HTTPS origin to the OAuth client's
**Authorized JavaScript origins** as well.

### 2. Configure and start the API

Copy `server/.env.example` to `server/.env`, then set the MongoDB URI and Google
OAuth client ID. For example:

```dotenv
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/xaviers_isha_rp
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GEMINI_MODEL=gemini-3.8-flash
CLIENT_ORIGINS=http://localhost:5173
TRUST_PROXY=0
```

Install dependencies and run the API from the repository root:

```sh
cd server
npm install
npm run dev
```

The API listens on `http://localhost:5000`. It connects to MongoDB before it
starts accepting requests.

### 3. Start the frontend

In a second terminal:

```sh
cd client
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` requests to
`http://localhost:5000` by default.

To use a different local API target, set `VITE_DEV_API_TARGET` in the client
environment, for example:

```dotenv
VITE_DEV_API_TARGET=http://localhost:5000
```

To connect a separately hosted frontend to an API, set the API base URL at
frontend build time:

```dotenv
VITE_API_BASE_URL=https://api.example.com/api/session
```

See [client/.env.example](./client/.env.example) for the optional frontend
settings.

### 4. Add a Gemini API key

After signing in and starting or opening a story, open **Chat options → Gemini
API key** and save a key from [Google AI Studio](https://aistudio.google.com/app/apikey).
The app requests a key before it generates a story reply. The key is held in
the current browser tab's `sessionStorage` and sent only with AI-generation
requests; it is not stored in MongoDB or by the API after the request finishes.

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | No | `development` | Runtime mode. Set to `production` when deployed. |
| `PORT` | No | `5000` | API listen port. |
| `MONGO_URI` | **Yes** | — | MongoDB connection URI. Restrict database access to the API host. |
| `GOOGLE_CLIENT_ID` | For sign-in | Empty | Google Cloud Web application OAuth client ID. |
| `GEMINI_MODEL` | No | `gemini-3.8-flash` | Gemini model used to generate story turns. |
| `CLIENT_ORIGINS` | For browser access | Empty | Comma-separated, exact frontend origins allowed by CORS and write-request checks. Do not include paths or trailing slashes. |
| `TRUST_PROXY` | No | `0` | Trusted proxy hop count or supported Express proxy setting. Set only for a known, trusted proxy configuration. |
| `VITE_API_BASE_URL` | No | `/api/session` | Full API session base URL embedded into the frontend build. |
| `VITE_DEV_API_TARGET` | No | `http://localhost:5000` | API target used by the Vite development proxy. |

The server validates its configuration at startup. Keep `server/.env` and all
deployment credentials out of version control.

## Accounts, stories, and data

- Google ID tokens are verified by the API against `GOOGLE_CLIENT_ID`. The app
  does not receive a Google password.
- The API issues a random, opaque sign-in cookie marked `HttpOnly`. It stores
  only a hash of that cookie in MongoDB. Sign-in lasts up to 30 days.
- Each new story is associated with the signed-in account. Story listing,
  loading, and updates are scoped to that account.
- The browser remembers the currently open story ID so it can restore that
  story after sign-in. The **Stories** button opens the account's saved-story
  list; selecting a story resumes it.
- Older guest stories can be claimed by the first account that resumes them
  from a browser that still has the story ID saved. Other guest stories are
  not automatically imported.
- Signing out expires the browser's sign-in cookie and clears that browser's
  active story ID and Gemini key. It does not delete stories from MongoDB.
- The app currently has no in-app story deletion or account deletion control;
  stored data remains until an operator removes it from MongoDB.

### Privacy notes

The story's player name, character choices, messages, AI responses, scores,
characters, and story summary are stored in MongoDB. For reply and summary
generation, relevant story context and the supplied Gemini API key are sent
from the API to Google Gemini. Gemini usage is charged according to the
Google AI Studio project associated with that key. The server can access the
key while processing an AI request, so deploy over HTTPS and use only a server
you trust.

Avoid entering real names or sensitive personal information into a roleplay.
The app's Terms of Use and Privacy Notice are available from the interface;
review and update those notices if you change the app's data practices.

## API overview

All routes are prefixed with `/api`.

### Authentication

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/auth/config` | Returns the configured Google client ID for the sign-in UI. |
| `POST` | `/api/auth/google` | Verifies a Google ID token and creates a sign-in session. |
| `GET` | `/api/auth/me` | Returns the currently signed-in account. |
| `POST` | `/api/auth/logout` | Revokes the current sign-in session and expires its cookie. |

### Stories

Story routes require a valid sign-in cookie.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/session` | Lists up to 100 most recently updated stories for the account. |
| `GET` | `/api/session/:id` | Loads one story owned by the account. |
| `POST` | `/api/session/init` | Creates a story or resumes the supplied story ID. |
| `POST` | `/api/session/:id/message` | Adds a player turn and generates an AI reply. |
| `PUT` | `/api/session/:id/edit-last` | Edits the most recent player turn and regenerates the reply. |
| `POST` | `/api/session/:id/regenerate` | Regenerates the most recent AI reply. |
| `POST` | `/api/session/:id/characters` | Adds a custom character to a story. |
| `GET` | `/api/health` | Reports API and MongoDB readiness. |

AI-generation routes require the `X-Gemini-Api-Key` request header. Browser
write requests must originate from an origin listed in `CLIENT_ORIGINS`.

## Production deployment

Deploy the frontend as a static site and the API as a Node.js 20+ web service.
Use a managed MongoDB deployment or another MongoDB instance reachable from the
API service.

1. Configure the API environment variables above, including `MONGO_URI`,
   `GOOGLE_CLIENT_ID`, and the production frontend origin in `CLIENT_ORIGINS`.
2. Add every production frontend origin to the Google OAuth client's
   **Authorized JavaScript origins**.
3. Set `NODE_ENV=production`. Configure `TRUST_PROXY` only when the API is
   behind a trusted proxy; use the exact number of trusted hops.
4. Build the frontend from `client` and publish `client/dist`:

   ```sh
   cd client
   npm ci
   npm run build
   ```

5. Install and start the API from `server`:

   ```sh
   cd server
   npm ci
   npm start
   ```

When the frontend and API are on different sites, configure
`VITE_API_BASE_URL` in the frontend build and set `CLIENT_ORIGINS` on the API.
Production sign-in cookies are `Secure` and use `SameSite=None`, so cross-site
deployments require HTTPS and a browser that permits the cookie. A same-site
deployment or a reverse proxy that serves `/api` under the frontend's origin
is generally more compatible with browser cookie restrictions.

`GET /api/health` returns HTTP 200 when MongoDB is connected and HTTP 503 when
it is not. The API also uses Helmet security headers, request-size limits,
input validation, CORS restrictions, and per-process rate limits. Configure
your hosting platform's monitoring and rate limiting as appropriate; the
built-in rate limits are not shared across multiple API instances.

## Development and tests

Run the API tests:

```sh
cd server
npm test
```

Build the frontend:

```sh
cd client
npm run build
```

The server uses Node's built-in test runner. The frontend currently has no
separate test script.

## Troubleshooting

- **Google sign-in is not configured:** Set `GOOGLE_CLIENT_ID` in
  `server/.env` and restart the API.
- **Google reports an origin or audience error:** Confirm that the exact
  frontend origin is listed in the OAuth client's Authorized JavaScript
  origins and that the server's `GOOGLE_CLIENT_ID` is for that OAuth client.
- **Google sign-in is blocked in testing:** Add the account under test users
  in the Google Auth Platform consent screen.
- **The browser cannot reach the API:** Check that MongoDB and the API are
  running, and that `VITE_DEV_API_TARGET` or `VITE_API_BASE_URL` points to the
  correct API.
- **The API rejects a browser write request:** Make sure the request's exact
  origin is listed in `CLIENT_ORIGINS`.
- **Gemini replies fail:** Add a valid Google AI Studio API key in **Chat
  options**, check the selected Gemini model, and review that key's API access
  and quota in Google AI Studio.
- **A previous guest story is missing:** It can only be claimed if its story ID
  is still available in that browser's local storage. Guest stories without a
  saved ID cannot be recovered through the account story list.

## Artwork

The onboarding scene and friend avatar use
[`client/public/isha-scene.jpg`](./client/public/isha-scene.jpg). The chat
wallpaper is [`client/public/chat-background.png`](./client/public/chat-background.png).
