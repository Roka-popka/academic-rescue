# Academic Rescue frontend

Standalone teacher dashboard using Vite, React, TypeScript, and plain CSS.

```sh
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:5173).

Run `npm run build` to check TypeScript and build into `dist/`.
Run `npm run preview` to preview that production build.

Start the backend in another terminal from the repository root with `npm run server`.
The dashboard at http://localhost:5173 reads http://localhost:3001/api.
The API uses the existing in-memory academic data and week 5 screening. No AI services or real notifications are called.
Select **Подробнее** to load a student's details. Missing plans and follow-ups are shown explicitly; GET requests never create actions.
Other navigation entries remain disabled placeholders. Teacher buttons call the backend action endpoints. Plans, approval timestamps, simulated notifications, and follow-ups persist in server memory until restart; no external messages are sent.

For an intervention, confirm the plan, save the message, then schedule a follow-up. WATCHLIST permits only a soft warning and a 7-day follow-up. Reopening details loads saved action state from the server.
