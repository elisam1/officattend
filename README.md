# OfficAttend

A lightweight face-recognition attendance tracking system with a React frontend and Express.js backend. Supports both local storage mode (browser-only) and backend mode for multi-user environments with CSV exports.

## Features

### Face Recognition
- Real-time face detection using `face-api.js` (TinyFaceDetector or SSD Mobilenet)
- **75% confidence threshold** required for attendance recording (configurable)
- Face descriptor storage per employee for recognition
- Visual feedback showing match confidence percentage

### Attendance Tracking
- Automatic check-in/check-out when recognized face is detected
- Late arrival and early departure tracking based on configurable schedules
- Absence marking with "Close Day" feature
- History view with date range filtering

### Organization Features
- Department and shift management (backend mode)
- Per-shift schedule configuration
- Employee management (add, rename, delete)
- Admin authentication with JWT tokens

### Data & Export
- CSV export for today or custom date ranges
- Dashboard with attendance charts (present, late, early, absent)
- Printable attendance reports
- Local storage mode for offline use

### Quality Controls
- OpenCV-based motion detection to prevent duplicate marks
- Blur and lighting checks during face registration
- Face alignment validation for optimal capture
- 1.5-second cooldown between attendance marks

## Requirements
- Node.js 18+
- Modern browser with camera support

## Quick Start

### 1) Install dependencies
```bash
npm install
```

### 2) Fetch model weights (optional)
If you don't already have the models in `public/models/`, run:
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
- Data persists to `server/data.json`.

### 4) Start the frontend
```bash
npm run dev
```
- Open the app at `http://localhost:5173/`.

### 5) Enable backend mode (optional)
The app auto-detects backend availability via `/health`. If the backend is running, it will switch to server-backed data for company, employees, and attendance.

## How It Works

### Face Detection & Recognition
1. **Detection**: TinyFaceDetector (default) or SSD Mobilenet scans each video frame
2. **Descriptor Extraction**: 128-dimension face descriptor computed for each detected face
3. **Matching**: FaceMatcher compares descriptor against registered employees
4. **Confidence Check**: Match confidence = `(1 - distance) × 100`. Must be ≥75% to record attendance

### Attendance Logic
- When a recognized face appears in attendance mode with ≥75% confidence:
  - **Check-in mode**: Records check-in time if not already checked in
  - **Check-out mode**: Records check-out time if not already checked out
- Late/early status calculated against configurable schedule times
- Motion detection prevents accidental duplicate marks

## API Endpoints

### Company & Auth
- `POST /setup/company` — Create company with first admin
- `POST /auth/login` — Admin login (returns JWT)
- `GET /company/:id` — Get company details

### Employees
- `GET /company/:id/employees` — List employees
- `POST /company/:id/employees` — Add employee with face descriptor
- `PUT /company/:id/employees/:empId` — Update employee (auth required)
- `DELETE /company/:id/employees/:empId` — Delete employee (auth required)

### Attendance
- `GET /company/:id/attendance/today` — Today's attendance
- `GET /company/:id/attendance?start=&end=` — Attendance range
- `POST /company/:id/attendance` — Record attendance
- `POST /company/:id/attendance/closeDay` — Mark absentees (auth required)
- `GET /company/:id/attendance.csv` — CSV export

### Organization
- `GET/POST/DELETE /company/:id/departments` — Department CRUD
- `GET/POST/DELETE /company/:id/shifts` — Shift CRUD

## CSV Export

Endpoint: `GET /company/:id/attendance.csv?start=YYYY-MM-DD&end=YYYY-MM-DD`

Columns:
| Column | Description |
|--------|-------------|
| Date | `YYYY-MM-DD` |
| Name | Employee name |
| CheckIn | `HH:MM:SS` |
| CheckOut | `HH:MM:SS` |
| Late | `late` or empty |
| EarlyLeave | `early` or empty |
| Absent | `absent` or empty |

## Project Structure
```
public/
  models/           # face-api.js weights (optional, can use CDN)
  vendor/opencv.js  # OpenCV (optional)
server/
  index.js          # Express API routes
  data.json         # Persisted data
src/
  App.jsx           # Main React application
  api.js            # Backend API client
  store.js          # Local storage adapter
  snackbar.jsx      # Toast notifications
  main.jsx          # React entry point
scripts/
  fetch-models.cjs  # Model download script
```

## Scripts
| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build production bundle |
| `npm run preview` | Preview built bundle |
| `npm run fetch-models` | Download face-api.js weights |
| `npm run server` | Start Express backend |
| `npm run start` | Start both server and frontend |
| `npm run electron:dev` | Run app in Electron (dev mode) |
| `npm run electron:build` | Build Windows installer |

## Desktop Application (Electron)

OfficAttend can be packaged as a standalone Windows desktop application that doesn't require Node.js to be installed on end-user machines.

### Building the Installer

1. Install dependencies (if not done):
   ```bash
   npm install
   ```

2. Build the Electron app:
   ```bash
   npm run electron:build
   ```

3. Find the installer in `release/OfficAttend Setup 1.0.0.exe` (~83 MB)

### What the Installer Includes
- Complete Electron runtime (no Node.js required on target machine)
- Built React frontend
- Express.js backend server (starts automatically)
- All face recognition models
- OpenCV.js for motion detection

### Distribution
Share the `OfficAttend Setup 1.0.0.exe` file with users. They can:
1. Double-click to run the installer
2. Choose installation directory
3. Launch from desktop shortcut or Start Menu

### How It Works
The Electron app:
1. Starts the Express backend server automatically on port 3001
2. Opens a browser window pointing to the built frontend
3. Shows a loading screen while initializing
4. Runs in system tray when minimized (optional)

## Configuration

### Confidence Threshold
The face match confidence threshold is set to **75%** in `src/App.jsx`. To adjust:
- Find `matchConfidence >= 75` and change the value
- Lower = more lenient matching (may cause false positives)
- Higher = stricter matching (may miss valid matches)

### Schedule Settings
Default schedule (adjustable in Admin panel):
- Check-in deadline: 10:00 AM
- Check-out start: 4:00 PM

### Backend URL
Backend base URL is `http://localhost:3001` in `src/api.js`. Adjust for deployment.

## Development Tips
- **Models not loading?** Run `npm run fetch-models` or check `public/models/`
- **Camera issues?** Ensure camera permissions. App tries multiple fallback methods.
- **Recognition quality?** Register faces in good lighting, front-facing, with minimal motion
- **Check browser console** (F12) for detailed logging during attendance recording

## License
This project is intended as an internal demo template. Add a license if you plan to open source.
