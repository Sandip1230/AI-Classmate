# Classmate

A two-part AI chat app: a React/Vite client and an Express API. Chat sessions
are stored in MongoDB, and replies are generated with the Gemini API.

## Requirements

- Node.js 20+
- MongoDB
- A Google Gemini API key

## Setup

1. Copy `server/.env.example` to `server/.env` and provide `MONGODB_URI` and
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
`http://localhost:5000`. Set `CLIENT_URL` in the server environment if the
client runs at a different origin. Set `VITE_API_URL` in the client environment
if the API is hosted elsewhere.

To add the optional scene image, put the uploaded file at
`client/public/isha-scene.jpg`.