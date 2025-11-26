# Officattend

A lightweight face-recognition attendance tracker with a React frontend and a simple Express JSON API backend. It supports local mode (no server) and backend mode for multi-user environments and CSV exports.

## Features
- Real-time face detection and recognition using `face-api.js`.
- Optional OpenCV-based motion and blur checks for liveness and quality.
- Register employees by capturing a face descriptor.
- Mark attendance (check-in/check-out) automatically when recognized.
- Local storage mode and backend mode (REST API) with identical UI.
- CSV export for today or custom date ranges.
- Basic charts and logs for activity visualization.

## Requirements
- Node.js 18+
- Modern browser with camera support

## Quick Start

### 1) Install dependencies
```bash
npm install
```

### 2) Fetch model weights (optional)
If you don’t already have the models in `public/models/`, run:
```bash
npm run fetch-models
```
This downloads the `face-api.js` weights into `public/models/`. The app can also fall back to CDN, but local weights start faster and avoid network flakiness.

### 3) Start the backend API (optional)
If you want server-backed storage and CSV export:
```bash
npm run server
```
- API runs at `http://localhost:3001`.
- Data persists to `server/data.json` (ignored by git).

### 4) Start the frontend
```bash
npm run dev
```
- Open the app at `http://localhost:5173/`.

### 5) Enable backend mode (optional)
The app auto-detects backend availability via `/health`. If the backend is running, it will switch to server-backed data for company, employees, and attendance.

## How It Works
- Face detection: `TinyFaceDetector` by default, SSD Mobilenet if available.
- Recognition: face descriptors stored per-employee and matched with `FaceMatcher`.
- Attendance logic: When a recognized face appears in attendance mode, the app records `checkIn` or `checkOut` depending on the selected type and today’s record state.
- Motion gating: OpenCV frame differencing reduces spurious marks by requiring visible motion.

## CSV Export
The backend exposes a CSV endpoint:
- Today: `GET /company/:id/attendance.csv`
- Range: `GET /company/:id/attendance.csv?start=YYYY-MM-DD&end=YYYY-MM-DD`

Columns:
- `Date` (`YYYY-MM-DD`)
- `Name`
- `CheckIn` (`HH:MM:SS`)
- `CheckOut` (`HH:MM:SS`)
- `Late` (`late` or empty)
- `EarlyLeave` (`early` or empty)
- `Absent` (`absent` or empty)

Tip: If your spreadsheet shows `#####`, widen the column or ensure the cell format is set to text/time. The API uses stable ASCII time strings to avoid locale-specific hashes.

## Project Structure
```
public/            # static assets
  models/         # face-api.js weights (optional, can use CDN)
  vendor/opencv.js# OpenCV (optional)
server/            # Express API
  index.js        # API routes
  data.json       # persisted data (git-ignored)
src/               # React app
  App.jsx         # main application
  api.js          # backend client
  store.js        # local storage adapter
  snackbar.jsx    # notifications
  main.jsx        # React root
```

## Scripts
- `npm run dev` — start Vite dev server.
- `npm run build` — build production bundle.
- `npm run preview` — preview built bundle.
- `npm run fetch-models` — download face-api.js weights into `public/models/`.
- `npm run server` — start the Express backend.

## Configuration Notes
- Backend base URL is `http://localhost:3001` (`src/api.js`). Adjust if you deploy elsewhere.
- Models expected in `/models` at runtime. The app falls back to CDN if local weights are missing.
- CSV URL helper is `csvUrl(companyId, start?, end?)` from `src/api.js`.

## Development Tips
- If models fail to load, ensure files exist under `public/models/` or run `npm run fetch-models`.
- Camera permissions are required. If the default `facingMode:'user'` fails, the app will try a generic camera and then enumerate devices.
- For recognition quality, capture a clear, front-facing face in good lighting when registering employees.

## License
This project is intended as an internal demo template. Add a license if you plan to open source.
