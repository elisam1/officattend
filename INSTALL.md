# OfficAttend Installation Guide

## For End Users (Your Workplace / Mum's Office)

### Prerequisites
1. Install **Node.js** (version 18 or higher): https://nodejs.org/
   - Download the LTS version
   - Run the installer, accept defaults

### Installation Steps

1. **Extract the OfficAttend folder** to a location like `C:\OfficAttend` or `Desktop\OfficAttend`

2. **Open Command Prompt or PowerShell** in that folder:
   - Right-click the folder → "Open in Terminal" (Windows 11)
   - Or open Command Prompt and type: `cd C:\OfficAttend`

3. **Install dependencies** (first time only):
   ```
   npm install
   ```

4. **Start the application**:
   ```
   npm start
   ```
   This will start both the backend server and open the app in your browser.

5. **Access the app** at: http://localhost:5173

### Daily Usage
- Double-click `start.bat` (Windows) to launch the app
- Or run `npm start` in the terminal

### First Time Setup
1. Create your company and admin account
2. Go to "Register" tab to add employees (capture their face)
3. Go to "Attendance" tab for daily check-in/check-out
4. Use "Today" and "History" tabs to view records
5. Export to CSV from History tab

### Troubleshooting
- **Camera not working?** Allow camera permissions when prompted
- **App won't start?** Make sure Node.js is installed: `node --version`
- **Port in use?** Close other apps or restart computer
