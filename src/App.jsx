import React, { useEffect, useMemo, useRef, useState } from 'react'
import { exportToExcel } from './exportExcel.js'
import { exportToPDF } from './exportPDF.js'
import EmptyState from './EmptyState.jsx'
import { useSnackbar } from './snackbar.jsx'
import Spinner from './Spinner.jsx'
import * as faceapi from 'face-api.js'
import { createCompany, getSession, getCompany, addEmployee, listEmployees, recordAttendance, listTodayAttendance, serializeDescriptor, renameEmployee, deleteEmployee, setSchedule, setSession, listAttendanceRange } from './store.js'
import { health, createCompanyRemote, getCompanyRemote, addEmployeeRemote, listEmployeesRemote, recordAttendanceRemote, listTodayAttendanceRemote, renameEmployeeRemote, deleteEmployeeRemote, updateSettingsRemote, csvUrl, loginRemote, listAttendanceRangeRemote, closeDayRemote, setAuthToken, listDepartmentsRemote, createDepartmentRemote, deleteDepartmentRemote, listShiftsRemote, createShiftRemote, deleteShiftRemote, updateEmployeeRemote } from './api.js'
import { Bar, Line } from 'react-chartjs-2'
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js'
import Avatar from './Avatar.jsx'
import SettingsPanel from './SettingsPanel.jsx'
import OnboardingTour from './OnboardingTour.jsx'

ChartJS.register(BarElement, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

// Electron camera release support
const isElectron = typeof window !== 'undefined' && window.require && window.require('electron');
let electronIpcRenderer = null;
if (isElectron) {
  try {
    electronIpcRenderer = window.require('electron').ipcRenderer;
  } catch {}
}

// Show a desktop notification if supported
function notify(title, body) {
  if (window.Notification && Notification.permission === 'granted') {
    new Notification(title, { body });
  } else if (window.Notification && Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification(title, { body });
      }
    });
  }
}
// Speak a message aloud using Web Speech API
function speak(text) {
  if (window.speechSynthesis) {
    const utter = new window.SpeechSynthesisUtterance(text);
    utter.rate = 1.05;
    utter.pitch = 1.0;
    window.speechSynthesis.speak(utter);
  }
}

// Simple reusable confirmation modal
function ConfirmModal({ open, title, message, onConfirm, onCancel, confirmText = 'Yes', cancelText = 'Cancel' }) {
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(0,0,0,0.18)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center'
    }} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 4px 32px #0002', padding: 28, minWidth: 320, maxWidth: '90vw', display: 'grid', gap: 18 }}>
        <div id="confirm-title" style={{ fontWeight: 600, fontSize: 18 }}>{title}</div>
        <div style={{ fontSize: 15 }}>{message}</div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid #bbb', background: '#f5f5f5', color: '#333', cursor: 'pointer' }}>{cancelText}</button>
          <button onClick={onConfirm} style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid #b00', background: '#e33', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
          // Confirmation modal state
          const [confirmModal, setConfirmModal] = useState({ open: false, onConfirm: null, title: '', message: '', confirmText: '', cancelText: '' });
        // Settings panel state
        const [showSettings, setShowSettings] = useState(false);
        const [language, setLanguage] = useState('en');
        const [cameraList, setCameraList] = useState([]);
        const [selectedCamera, setSelectedCamera] = useState('');

        // Detect cameras on mount
        useEffect(() => {
          async function fetchCameras() {
            try {
              const devices = await navigator.mediaDevices.enumerateDevices();
              const cams = devices.filter(d => d.kind === 'videoinput');
              setCameraList(cams);
              if (cams.length && !selectedCamera) setSelectedCamera(cams[0].deviceId);
            } catch {}
          }
          fetchCameras();
        }, []);
      // Loading states
      const [modelsLoaded, setModelsLoaded] = useState(false)
      const [ssdLoaded, setSsdLoaded] = useState(false)
      const [showModelSpinner, setShowModelSpinner] = useState(true);
      const [showCameraSpinner, setShowCameraSpinner] = useState(false);
      // Show spinner while models load
      useEffect(() => {
        if (!modelsLoaded) setShowModelSpinner(true);
        else setTimeout(() => setShowModelSpinner(false), 500);
      }, [modelsLoaded]);
    // Onboarding tour state
    const [showTour, setShowTour] = useState(() => {
      return window.localStorage.getItem('officattend_tour_shown') !== '1';
    });
    const handleTourClose = () => {
      setShowTour(false);
      window.localStorage.setItem('officattend_tour_shown', '1');
    };
  const [mode, setMode] = useState('attendance')
  const [status, setStatus] = useState('Loading...')
  const { push: pushSnack } = useSnackbar()
  const [running, setRunning] = useState(false)
  const [detector, setDetector] = useState('tiny')
  const lastBoxRef = useRef(null)
  const [showLandmarks, setShowLandmarks] = useState(false)
  const [faceInfos, setFaceInfos] = useState([]) // real-time detection + recognition feedback
  const [events, setEvents] = useState([]) // dynamic logs
  const [fps, setFps] = useState(0)
  const lastFrameTsRef = useRef(0)
  const [nowStr, setNowStr] = useState(new Date().toLocaleString())
  const pausedByVisibilityRef = useRef(false)
  const snapshotRef = useRef(null)
  const [companyId, setCompanyId] = useState(null)
  const [company, setCompany] = useState(null)
  const [attendanceType, setAttendanceType] = useState('in')
  const [nameInput, setNameInput] = useState('')
  const [useBackend, setUseBackend] = useState(false)
  const [schedInEnd, setSchedInEnd] = useState('10:00')
  const [schedOutStart, setSchedOutStart] = useState('16:00')
  const [autoTimer, setAutoTimer] = useState(null)
  const [adminToken, setAdminToken] = useState(null)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [historyStart, setHistoryStart] = useState('')
  const [historyEnd, setHistoryEnd] = useState('')
  const [historyRows, setHistoryRows] = useState([])
  const [departments, setDepartments] = useState([])
  const [shifts, setShifts] = useState([])
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const procCanvasRef = useRef(null)
  const prevFrameRef = useRef(null)
  const motionRef = useRef(false)
  const [cvReady, setCvReady] = useState(false)
  const [captureReady, setCaptureReady] = useState(false)
  const [captureMsg, setCaptureMsg] = useState('')
  const [pendingDescriptor, setPendingDescriptor] = useState(null)
  const [theme, setTheme] = useState('dark')
  // Refs to hold current values for the recognition loop
  const companyRef = useRef(null)
  const modeRef = useRef('attendance')
  const attendanceTypeRef = useRef('in')
  const todayRowsRef = useRef([])
  const useBackendRef = useRef(false)
  const faceMatcherRef = useRef(null)
  const palette = useMemo(() => {
    if (theme === 'dark') {
      return {
        bg: '#0b1220',
        headerBg: '#0f172a',
        card: '#0f172a',
        border: '#1f2937',
        text: '#e5e7eb',
        muted: '#9ca3af',
        primary: '#2563eb',
        primaryText: '#ffffff',
        buttonBg: '#111827',
        buttonBorder: '#334155',
        accentBg: '#0b1220',
        accentActiveBg: '#1e293b'
      }
    }
    return {
      bg: '#f8fafc',
      headerBg: '#ffffff',
      card: '#ffffff',
      border: '#e5e7eb',
      text: '#1f2937',
      muted: '#64748b',
      primary: '#2563eb',
      primaryText: '#ffffff',
      buttonBg: '#ffffff',
      buttonBorder: '#d1d5db',
      accentBg: '#ffffff',
      accentActiveBg: '#eef2ff'
    }
  }, [theme])

  function btnStyle(active) {
    return {
      padding: '8px 12px',
      borderRadius: 6,
      border: `1px solid ${palette.buttonBorder}`,
      background: active ? palette.accentActiveBg : palette.accentBg,
      color: palette.text,
      cursor: 'pointer'
    }
  }
  const primaryBtnStyle = {
    padding: '10px 14px',
    borderRadius: 6,
    border: `1px solid ${palette.primary}`,
    background: palette.primary,
    color: palette.primaryText,
    cursor: 'pointer'
  }
  const secondaryBtnStyle = {
    padding: '10px 14px',
    borderRadius: 6,
    border: `1px solid ${palette.buttonBorder}`,
    background: palette.buttonBg,
    color: palette.text,
    cursor: 'pointer'
  }
  const thtd = {
    border: `1px solid ${palette.border}`, padding: '8px 10px', textAlign: 'left'
  }
  

  // Safely obtain a ready HTMLVideoElement for face-api input
  function getVideoMedia() {
    const v = videoRef.current
    if (!v) return null
    // ensure element type and dimension readiness
    const ready = v instanceof HTMLVideoElement && v.videoWidth && v.videoHeight
    return ready ? v : null
  }

  // Logout clears session, tokens, and resets local state so app returns to Setup
  function handleLogout() {
    try { setSession(null) } catch {}
    setAuthToken(null)
    setAdminToken(null)
    setCompany(null)
    setCompanyId(null)
    setDepartments([])
    setShifts([])
    setHistoryRows([])
    setNameInput('')
    setRunning(false)
    setStatus('Logged out')
    pushSnack('Logged out', 'success')
  }

  function initCamera() {
    async function tryStart(constraints) {
      setShowCameraSpinner(true);
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        try { await videoRef.current.play() } catch {}
      }
      setStatus('Camera ready')
      pushSnack('Camera ready', 'success')
      setShowCameraSpinner(false);
    }
    (async () => {
      try {
        await tryStart({ video: { facingMode: 'user' }, audio: false })
      } catch (err) {
        // Fallback: try default camera if facingMode fails
        try {
          await tryStart({ video: true, audio: false })
        } catch (err2) {
          // Enumerate devices and force first video input
          try {
            const devices = await navigator.mediaDevices.enumerateDevices()
            const cams = devices.filter(d => d.kind === 'videoinput')
            if (cams.length > 0) {
              const deviceId = cams[0].deviceId
              await tryStart({ video: { deviceId: { exact: deviceId } }, audio: false })
            } else {
              throw new Error('No video input devices found')
            }
          } catch (err3) {
            setStatus('Camera permission denied or not available')
            pushSnack('Camera not available or permission denied', 'error')
          }
        }
      }
      // Prepare offscreen canvas for OpenCV processing
      procCanvasRef.current = document.createElement('canvas')
    })()
  }
  useEffect(() => {
    initCamera();
    // Release camera on unload or Electron event
    const cleanup = () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks?.() || [];
        tracks.forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      // Notify Electron main process if needed
      if (electronIpcRenderer) {
        electronIpcRenderer.send('camera-released');
      }
    };
    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('unload', cleanup);
    // Listen for Electron release-camera event
    if (electronIpcRenderer) {
      electronIpcRenderer.on('release-camera', cleanup);
    }
    return () => {
      cleanup();
      window.removeEventListener('beforeunload', cleanup);
      window.removeEventListener('unload', cleanup);
      if (electronIpcRenderer) {
        electronIpcRenderer.removeListener('release-camera', cleanup);
      }
    };
  }, []);

  // Update date/time every second
  useEffect(() => {
    const id = setInterval(() => setNowStr(new Date().toLocaleString()), 1000)
    return () => clearInterval(id)
  }, [])

  // Pause detection when tab is hidden to save resources and avoid false positives
  useEffect(() => {
    const onVis = () => {
      pausedByVisibilityRef.current = document.hidden
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // Detect when OpenCV.js runtime is ready
  useEffect(() => {
    const tryInit = () => {
      const cv = window.cv
      if (!cv) return false
      if (cv && cv['onRuntimeInitialized']) {
        cv['onRuntimeInitialized'] = () => { setCvReady(true); pushSnack('OpenCV ready', 'success') }
        return false
      }
      // Some builds set cv.ready directly
      if (cv && (cv.Mat || cv['ready'])) { setCvReady(true); return true }
      return false
    }
    if (!tryInit()) {
      const id = setInterval(() => { if (tryInit()) clearInterval(id) }, 200)
      return () => clearInterval(id)
    }
  }, [])

  // Auto-start recognition on attendance and register pages when models are ready
  useEffect(() => {
    if (modelsLoaded && (mode === 'attendance' || mode === 'register') && !running) {
      setRunning(true)
    }
  }, [modelsLoaded, mode])

  useEffect(() => {
    async function loadModels() {
      setStatus('Loading face recognition models...')
      try {
        // Expect models in /public/models directory. If not present, this will fail.
        const base = '/models'
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(base),
          faceapi.nets.faceLandmark68Net.loadFromUri(base),
          faceapi.nets.faceRecognitionNet.loadFromUri(base)
        ])
        // Try to load SSD Mobilenet detector if available (optional)
        try { await faceapi.nets.ssdMobilenetv1.loadFromUri(base); setSsdLoaded(true) } catch { setSsdLoaded(false) }
        setModelsLoaded(true)
        setStatus('Models loaded. Ready.')
      } catch (err) {
        // Try CDN fallback if local models are absent
        try {
          const cdn = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights'
          await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(cdn),
            faceapi.nets.faceLandmark68Net.loadFromUri(cdn),
            faceapi.nets.faceRecognitionNet.loadFromUri(cdn)
          ])
          try { await faceapi.nets.ssdMobilenetv1.loadFromUri(cdn); setSsdLoaded(true) } catch { setSsdLoaded(false) }
          setModelsLoaded(true)
          setStatus('Models loaded from CDN. Ready.')
          pushSnack('Models loaded from CDN', 'success')
        } catch (e2) {
          // Gracefully continue without models; detection will be disabled.
          setModelsLoaded(false)
          setSsdLoaded(false)
          setStatus('Models not found. Place model files in public/models to enable detection.')
          pushSnack('Models missing: add to public/models to enable detection', 'warning')
        }
      }
    }
    loadModels()
  }, [])

  // Inform user if SSD was requested but not available
  useEffect(() => {
    if (detector === 'ssd' && !ssdLoaded) {
      setStatus('SSD Mobilenet not loaded — falling back to Tiny detector')
      pushSnack('SSD not loaded — using Tiny', 'info')
    }
  }, [detector, ssdLoaded])

  useEffect(() => {
    let rafId
    const loop = async () => {
      if (pausedByVisibilityRef.current || !running || !modelsLoaded || !getVideoMedia()) {
        rafId = requestAnimationFrame(loop)
        return
      }
      // FPS calculation
      const nowTs = performance.now()
      if (lastFrameTsRef.current) {
        const dt = nowTs - lastFrameTsRef.current
        setFps(Math.round(1000 / Math.max(1, dt)))
      }
      lastFrameTsRef.current = nowTs
      // Preprocess frame with OpenCV for basic liveness/motion detection
      try {
        const v = videoRef.current
        const w = v.videoWidth, h = v.videoHeight
        if (cvReady && window.cv && w && h && procCanvasRef.current) {
          const pc = procCanvasRef.current
          if (pc.width !== w) pc.width = w
          if (pc.height !== h) pc.height = h
          const pctx = pc.getContext('2d')
          pctx.drawImage(v, 0, 0, w, h)
          const cv = window.cv
          let src = cv.imread(pc)
          cv.cvtColor(src, src, cv.COLOR_RGBA2GRAY)
          cv.equalizeHist(src, src)
          if (prevFrameRef.current) {
            let diff = new cv.Mat()
            cv.absdiff(src, prevFrameRef.current, diff)
            const m = cv.mean(diff)
            const meanIntensity = (m[0] + m[1] + m[2]) / 3
            motionRef.current = meanIntensity > 5 // simple threshold for motion
            diff.delete()
            prevFrameRef.current.delete()
          } else {
            motionRef.current = true
          }
          prevFrameRef.current = src
        }
      } catch (e) {
        // ignore OpenCV errors; keep face-api loop running
      }
      const useSSD = detector === 'ssd' && ssdLoaded
      const vwidth = videoRef.current.videoWidth || 320
      const dynInput = Math.max(160, Math.min(416, Math.floor(vwidth / 2)))
      const primaryOptions = useSSD
        ? new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })
        : new faceapi.TinyFaceDetectorOptions({ inputSize: dynInput, scoreThreshold: 0.3 })
      let detections
      try {
        const media = getVideoMedia()
        detections = await faceapi
          .detectAllFaces(media, primaryOptions)
          .withFaceLandmarks()
          .withFaceDescriptors()
        
      } catch (e) {
        // Guard against toNetInput errors by falling back to Tiny
        try {
          const media = getVideoMedia()
          const tinyOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: dynInput, scoreThreshold: 0.3 })
          detections = await faceapi
            .detectAllFaces(media, tinyOptions)
            .withFaceLandmarks()
            .withFaceDescriptors()
        } catch {}
      }
      // Fallback to alternate detector if none found
      if ((!detections || detections.length === 0)) {
        try {
          const fallbackOptions = useSSD
            ? new faceapi.TinyFaceDetectorOptions({ inputSize: dynInput, scoreThreshold: 0.3 })
            : (ssdLoaded ? new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }) : new faceapi.TinyFaceDetectorOptions({ inputSize: dynInput, scoreThreshold: 0.3 }))
          const media = getVideoMedia()
          if (media) {
            detections = await faceapi
              .detectAllFaces(media, fallbackOptions)
              .withFaceLandmarks()
              .withFaceDescriptors()
          }
        } catch {}
      }
      const canvas = canvasRef.current
      if (canvas && videoRef.current) {
        const media = getVideoMedia() || videoRef.current
        const dims = faceapi.matchDimensions(canvas, media, true)
        const resized = faceapi.resizeResults(detections, dims)
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        const infos = []
        // Use refs to get current values in the loop
        const currentCompany = companyRef.current
        const currentMode = modeRef.current
        const currentFaceMatcher = faceMatcherRef.current
        // Build per-face info cards and draw overlays
        resized.forEach((det,i) => {
          const box = det.detection.box
          const score = det.detection.score || 0
          let best = null
          let emp = null
          let statusTxt = 'Unknown Face'
          let distance = null
          let matchConfidence = 0
          if (currentFaceMatcher && currentMode === 'attendance') {
            best = currentFaceMatcher.findBestMatch(det.descriptor)
            if (best && best.label !== 'unknown') {
              emp = currentCompany?.employees?.find(e => e.id === best.label) || null
              distance = best.distance
              // Match confidence: 75% required to record attendance
              // confidence = (1 - distance) * 100
              matchConfidence = Math.round((1 - distance) * 100)
              const accept = matchConfidence >= 75
              statusTxt = emp ? (accept ? `Recognized (${matchConfidence}%)` : `${emp.name} - ${matchConfidence}% (need 75%+)`) : 'Unknown Face'
            }
          }
          infos.push({
            i,
            count: resized.length,
            box: { x: box.x, y: box.y, w: box.width, h: box.height },
            score: Math.round(score * 100),
            label: emp ? emp.name : 'unknown',
            empId: emp ? emp.id : null,
            status: statusTxt,
            distance,
            matchConfidence,
            time: new Date().toLocaleTimeString(),
          })
          // Draw rounded box - green if 75%+, orange otherwise
          const color = (emp && matchConfidence >= 75) ? 'lime' : 'orange'
          ctx.strokeStyle = color
          ctx.lineWidth = 3
          const radius = 8
          const x = box.x, y = box.y, w = box.width, h = box.height
          ctx.beginPath()
          ctx.moveTo(x + radius, y)
          ctx.lineTo(x + w - radius, y)
          ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
          ctx.lineTo(x + w, y + h - radius)
          ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
          ctx.lineTo(x + radius, y + h)
          ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
          ctx.lineTo(x, y + radius)
          ctx.quadraticCurveTo(x, y, x + radius, y)
          ctx.stroke()
          // Caption with confidence and status
          ctx.fillStyle = color
          ctx.font = '12px system-ui, sans-serif'
          const confTxt = `Face ${Math.round(score*100)}%` + (emp ? ` • ${emp.name}` : '')
          ctx.fillText(confTxt, x + 4, Math.max(12, y - 6))
          // Landmarks (optional)
          if (showLandmarks) {
            const pts = det.landmarks.positions
            ctx.fillStyle = 'deepskyblue'
            pts.forEach(p => { ctx.fillRect(p.x-1, p.y-1, 2, 2) })
          }
        })
        setFaceInfos(infos)
        if (mode === 'register' && resized.length > 0) {
          const det = resized[0]
          const box = det.detection.box
          let ready = false
          let msg = ''
          try {
            const v = videoRef.current
            const w = v.videoWidth, h = v.videoHeight
            const areaRatio = (box.width * box.height) / (dims.width * dims.height)
            const sizeOk = areaRatio > 0.10 && box.width >= 160 && box.height >= 160
            // Alignment via eye-nose symmetry
            const leftEye = det.landmarks.getLeftEye()
            const rightEye = det.landmarks.getRightEye()
            const nose = det.landmarks.getNose()
            const avgPt = pts => pts.reduce((a,p) => ({ x: a.x + p.x, y: a.y + p.y }), { x:0, y:0 })
            const eyeL = { x: avgPt(leftEye).x / leftEye.length, y: avgPt(leftEye).y / leftEye.length }
            const eyeR = { x: avgPt(rightEye).x / rightEye.length, y: avgPt(rightEye).y / rightEye.length }
            const noseTip = nose[Math.floor(nose.length/2)] || nose[3] || nose[0]
            const dL = Math.hypot(noseTip.x - eyeL.x, noseTip.y - eyeL.y)
            const dR = Math.hypot(noseTip.x - eyeR.x, noseTip.y - eyeR.y)
            const symmetry = Math.abs(dL - dR) / Math.max(dL, dR)
            const alignOk = symmetry < 0.15

            // OpenCV checks: blur and lighting on ROI
            let blurOk = true, lightOk = true
            if (cvReady && window.cv) {
              const cv = window.cv
              const pc = procCanvasRef.current || document.createElement('canvas')
              if (pc.width !== dims.width) pc.width = dims.width
              if (pc.height !== dims.height) pc.height = dims.height
              const pctx = pc.getContext('2d')
              pctx.drawImage(v, 0, 0, dims.width, dims.height)
              let frame = cv.imread(pc)
              cv.cvtColor(frame, frame, cv.COLOR_RGBA2GRAY)
              const rect = new cv.Rect(Math.max(0, Math.round(box.x)), Math.max(0, Math.round(box.y)), Math.round(box.width), Math.round(box.height))
              let roi = frame.roi(rect)
              let lap = new cv.Mat()
              cv.Laplacian(roi, lap, cv.CV_64F)
              let mean = new cv.Mat(), stddev = new cv.Mat()
              cv.meanStdDev(lap, mean, stddev)
              const blurVar = stddev.doubleAt(0,0) || 0
              blurOk = blurVar > 12
              const m = cv.mean(roi)
              const grayMean = m[0]
              lightOk = grayMean > 50 && grayMean < 200
              lap.delete(); mean.delete(); stddev.delete(); roi.delete(); frame.delete()
            }

            const stillOk = !motionRef.current
            ready = sizeOk && alignOk && blurOk && lightOk && stillOk
            msg = ready ? 'Ready: optimal face captured' : (!sizeOk ? 'Move closer' : (!alignOk ? 'Face front' : (!blurOk ? 'Hold still' : (!lightOk ? 'Adjust lighting' : (!stillOk ? 'Hold still' : 'Align face')))))
          } catch (e) {
            ready = false
            msg = 'Analyzing...'
          }
          // Draw modernized tracking box
          const color = ready ? 'lime' : 'orange'
          ctx.strokeStyle = color
          ctx.lineWidth = 3
          const radius = 8
          const x = box.x, y = box.y, w = box.width, h = box.height
          ctx.beginPath()
          ctx.moveTo(x + radius, y)
          ctx.lineTo(x + w - radius, y)
          ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
          ctx.lineTo(x + w, y + h - radius)
          ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
          ctx.lineTo(x + radius, y + h)
          ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
          ctx.lineTo(x, y + radius)
          ctx.quadraticCurveTo(x, y, x + radius, y)
          ctx.stroke()
          // Caption
          ctx.fillStyle = color
          ctx.font = '14px system-ui, sans-serif'
          ctx.fillText(msg, x + 4, Math.max(14, y - 8))
          // Tracking dot (nose tip)
          const noseTip = det.landmarks.getNose()[Math.floor(det.landmarks.getNose().length/2)]
          if (noseTip) {
            ctx.beginPath()
            ctx.arc(noseTip.x, noseTip.y, 3, 0, Math.PI * 2)
            ctx.fill()
          }

          setCaptureReady(ready)
          setCaptureMsg(msg)
          if (ready && !pendingDescriptor) {
            setPendingDescriptor(detections[0].descriptor)
            setStatus('Best face captured — click Save')
            pushSnack('Best face captured — click Save Face Template', 'success')
          }
        } else {
          // Attendance mode overlays already handled above
        }
        // Auto mark attendance when in attendance mode (handle multiple faces)
        // IMPORTANT: Use refs to get current values
        const currentTodayRows = todayRowsRef.current
        const currentAttendanceType = attendanceTypeRef.current
        const currentUseBackend = useBackendRef.current
        if (currentCompany && currentMode === 'attendance' && infos && infos.length > 0) {
          console.log('Attendance check - infos:', infos.length, 'motion:', motionRef.current)
          const now = Date.now()
          for (const info of infos) {
            console.log('Processing face:', info.label, 'empId:', info.empId, 'confidence:', info.matchConfidence)
            if (!info.empId) {
              console.log('Skipping - no empId')
              continue
            }
            // Only record attendance if match confidence is >= 75%
            if (info.matchConfidence < 75) {
              setStatus(`${info.label}: confidence ${info.matchConfidence}% (need 75%+)`)
              console.log('Skipping - low confidence:', info.matchConfidence)
              continue
            }
            const emp = currentCompany.employees.find(e => e.id === info.empId)
            if (!emp) {
              console.log('Skipping - employee not found')
              continue
            }
            // Determine current record state for today
            const todayRec = (currentTodayRows||[]).find(r => r.employeeId === emp.id)
            let alreadyIn = !!(todayRec && todayRec.checkIn)
            let alreadyOut = !!(todayRec && todayRec.checkOut)
            console.log('Employee found:', emp.name, 'alreadyIn:', alreadyIn, 'alreadyOut:', alreadyOut, 'attendanceType:', currentAttendanceType)
            if (currentAttendanceType === 'in') {
              if (alreadyIn) {
                setStatus(`Already checked in: ${emp.name}`)
                setEvents(ev => [{ t: new Date().toLocaleTimeString(), msg: `Already checked in: ${emp.name}` }, ...ev].slice(0,50))
                continue
              }
              try {
                console.log('Recording check-in for:', emp.name, 'backend:', currentUseBackend)
                if (currentUseBackend) {
                  const result = await recordAttendanceRemote(currentCompany.id, emp.id, 'in', now)
                  console.log('Check-in result:', result)
                } else {
                  const result = recordAttendance(currentCompany.id, emp.id, 'in', now)
                  console.log('Check-in result (local):', result)
                }
                await reloadToday()
                setStatus(`${emp.name} checked in at ${new Date(now).toLocaleTimeString()}`)
                setEvents(ev => [{ t: new Date().toLocaleTimeString(), msg: `Attendance recorded: ${emp.name} (Check-In)` }, ...ev].slice(0,50))
                pushSnack(`${emp.name} checked in`, 'success')
                speak(`Attendance marked for ${emp.name}`)
                notify('Attendance Marked', `${emp.name} checked in`)
              } catch (err) {
                console.error('Check-in failed:', err)
                setStatus(`Check-in failed for ${emp.name}`)
                pushSnack(`Check-in failed: ${err.message}`, 'error')
              }
            } else {
              if (alreadyOut) {
                setStatus(`Already checked out: ${emp.name}`)
                setEvents(ev => [{ t: new Date().toLocaleTimeString(), msg: `Already checked out: ${emp.name}` }, ...ev].slice(0,50))
                continue
              }
              try {
                console.log('Recording check-out for:', emp.name, 'backend:', currentUseBackend)
                if (currentUseBackend) {
                  const result = await recordAttendanceRemote(currentCompany.id, emp.id, 'out', now)
                  console.log('Check-out result:', result)
                } else {
                  const result = recordAttendance(currentCompany.id, emp.id, 'out', now)
                  console.log('Check-out result (local):', result)
                }
                await reloadToday()
                setStatus(`${emp.name} checked out at ${new Date(now).toLocaleTimeString()}`)
                setEvents(ev => [{ t: new Date().toLocaleTimeString(), msg: `Departure recorded: ${emp.name} (Check-Out)` }, ...ev].slice(0,50))
                pushSnack(`${emp.name} checked out`, 'success')
                speak(`Attendance marked for ${emp.name}`)
                notify('Attendance Marked', `${emp.name} checked out`)
              } catch (err) {
                console.error('Check-out failed:', err)
                setStatus(`Check-out failed for ${emp.name}`)
                pushSnack(`Check-out failed: ${err.message}`, 'error')
              }
            }
            // brief pause to avoid multiple marks
            setRunning(false)
            setTimeout(() => setRunning(true), 1500)
          }
        }
      }
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafId)
  }, [running, modelsLoaded])

  // Load session/company and detect backend
  // Detect backend availability early
  useEffect(() => { health().then(ok => setUseBackend(ok)) }, [])

  // Load session/company after we know whether backend is available
  useEffect(() => {
    const session = getSession()
    if (!session?.companyId) return
    setCompanyId(session.companyId)
    if (useBackend) {
      getCompanyRemote(session.companyId).then(setCompany).catch(() => setCompany(getCompany(session.companyId)))
    } else {
      setCompany(getCompany(session.companyId))
    }
  }, [useBackend])

  // Build face matcher when employees change
  const faceMatcher = useMemo(() => {
    if (!company || !modelsLoaded) return null
    const labeled = company.employees
      .filter(e => Array.isArray(e.descriptor) && e.descriptor.length === 128)
      .map(e => new faceapi.LabeledFaceDescriptors(e.id, [new Float32Array(e.descriptor)]))
    if (!labeled.length) return null
    // Threshold 0.6 for initial matching, but we require 80% confidence (distance < 0.2) to record
    return new faceapi.FaceMatcher(labeled, 0.6)
  }, [company, modelsLoaded])

  const employees = company ? (company.employees || []) : []
  const [todayRows, setTodayRows] = useState([])

  // Keep refs updated for the recognition loop
  useEffect(() => { companyRef.current = company }, [company])
  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { attendanceTypeRef.current = attendanceType }, [attendanceType])
  useEffect(() => { todayRowsRef.current = todayRows }, [todayRows])
  useEffect(() => { useBackendRef.current = useBackend }, [useBackend])
  useEffect(() => { faceMatcherRef.current = faceMatcher }, [faceMatcher])

  useEffect(() => {
    if (!company) { setTodayRows([]); return }
    ;(async () => {
      if (useBackend) {
        try { const rows = await listTodayAttendanceRemote(company.id); setTodayRows(rows) } catch { setTodayRows([]) }
      } else {
        try { setTodayRows(listTodayAttendance(company.id)) } catch { setTodayRows([]) }
      }
    })()
  }, [company, useBackend])

  async function reloadToday() {
    const currentCompany = companyRef.current
    const currentUseBackend = useBackendRef.current
    if (!currentCompany) return
    if (currentUseBackend) {
      try { 
        const rows = await listTodayAttendanceRemote(currentCompany.id)
        setTodayRows(rows)
        console.log('Reloaded today attendance:', rows)
      } catch (err) {
        console.error('Failed to reload today:', err)
      }
    } else {
      try { 
        const rows = listTodayAttendance(currentCompany.id)
        setTodayRows(rows)
        console.log('Reloaded today attendance (local):', rows)
      } catch (err) {
        console.error('Failed to reload today (local):', err)
      }
    }
  }

  useEffect(() => {
    async function loadOrg() {
      if (!company || !useBackend) return
      try {
        const deps = await listDepartmentsRemote(company.id)
        const shs = await listShiftsRemote(company.id)
        setDepartments(deps)
        setShifts(shs)
      } catch (e) {
        // ignore
      }
    }
    loadOrg()
  }, [company, useBackend])

  // Auto-load history rows when entering History tab; default to last 7 days
  useEffect(() => {
    if (!company || mode !== 'history') return
    const todayStr = new Date().toISOString().slice(0,10)
    const startDefault = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0,10)
    const start = historyStart || startDefault
    const end = historyEnd || todayStr
    if (!historyStart) setHistoryStart(start)
    if (!historyEnd) setHistoryEnd(end)
    ;(async () => {
      if (useBackend) {
        try { const rows = await listAttendanceRangeRemote(company.id, start, end); setHistoryRows(rows) } catch {}
      } else {
        try { const rows = listAttendanceRange(company.id, start, end); setHistoryRows(rows) } catch {}
      }
    })()
  }, [mode, company, useBackend])

  // Keep history table in sync when date range changes while in History tab
  useEffect(() => {
    if (!company || mode !== 'history') return
    if (!historyStart || !historyEnd) return
    ;(async () => {
      if (useBackend) {
        try { const rows = await listAttendanceRangeRemote(company.id, historyStart, historyEnd); setHistoryRows(rows) } catch {}
      } else {
        try { const rows = listAttendanceRange(company.id, historyStart, historyEnd); setHistoryRows(rows) } catch {}
      }
    })()
  }, [historyStart, historyEnd, mode, company, useBackend])

  if (!company) {
    return (
      <Onboarding useBackend={useBackend} setUseBackend={setUseBackend} secondaryBtnStyle={secondaryBtnStyle} primaryBtnStyle={primaryBtnStyle} palette={palette} onCreated={async (payload) => {
        let c
        if (useBackend) {
          c = await createCompanyRemote(payload.name, payload.admin)
        } else {
          c = createCompany(payload.name, payload.admin)
        }
        setCompany(c); setCompanyId(c.id); setStatus('Company created. Models: ' + (modelsLoaded ? 'loaded' : 'missing')); pushSnack('Company created', 'success')
        // Persist session so refreshes keep you in the company context
        try { setSession({ companyId: c.id, adminId: (c.admins && c.admins[0] && c.admins[0].id) || null }) } catch {}
        const sched = c.settings?.schedule || { checkInEnd: '10:00', checkOutStart: '16:00' }
        setSchedInEnd(sched.checkInEnd); setSchedOutStart(sched.checkOutStart)
       }} onLoggedIn={async ({ token, companyId, adminId }) => {
        try {
          setAuthToken(token); setAdminToken(token); pushSnack('Logged in', 'success')
          const c = await getCompanyRemote(companyId)
          setCompany(c); setCompanyId(c.id); setStatus('Logged in and company loaded')
          setSession({ companyId, adminId })
          const sched = c.settings?.schedule || { checkInEnd: '10:00', checkOutStart: '16:00' }
          setSchedInEnd(sched.checkInEnd); setSchedOutStart(sched.checkOutStart)
        } catch (e) {
          setStatus('Failed to load company after login'); pushSnack('Failed to load company after login', 'error')
        }
      }} />
    )
  }

  return (
    <>
      <ConfirmModal {...confirmModal} />
      <div
        style={{
          display: 'grid',
          gridTemplateRows: 'auto 1fr',
          minHeight: '100vh',
          background: palette.bg,
          color: palette.text
        }}
        role="application"
        aria-label="OfficAttend Attendance System"
      >
      <OnboardingTour open={showTour} onClose={handleTourClose} />
      <header style={{ padding: '12px 16px', borderBottom: `1px solid ${palette.border}`, background: palette.headerBg, display: 'flex', gap: 12, alignItems: 'center', position: 'relative' }} role="banner">
        <h1 style={{ margin: 0, fontSize: 18 }} tabIndex={0}>OfficAttend</h1>
        <button onClick={() => setShowTour(true)} style={{ position: 'absolute', right: 16, top: 16, zIndex: 10, background: 'none', border: 'none', color: palette.primary, cursor: 'pointer', fontSize: 14 }} aria-label="Show onboarding tour">❓ Tour</button>
        <nav style={{ display: 'flex', gap: 8 }} aria-label="Main navigation">
          <button onClick={() => setMode('attendance')} style={btnStyle(mode === 'attendance')} aria-current={mode === 'attendance'} tabIndex={0}>Attendance</button>
          <button onClick={() => setMode('register')} style={btnStyle(mode === 'register')} aria-current={mode === 'register'} tabIndex={0}>Register</button>
          <button onClick={() => setMode('records')} style={btnStyle(mode === 'records')} aria-current={mode === 'records'} tabIndex={0}>Today</button>
          <button onClick={() => setMode('history')} style={btnStyle(mode === 'history')} aria-current={mode === 'history'} tabIndex={0}>History</button>
          <button onClick={() => setMode('dashboard')} style={btnStyle(mode === 'dashboard')} aria-current={mode === 'dashboard'} tabIndex={0}>Dashboard</button>
          <button onClick={() => setMode('print')} style={btnStyle(mode === 'print')} aria-current={mode === 'print'} tabIndex={0}>Print</button>
          <button onClick={() => setMode('employees')} style={btnStyle(mode === 'employees')} aria-current={mode === 'employees'} tabIndex={0}>Employees</button>
          <button onClick={() => setMode('admin')} style={btnStyle(mode === 'admin')} aria-current={mode === 'admin'} tabIndex={0}>Admin</button>
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            style={{
              padding: '7px 14px',
              borderRadius: 20,
              border: `1px solid ${palette.buttonBorder}`,
              background: palette.buttonBg,
              color: palette.text,
              cursor: 'pointer',
              fontSize: 15,
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle dark/light mode"
          >
            {theme === 'dark' ? '🌙' : '☀️'}
            {theme === 'dark' ? 'Dark' : 'Light'}
          </button>
          <button
            style={{
              padding: '7px 14px',
              borderRadius: 20,
              border: `1px solid ${palette.buttonBorder}`,
              background: palette.buttonBg,
              color: palette.text,
              cursor: 'pointer',
              fontSize: 15,
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
            onClick={() => setShowSettings(true)}
            aria-label="Open settings panel"
          >
            ⚙️ Settings
          </button>
                {showSettings && (
                  <SettingsPanel
                    theme={theme}
                    setTheme={setTheme}
                    cameraList={cameraList}
                    selectedCamera={selectedCamera}
                    setSelectedCamera={setSelectedCamera}
                    language={language}
                    setLanguage={setLanguage}
                    onClose={() => setShowSettings(false)}
                  />
                )}
          <div style={{ fontSize: 13, color: palette.muted }}>{status}</div>
          <button onClick={handleLogout} style={secondaryBtnStyle}>Logout</button>
        </div>
      </header>
      <main
        style={{
          display: 'grid',
          placeItems: 'center',
          padding: 16,
          gap: 16,
        }}
        role="main"
        tabIndex={0}
        aria-label="Main content"
      >
        {showModelSpinner && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.18)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spinner size={60} color={palette.primary} />
            <span style={{ marginLeft: 18, color: palette.primary, fontWeight: 500, fontSize: 18 }}>Loading models...</span>
          </div>
        )}
        {showCameraSpinner && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.10)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spinner size={48} color={palette.primary} />
            <span style={{ marginLeft: 14, color: palette.primary, fontWeight: 500, fontSize: 16 }}>Starting camera...</span>
          </div>
        )}
        {['attendance', 'register'].includes(mode) && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 16,
              alignItems: 'flex-start',
              width: '100%',
              maxWidth: 1040,
            }}
          >
            <div style={{ position: 'relative', width: '100%', maxWidth: 720, flex: '2 1 320px', minWidth: 240 }}>
              <video ref={videoRef} width={720} height={405} style={{ width: '100%', background: '#000', borderRadius: 8 }} autoPlay muted playsInline />
              <canvas ref={canvasRef} width={720} height={405} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', borderRadius: 8, pointerEvents: 'none', zIndex: 2 }} />
            </div>
            <div style={{ display: 'grid', gap: 8, flex: '1 1 280px', minWidth: 220, maxWidth: 340 }}>
              <div style={{ padding: 10, border: `1px solid ${palette.border}`, borderRadius: 8, background: palette.card }}>
                <div style={{ fontSize: 13, color: palette.muted }}>Status</div>
                <div style={{ fontSize: 14 }}>{status}</div>
                <div style={{ display: 'flex', gap: 8, fontSize: 12, color: palette.muted }}>
                  <div>Now: {nowStr}</div>
                  <div>FPS: {fps}</div>
                  <div>Faces: {faceInfos.length}</div>
                </div>
              </div>
              <div style={{ padding: 10, border: `1px solid ${palette.border}`, borderRadius: 8, background: palette.card }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems:'center' }}>
                  <div style={{ fontSize: 13, color: palette.muted }}>Detected Faces</div>
                  <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="checkbox" checked={showLandmarks} onChange={e => setShowLandmarks(e.target.checked)} /> Landmarks
                  </label>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {faceInfos.length === 0 && <div style={{ fontSize: 12, color: palette.muted }}>No face detected</div>}
                  {faceInfos.map(info => (
                    <div key={info.i} style={{ border: `1px solid ${palette.border}`, borderRadius: 8, padding: 8, background: palette.card }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{info.status}</div>
                        <div style={{ fontSize: 12, color: palette.muted }}>{info.time}</div>
                      </div>
                      <div style={{ fontSize: 12 }}>
                        Confidence: {info.score}% {info.distance != null ? `• Match: ${(1 - info.distance).toFixed(2)}` : ''}
                      </div>
                      {info.empId ? (
                        <div style={{ fontSize: 12 }}>Employee: {info.label} • ID: {info.empId}</div>
                      ) : (
                        <div style={{ fontSize: 12, color: palette.muted }}>Label: unknown</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding: 10, border: `1px solid ${palette.border}`, borderRadius: 8, background: palette.card, maxHeight: 150, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 13, color: palette.muted, marginBottom: 6, flexShrink: 0 }}>Logs</div>
                <div style={{ display: 'grid', gap: 6, overflowY: 'auto', flex: 1 }}>
                  {events.length === 0 && <div style={{ fontSize: 12, color: palette.muted }}>No events yet</div>}
                  {events.map((e,idx) => (
                    <div key={idx} style={{ fontSize: 12 }}>{e.t} — {e.msg}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {mode === 'attendance' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label>Mode:</label>
            <button onClick={() => setAttendanceType('in')} style={btnStyle(attendanceType === 'in')}>Check-in</button>
            <button onClick={() => setAttendanceType('out')} style={btnStyle(attendanceType === 'out')}>Check-out</button>
            <button onClick={() => setRunning((r) => !r)} style={primaryBtnStyle}>{running ? 'Stop' : 'Start'} Recognition</button>
            <button onClick={() => initCamera()} style={secondaryBtnStyle}>Retry Camera</button>
        </div>
      )}

        {mode === 'register' && (
          <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
            <div style={{ fontSize: 13, color: captureReady ? '#0a7' : '#a70' }}>
              {captureMsg || 'Align face and hold still for best capture.'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="Worker name" style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6, width: 240 }} />
              <button onClick={async () => {
                if (!modelsLoaded) { setStatus('Models missing'); return }
                const media = getVideoMedia()
                if (!media) { setStatus('Camera not ready'); return }
                let descriptor = pendingDescriptor
                if (!descriptor) {
                  const useSSD = detector === 'ssd' && ssdLoaded
                  const vwidth = videoRef.current.videoWidth || 320
                  const dynInput = Math.max(160, Math.min(416, Math.floor(vwidth / 2)))
                  const primaryOptions = useSSD
                    ? new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })
                    : new faceapi.TinyFaceDetectorOptions({ inputSize: dynInput, scoreThreshold: 0.3 })
                  let det = await faceapi
                    .detectSingleFace(media, primaryOptions)
                    .withFaceLandmarks()
                    .withFaceDescriptor()
                  if (!det) {
                    try {
                      const fallbackOptions = useSSD
                        ? new faceapi.TinyFaceDetectorOptions({ inputSize: dynInput, scoreThreshold: 0.3 })
                        : (ssdLoaded ? new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }) : new faceapi.TinyFaceDetectorOptions({ inputSize: dynInput, scoreThreshold: 0.3 }))
                      det = await faceapi
                        .detectSingleFace(media, fallbackOptions)
                        .withFaceLandmarks()
                        .withFaceDescriptor()
                    } catch {}
                  }
                  if (!det) { setStatus('No face detected — try switching detector or adjust lighting'); pushSnack('No face detected', 'warning'); return }
                  descriptor = det.descriptor
                }
                let emp
                const payload = { name: nameInput.trim() || 'Unnamed', descriptor: serializeDescriptor(descriptor) }
                if (useBackend) {
                  emp = await addEmployeeRemote(company.id, payload)
                  setCompany(await getCompanyRemote(company.id))
                } else {
                  emp = addEmployee(company.id, payload)
                  setCompany(getCompany(company.id))
                }
                setPendingDescriptor(null)
                setCaptureReady(false)
                setNameInput('')
                setStatus(`Registered ${emp.name}`); pushSnack('Employee registered', 'success')
              }} style={primaryBtnStyle}>Save Face Template</button>
              <button onClick={() => { setPendingDescriptor(null); setCaptureReady(false); setCaptureMsg('Reset capture — align face and hold still.') }} style={secondaryBtnStyle}>Reset Capture</button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 13 }}>Detector:</label>
              <select value={detector} onChange={e => setDetector(e.target.value)} style={{ padding: 6, border: '1px solid #ddd', borderRadius: 6 }}>
                <option value="tiny">Tiny Face Detector</option>
                <option value="ssd">SSD Mobilenet</option>
              </select>
              <button style={secondaryBtnStyle} onClick={async () => {
                if (!modelsLoaded) { setStatus('Models missing'); return }
                const media = getVideoMedia()
                if (!media) { setStatus('Camera not ready'); return }
                try {
                  const useSSD = detector === 'ssd' && ssdLoaded
                  const options = useSSD
                    ? new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })
                    : new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })
                  const dets = await faceapi
                    .detectAllFaces(media, options)
                    .withFaceLandmarks()
                    .withFaceDescriptors()
                  setStatus(`Self-Test: OK — detected ${dets.length} face(s) with ${detector.toUpperCase()}`)
                  pushSnack('Self-Test passed', 'success')
                } catch (e) {
                  const msg = detector === 'ssd' && !ssdLoaded ? 'Self-Test failed: SSD model not loaded — switch to Tiny' : ('Self-Test failed: ' + (e?.message || 'error'))
                  setStatus(msg)
                  pushSnack('Self-Test failed', 'error')
                }
              }}>Run Model Self-Test</button>
              <button style={secondaryBtnStyle} onClick={() => {
                // Snapshot capture for debugging
                const v = videoRef.current
                if (!v) return
                const c = document.createElement('canvas')
                c.width = v.videoWidth; c.height = v.videoHeight
                const p = c.getContext('2d'); p.drawImage(v, 0, 0)
                snapshotRef.current = c.toDataURL('image/png')
                setEvents(ev => [{ t: new Date().toLocaleTimeString(), msg: 'Snapshot captured' }, ...ev].slice(0,50))
              }}>Capture Snapshot</button>
            </div>
            {snapshotRef.current && (
              <div style={{ display:'grid', gap:6 }}>
                <div style={{ fontSize: 12, color:'#666' }}>Last Snapshot Preview</div>
                <img src={snapshotRef.current} alt="snapshot" style={{ width: 240, borderRadius: 6, border: '1px solid #eee' }} />
              </div>
            )}
          </div>
        )}

        {mode === 'records' && (
          <div style={{ width: 720, maxWidth: '100%' }}>
            <h3 style={{ marginTop: 0 }}>Today’s Attendance</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thtd}>Name</th>
                  <th style={thtd}>Check-in</th>
                  <th style={thtd}>Check-out</th>
                </tr>
              </thead>
              <tbody>
                {todayRows.map(r => {
                  const emp = employees.find(e => e.id === r.employeeId)
                  const name = r.employeeName || (emp?.name || r.employeeId)
                  return (
                    <tr key={r.id}>
                      <td style={{...thtd, display:'flex',alignItems:'center',gap:8}}><Avatar name={name} size={20} />{name}</td>
                      <td style={thtd}>{r.checkIn ? new Date(r.checkIn).toLocaleTimeString() : '-'}</td>
                      <td style={thtd}>{r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : '-'}</td>
                    </tr>
                  )
                })}
                {todayRows.length === 0 && (
                  <tr><td style={thtd} colSpan={3}><EmptyState label="No attendance records yet" /></td></tr>
                )}
              </tbody>
            </table>
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button style={secondaryBtnStyle} onClick={async () => {
                if (useBackend) {
                  const url = csvUrl(company.id)
                  const a = document.createElement('a'); a.href = url; a.download = 'attendance_today.csv'; a.click()
                } else {
                  const rows = todayRows.map(r => {
                    const emp = employees.find(e => e.id === r.employeeId)
                    return [r.date, (r.employeeName || (emp?.name || r.employeeId)), r.checkIn ? new Date(r.checkIn).toLocaleTimeString() : '', r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : '']
                  })
                  const csv = [['Date','Name','CheckIn','CheckOut'], ...rows].map(row => row.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',')).join('\n')
                  const blob = new Blob([csv], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'attendance_today.csv'; a.click(); URL.revokeObjectURL(url)
                }
              }}>Export CSV</button>
              <button style={secondaryBtnStyle} onClick={() => {
                const rows = todayRows.map(r => {
                  const emp = employees.find(e => e.id === r.employeeId)
                  return [r.date, (r.employeeName || (emp?.name || r.employeeId)), r.checkIn ? new Date(r.checkIn).toLocaleTimeString() : '', r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : '']
                })
                exportToExcel({
                  rows,
                  headers: ['Date','Name','CheckIn','CheckOut'],
                  filename: 'attendance_today.xlsx'
                })
              }}>Export Excel</button>
              <button style={secondaryBtnStyle} onClick={() => {
                const rows = todayRows.map(r => {
                  const emp = employees.find(e => e.id === r.employeeId)
                  return [r.date, (r.employeeName || (emp?.name || r.employeeId)), r.checkIn ? new Date(r.checkIn).toLocaleTimeString() : '', r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : '']
                })
                exportToPDF({
                  rows,
                  headers: ['Date','Name','CheckIn','CheckOut'],
                  filename: 'attendance_today.pdf',
                  title: 'Today Attendance'
                })
              }}>Export PDF</button>
            </div>
          </div>
        )}

        {mode === 'employees' && (
          <div style={{ width: 720, maxWidth: '100%' }}>
            <h3 style={{ marginTop: 0 }}>Employees</h3>
            {!adminToken && useBackend && (
              <AdminLogin company={company} adminEmail={adminEmail} adminPassword={adminPassword} setAdminEmail={setAdminEmail} setAdminPassword={setAdminPassword} onLoggedIn={async ({ token }) => { setAuthToken(token); setAdminToken(token); setStatus('Logged in as admin'); pushSnack('Logged in as admin', 'success') }} />
            )}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thtd}>Name</th>
                  <th style={thtd}>Department</th>
                  <th style={thtd}>Shift</th>
                  <th style={thtd}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(e => (
                  <tr key={e.id}>
                    <td style={{...thtd, display:'flex',alignItems:'center',gap:8}}><Avatar name={e.name} size={24} />{e.name}</td>
                    <td style={thtd}>
                      {useBackend ? (
                        <select value={e.departmentId || ''} onChange={async (ev) => {
                          if (!adminToken) { setStatus('Admin login required'); pushSnack('Admin login required', 'error'); return }
                          await updateEmployeeRemote(company.id, e.id, { departmentId: ev.target.value || null })
                          setCompany(await getCompanyRemote(company.id))
                        }}>
                          <option value="">(none)</option>
                          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      ) : (
                        <span style={{ color: '#999' }}>Backend only</span>
                      )}
                    </td>
                    <td style={thtd}>
                      {useBackend ? (
                        <select value={e.shiftId || ''} onChange={async (ev) => {
                          if (!adminToken) { setStatus('Admin login required'); pushSnack('Admin login required', 'error'); return }
                          await updateEmployeeRemote(company.id, e.id, { shiftId: ev.target.value || null })
                          setCompany(await getCompanyRemote(company.id))
                        }}>
                          <option value="">(none)</option>
                          {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      ) : (
                        <span style={{ color: '#999' }}>Backend only</span>
                      )}
                    </td>
                    <td style={thtd}>
                      <button style={secondaryBtnStyle} onClick={async () => {
                        const name = prompt('New name', e.name)
                        if (!name) return
                        if (useBackend) {
                          if (!adminToken) { setStatus('Admin login required'); pushSnack('Admin login required', 'error'); return }
                          await renameEmployeeRemote(company.id, e.id, name)
                          setCompany(await getCompanyRemote(company.id))
                        } else {
                          renameEmployee(company.id, e.id, name)
                          setCompany(getCompany(company.id))
                        }
                        pushSnack('Employee renamed', 'success')
                      }}>Rename</button>
                      <button style={{ ...secondaryBtnStyle, marginLeft: 8 }} onClick={() => {
                        setConfirmModal({
                          open: true,
                          title: 'Remove Employee',
                          message: `Are you sure you want to remove ${e.name}? This cannot be undone.`,
                          confirmText: 'Remove',
                          cancelText: 'Cancel',
                          onConfirm: async () => {
                            setConfirmModal(m => ({ ...m, open: false }));
                            if (useBackend) {
                              if (!adminToken) { setStatus('Admin login required'); pushSnack('Admin login required', 'error'); return }
                              await deleteEmployeeRemote(company.id, e.id)
                              setCompany(await getCompanyRemote(company.id))
                            } else {
                              deleteEmployee(company.id, e.id)
                              setCompany(getCompany(company.id))
                            }
                            pushSnack('Employee removed', 'success')
                          },
                          onCancel: () => setConfirmModal(m => ({ ...m, open: false })),
                        });
                      }}>Remove</button>
                    </td>
                  </tr>
                ))}
                {employees.length === 0 && (
                  <tr><td style={thtd} colSpan={4}><EmptyState label="No employees yet" /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {mode === 'admin' && (
          <div style={{ width: 720, maxWidth: '100%', display: 'grid', gap: 12 }}>
            <h3 style={{ marginTop: 0 }}>Admin</h3>
            {!adminToken && useBackend && (
              <AdminLogin company={company} adminEmail={adminEmail} adminPassword={adminPassword} setAdminEmail={setAdminEmail} setAdminPassword={setAdminPassword} onLoggedIn={async ({ token }) => { setAuthToken(token); setAdminToken(token); setStatus('Logged in as admin'); pushSnack('Logged in as admin', 'success') }} />
            )}
            {adminToken && useBackend && (
              <ChangePasswordForm />
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label>Check-in ends at:</label>
              <input type="time" value={schedInEnd} onChange={e => setSchedInEnd(e.target.value)} />
              <label>Check-out starts at:</label>
              <input type="time" value={schedOutStart} onChange={e => setSchedOutStart(e.target.value)} />
              <button style={secondaryBtnStyle} onClick={async () => {
                if (useBackend) {
                  if (!adminToken) { setStatus('Admin login required'); pushSnack('Admin login required', 'error'); return }
                  await updateSettingsRemote(company.id, { schedule: { checkInEnd: schedInEnd, checkOutStart: schedOutStart } })
                  setCompany(await getCompanyRemote(company.id))
                } else {
                  setSchedule(company.id, { checkInEnd: schedInEnd, checkOutStart: schedOutStart })
                  setCompany(getCompany(company.id))
                }
                setStatus('Schedule saved'); pushSnack('Schedule saved', 'success')
              }}>Save Schedule</button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={primaryBtnStyle} onClick={() => {
                setMode('attendance'); setAttendanceType('in'); setRunning(true)
                if (autoTimer) { clearInterval(autoTimer); setAutoTimer(null) }
                const timer = setInterval(() => {
                  const now = new Date()
                  const inEnd = toTodayTime(schedInEnd)
                  const outStart = toTodayTime(schedOutStart)
                  if (now >= outStart) setAttendanceType('out')
                  else if (now >= inEnd) setAttendanceType('out')
                  else setAttendanceType('in')
                }, 30000)
                setAutoTimer(timer)
                setStatus('Day started: auto mode enabled'); pushSnack('Day started', 'success')
              }}>Start Day</button>
              <button style={secondaryBtnStyle} onClick={() => {
                if (autoTimer) { clearInterval(autoTimer); setAutoTimer(null) }
                setRunning(false); setStatus('Day ended'); pushSnack('Day ended', 'info')
              }}>End Day</button>
              <button style={secondaryBtnStyle} onClick={() => {
                setConfirmModal({
                  open: true,
                  title: 'Mark Absences for Today',
                  message: 'Are you sure you want to close the day and mark absences for all employees who did not check in? This cannot be undone.',
                  confirmText: 'Mark Absences',
                  cancelText: 'Cancel',
                  onConfirm: async () => {
                    setConfirmModal(m => ({ ...m, open: false }));
                    if (useBackend) {
                      if (!adminToken) { setStatus('Admin login required'); pushSnack('Admin login required', 'error'); return }
                      await closeDayRemote(company.id);
                      setCompany(await getCompanyRemote(company.id));
                    } else {
                      closeDayLocal(company.id);
                      setCompany(getCompany(company.id));
                    }
                    setStatus('Absences marked for today');
                    pushSnack('Absences marked for today', 'success');
                  },
                  onCancel: () => setConfirmModal(m => ({ ...m, open: false })),
                });
              }}>Close Day (mark absences)</button>
            </div>
            <div>
              <button style={secondaryBtnStyle} onClick={() => setUseBackend(b => !b)}>
                Storage: {useBackend ? 'Backend API' : 'Browser only'} (toggle)
              </button>
            </div>

            {useBackend && (
              <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                <h4 style={{ margin: '8px 0' }}>Departments</h4>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input placeholder="Department name" id="depName" style={{ padding: 6, border: '1px solid #ddd', borderRadius: 6 }} />
                  <button style={secondaryBtnStyle} onClick={async () => {
                    if (!adminToken) { setStatus('Admin login required'); return }
                    const input = document.getElementById('depName')
                    const val = input && input.value.trim()
                    if (!val) return
                    await createDepartmentRemote(company.id, val)
                    setDepartments(await listDepartmentsRemote(company.id))
                    input.value = ''
                    pushSnack('Department added', 'success')
                  }}>Add</button>
                </div>
                <ul>
                  {departments.map(d => (
                    <li key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{d.name}</span>
                      <button style={secondaryBtnStyle} onClick={() => {
                        setConfirmModal({
                          open: true,
                          title: 'Delete Department',
                          message: `Are you sure you want to delete the department "${d.name}"? This cannot be undone.`,
                          confirmText: 'Delete',
                          cancelText: 'Cancel',
                          onConfirm: async () => {
                            setConfirmModal(m => ({ ...m, open: false }));
                            if (!adminToken) { setStatus('Admin login required'); return; }
                            await deleteDepartmentRemote(company.id, d.id);
                            setDepartments(await listDepartmentsRemote(company.id));
                            pushSnack('Department deleted', 'success');
                          },
                          onCancel: () => setConfirmModal(m => ({ ...m, open: false })),
                        });
                      }}>Delete</button>
                    </li>
                  ))}
                  {departments.length === 0 && <li><EmptyState label="No departments" style={{padding:12}} /></li>}
                </ul>

                <h4 style={{ margin: '8px 0' }}>Shifts</h4>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input placeholder="Shift name" id="shiftName" style={{ padding: 6, border: '1px solid #ddd', borderRadius: 6 }} />
                  <label>Check-in ends:</label>
                  <input type="time" id="shiftIn" defaultValue={schedInEnd} />
                  <label>Check-out starts:</label>
                  <input type="time" id="shiftOut" defaultValue={schedOutStart} />
                  <button style={secondaryBtnStyle} onClick={async () => {
                    if (!adminToken) { setStatus('Admin login required'); return }
                    const nameEl = document.getElementById('shiftName')
                    const inEl = document.getElementById('shiftIn')
                    const outEl = document.getElementById('shiftOut')
                    const name = nameEl && nameEl.value.trim()
                    if (!name) return
                    await createShiftRemote(company.id, { name, schedule: { checkInEnd: inEl.value, checkOutStart: outEl.value } })
                    setShifts(await listShiftsRemote(company.id))
                    nameEl.value = ''
                    pushSnack('Shift added', 'success')
                  }}>Add</button>
                </div>
                <ul>
                  {shifts.map(s => (
                    <li key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{s.name} — in ≤ {s.schedule?.checkInEnd} | out ≥ {s.schedule?.checkOutStart}</span>
                      <button style={secondaryBtnStyle} onClick={() => {
                        setConfirmModal({
                          open: true,
                          title: 'Delete Shift',
                          message: `Are you sure you want to delete the shift "${s.name}"? This cannot be undone.`,
                          confirmText: 'Delete',
                          cancelText: 'Cancel',
                          onConfirm: async () => {
                            setConfirmModal(m => ({ ...m, open: false }));
                            if (!adminToken) { setStatus('Admin login required'); return; }
                            await deleteShiftRemote(company.id, s.id);
                            setShifts(await listShiftsRemote(company.id));
                            pushSnack('Shift deleted', 'success');
                          },
                          onCancel: () => setConfirmModal(m => ({ ...m, open: false })),
                        });
                      }}>Delete</button>
                    </li>
                  ))}
                  {shifts.length === 0 && <li><EmptyState label="No shifts" style={{padding:12}} /></li>}
                </ul>
              </div>
            )}
          </div>
        )}

        {mode === 'history' && (
          <div style={{ width: 720, maxWidth: '100%', display: 'grid', gap: 10 }}>
            <h3 style={{ marginTop: 0 }}>History</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label>Start:</label>
              <input type="date" value={historyStart} onChange={e => setHistoryStart(e.target.value)} />
              <label>End:</label>
              <input type="date" value={historyEnd} onChange={e => setHistoryEnd(e.target.value)} />
              <button style={secondaryBtnStyle} onClick={async () => {
                if (useBackend) {
                  const rows = await listAttendanceRangeRemote(company.id, historyStart, historyEnd)
                  setHistoryRows(rows)
                } else {
                  const rows = listAttendanceRange(company.id, historyStart, historyEnd)
                  setHistoryRows(rows)
                }
              }}>Load</button>
              <button style={secondaryBtnStyle} onClick={() => {
                const url = csvUrl(company.id, historyStart, historyEnd)
                const a = document.createElement('a'); a.href = url; a.download = 'attendance.csv'; a.click()
              }}>Export CSV</button>
              <button style={secondaryBtnStyle} onClick={() => {
              const html = `<!doctype html><html><head><title>Attendance</title><style>body{font-family:system-ui,Arial,sans-serif;padding:16px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:6px;font-size:12px}</style></head><body><h3>Attendance ${historyStart||''} ${historyEnd?(' - '+historyEnd):''}</h3><table><thead><tr><th>Date</th><th>Name</th><th>Check-in</th><th>Check-out</th><th>Late</th><th>Early</th><th>Absent</th></tr></thead><tbody>${historyRows.map(r=>{const emp=employees.find(e=>e.id===r.employeeId);return `<tr><td>${r.date}</td><td>${r.employeeName||(emp?.name||r.employeeId)}</td><td>${r.checkIn?new Date(r.checkIn).toLocaleTimeString():''}</td><td>${r.checkOut?new Date(r.checkOut).toLocaleTimeString():''}</td><td>${r.late?'late':''}</td><td>${r.earlyLeave?'early':''}</td><td>${r.absent?'absent':''}</td></tr>`}).join('')}</tbody></table><script>window.print()</script></body></html>`
                const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close() }
              }}>Print</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thtd}>Date</th>
                  <th style={thtd}>Name</th>
                  <th style={thtd}>Check-in</th>
                  <th style={thtd}>Check-out</th>
                  <th style={thtd}>Late</th>
                  <th style={thtd}>Early</th>
                  <th style={thtd}>Absent</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map(r => {
                  const emp = employees.find(e => e.id === r.employeeId)
                  const name = r.employeeName || (emp?.name || r.employeeId)
                  return (
                    <tr key={r.id}>
                      <td style={thtd}>{r.date}</td>
                      <td style={{...thtd, display:'flex',alignItems:'center',gap:8}}><Avatar name={name} size={18} />{name}</td>
                      <td style={thtd}>{r.checkIn ? new Date(r.checkIn).toLocaleTimeString() : '-'}</td>
                      <td style={thtd}>{r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : '-'}</td>
                      <td style={thtd}>{r.late ? 'late' : ''}</td>
                      <td style={thtd}>{r.earlyLeave ? 'early' : ''}</td>
                      <td style={thtd}>{r.absent ? 'absent' : ''}</td>
                    </tr>
                  )
                })}
                {historyRows.length === 0 && (<tr><td style={thtd} colSpan={7}><EmptyState label="No history records" /></td></tr>)}
              </tbody>
            </table>
          </div>
        )}

        {mode === 'dashboard' && (
          <div style={{ width: 720, maxWidth: '100%', display: 'grid', gap: 16 }}>
            <h3 style={{ marginTop: 0 }}>Dashboard</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <h4 style={{ margin: '0 0 8px' }}>Today status</h4>
                {(() => {
                  const present = todayRows.filter(r => r.checkIn).length
                  const late = todayRows.filter(r => r.late).length
                  const early = todayRows.filter(r => r.earlyLeave).length
                  const absent = todayRows.filter(r => r.absent).length
                  const data = { labels: ['Present','Late','Early','Absent'], datasets: [{ label: 'Count', data: [present, late, early, absent], backgroundColor: ['#4caf50','#ff9800','#03a9f4','#f44336'] }] }
                  return <Bar data={data} options={{ responsive: true, plugins: { legend: { display: false } } }} />
                })()}
              </div>
              <div>
                <h4 style={{ margin: '0 0 8px' }}>Last 7 days present</h4>
                {(() => {
                  const days = [...Array(7)].map((_,i)=>{const d=new Date(); d.setDate(d.getDate()-i); return d.toISOString().slice(0,10)}).reverse()
                  const counts = days.map(d => historyRows.filter(r => r.date===d && r.checkIn).length)
                  const data = { labels: days, datasets: [{ label: 'Present', data: counts, borderColor: '#4caf50', backgroundColor: 'rgba(76,175,80,0.2)' }] }
                  return <Line data={data} options={{ responsive: true, plugins: { legend: { position: 'bottom' } } }} />
                })()}
              </div>
            </div>
          </div>
        )}

        {mode === 'print' && (
          <div style={{ width: 720, maxWidth: '100%', display: 'grid', gap: 10 }}>
            <h3 style={{ marginTop: 0 }}>Printable Summary</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label>Start:</label>
              <input type="date" value={historyStart} onChange={e => setHistoryStart(e.target.value)} />
              <label>End:</label>
              <input type="date" value={historyEnd} onChange={e => setHistoryEnd(e.target.value)} />
              <button style={secondaryBtnStyle} onClick={async () => {
                if (useBackend) {
                  const rows = await listAttendanceRangeRemote(company.id, historyStart, historyEnd)
                  setHistoryRows(rows)
                } else {
                  const rows = listAttendanceRange(company.id, historyStart, historyEnd)
                  setHistoryRows(rows)
                }
              }}>Load</button>
              <button style={primaryBtnStyle} onClick={() => {
                const html = `<!doctype html><html><head><title>Attendance</title><style>body{font-family:system-ui,Arial,sans-serif;padding:16px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:6px;font-size:12px}</style></head><body><h3>Attendance ${historyStart||''} ${historyEnd?(' - '+historyEnd):''}</h3><table><thead><tr><th>Date</th><th>Name</th><th>Check-in</th><th>Check-out</th><th>Late</th><th>Early</th><th>Absent</th></tr></thead><tbody>${historyRows.map(r=>{const emp=employees.find(e=>e.id===r.employeeId);return `<tr><td>${r.date}</td><td>${emp?.name||r.employeeId}</td><td>${r.checkIn?new Date(r.checkIn).toLocaleTimeString():''}</td><td>${r.checkOut?new Date(r.checkOut).toLocaleTimeString():''}</td><td>${r.late?'late':''}</td><td>${r.earlyLeave?'early':''}</td><td>${r.absent?'absent':''}</td></tr>`}).join('')}</tbody></table><script>window.print()</script></body></html>`
                const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close() }
              }}>Print</button>
            </div>
          </div>
        )}

        {!modelsLoaded && (['attendance','register'].includes(mode)) && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, border: '4px solid #eee', borderTop: '4px solid #2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 14, color: '#b36b00' }}>Loading face recognition models...</span>
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          </div>
        )}
        {!modelsLoaded && !(['attendance','register'].includes(mode)) && (
          <p style={{ marginTop: 8, fontSize: 13, color: '#b36b00' }}>
            Note: Face models are not present. Add models under <code>public/models</code>.
          </p>
        )}
      </main>
    </div>
    </>
  )
}


function Onboarding({ useBackend, setUseBackend, onCreated, onLoggedIn, secondaryBtnStyle, primaryBtnStyle, palette }) {
  const [companyName, setCompanyName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState('Create your company and first admin')
  const [companyIdToLogin, setCompanyIdToLogin] = useState('')
  const { push: pushSnack } = useSnackbar()
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <div style={{ width: 420, maxWidth: '100%', border: '1px solid #eee', borderRadius: 8, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Setup</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: (palette?.muted || '#666') }}>Storage:</span>
            <button style={secondaryBtnStyle || { padding:'10px 14px', borderRadius:6, border:'1px solid #ddd', background:'#fff', color:'#222', cursor:'pointer' }} onClick={() => setUseBackend(b => !b)}>
              {useBackend ? 'Backend API' : 'Browser only'} (toggle)
            </button>
          </div>
          <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Company name" style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
          <input value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Admin name" style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
          <input value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="Admin email" style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type={showPassword ? 'text' : 'password'} value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Admin password" style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6, flex: 1 }} />
            <button type="button" style={{ padding: '6px 8px', border: 'none', background: 'none', cursor: 'pointer' }} onClick={() => setShowPassword(v => !v)}>{showPassword ? 'Hide' : 'Show'}</button>
          </div>
          <button style={primaryBtnStyle || { padding:'10px 14px', borderRadius:6, border:'1px solid #2b6cb0', background:'#2b6cb0', color:'#fff', cursor:'pointer' }} onClick={() => {
            const name = companyName.trim() || 'Company'
            const admin = { name: adminName.trim() || 'Admin', email: adminEmail.trim() || '', password: adminPassword.trim() || 'admin' }
            setStatus('Creating company...')
            onCreated({ name, admin })
          }}>Create Company</button>
          <div style={{ fontSize: 12, color: '#666' }}>
            {useBackend
              ? 'Backend mode: After creating, open the Admin tab to log in with the admin email/password.'
              : 'Browser-only mode: Data stays in this browser. To use admin login, toggle to Backend before creating.'}
          </div>
          {useBackend && (
            <div style={{ borderTop: '1px solid #eee', marginTop: 12, paddingTop: 12, display: 'grid', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Login to existing company</h3>
              <div style={{ display: 'grid', gap: 8 }}>
                <input value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="Admin email" style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type={showPassword ? 'text' : 'password'} value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Password" style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6, flex: 1 }} />
                  <button type="button" style={{ padding: '6px 8px', border: 'none', background: 'none', cursor: 'pointer' }} onClick={() => setShowPassword(v => !v)}>{showPassword ? 'Hide' : 'Show'}</button>
                </div>
                <button style={secondaryBtnStyle || { padding:'10px 14px', borderRadius:6, border:'1px solid #ddd', background:'#fff', color:'#222', cursor:'pointer' }} onClick={async () => {
                  try {
                    const session = await loginRemote(null, adminEmail.trim(), adminPassword)
                    onLoggedIn(session)
                  } catch (e) { setStatus('' + e.message); pushSnack('Login failed', 'error') }
                }}>Login</button>
              </div>
            </div>
          )}
          <div style={{ fontSize: 13, color: '#666' }}>{status}</div>
        </div>
      </div>
    </div>
  )
}

function toTodayTime(hhmm) {
  const [h,m] = (hhmm||'00:00').split(':').map(Number)
  const d = new Date()
  d.setHours(h||0, m||0, 0, 0)
  return d
}

function AdminLogin({ company, adminEmail, adminPassword, setAdminEmail, setAdminPassword, onLoggedIn, secondaryBtnStyle }) {
  const { push: pushSnack } = useSnackbar()
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(() => {
    return window.localStorage.getItem('officattend_remember') === '1';
  });
  // Email autocomplete: load and update email list
  const [emailOptions, setEmailOptions] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem('officattend_admin_emails' )|| '[]')
    } catch {
      return []
    }
  });
  // Add email to localStorage if login is successful
  const addEmailOption = (email) => {
    if (!email) return;
    setEmailOptions(prev => {
      if (prev.includes(email)) return prev;
      const updated = [email, ...prev].slice(0, 10); // keep max 10
      window.localStorage.setItem('officattend_admin_emails', JSON.stringify(updated));
      return updated;
    });
  };
  useEffect(() => {
    if (rememberMe) window.localStorage.setItem('officattend_remember', '1');
    else window.localStorage.removeItem('officattend_remember');
  }, [rememberMe]);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
      <input
        value={adminEmail}
        onChange={e => setAdminEmail(e.target.value)}
        placeholder="Admin email"
        style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
        list="admin-email-list"
        autoComplete="on"
      />
      <datalist id="admin-email-list">
        {emailOptions.map(email => <option value={email} key={email} />)}
      </datalist>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input type={showPassword ? 'text' : 'password'} value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Password" style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6, flex: 1 }} />
        <button type="button" style={{ padding: '6px 8px', border: 'none', background: 'none', cursor: 'pointer' }} onClick={() => setShowPassword(v => !v)}>{showPassword ? 'Hide' : 'Show'}</button>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
        <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} /> Remember Me
      </label>
      <button style={secondaryBtnStyle || { padding:'10px 14px', borderRadius:6, border:'1px solid #ddd', background:'#fff', color:'#222', cursor:'pointer' }} onClick={async () => {
        try {
          const session = await loginRemote(null, adminEmail, adminPassword)
          if (rememberMe && session?.token) {
            window.localStorage.setItem('officattend_admin_token', session.token)
          } else {
            window.localStorage.removeItem('officattend_admin_token')
          }
          addEmailOption(adminEmail);
          onLoggedIn(session)
        } catch (e) { pushSnack('Login failed', 'error') }
      }}>Login</button>
    </div>
  )
}
