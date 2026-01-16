import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSnackbar } from './snackbar.jsx'
import * as faceapi from 'face-api.js'
import { createCompany, getSession, getCompany, addEmployee, listEmployees, recordAttendance, listTodayAttendance, serializeDescriptor, renameEmployee, deleteEmployee, setSchedule, setSession, listAttendanceRange } from './store.js'
import { health, createCompanyRemote, getCompanyRemote, addEmployeeRemote, listEmployeesRemote, recordAttendanceRemote, listTodayAttendanceRemote, renameEmployeeRemote, deleteEmployeeRemote, updateSettingsRemote, csvUrl, loginRemote, listAttendanceRangeRemote, closeDayRemote, setAuthToken, listDepartmentsRemote, createDepartmentRemote, deleteDepartmentRemote, listShiftsRemote, createShiftRemote, deleteShiftRemote, updateEmployeeRemote } from './api.js'
import { Bar, Line } from 'react-chartjs-2'
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js'
ChartJS.register(BarElement, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

export default function App() {
  const [mode, setMode] = useState('attendance')
  const [status, setStatus] = useState('Loading...')
  const { push: pushSnack } = useSnackbar()
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [ssdLoaded, setSsdLoaded] = useState(false)
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
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        try { await videoRef.current.play() } catch {}
      }
      setStatus('Camera ready')
      pushSnack('Camera ready', 'success')
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
  useEffect(() => { initCamera() }, [])

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
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: '100vh', background: palette.bg, color: palette.text }}>
      <header style={{ padding: '12px 16px', borderBottom: `1px solid ${palette.border}`, background: palette.headerBg, display: 'flex', gap: 12, alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>OfficAttend</h1>
        <nav style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setMode('attendance')} style={btnStyle(mode === 'attendance')}>Attendance</button>
          <button onClick={() => setMode('register')} style={btnStyle(mode === 'register')}>Register</button>
          <button onClick={() => setMode('records')} style={btnStyle(mode === 'records')}>Today</button>
          <button onClick={() => setMode('history')} style={btnStyle(mode === 'history')}>History</button>
          <button onClick={() => setMode('dashboard')} style={btnStyle(mode === 'dashboard')}>Dashboard</button>
          <button onClick={() => setMode('print')} style={btnStyle(mode === 'print')}>Print</button>
          <button onClick={() => setMode('employees')} style={btnStyle(mode === 'employees')}>Employees</button>
          <button onClick={() => setMode('admin')} style={btnStyle(mode === 'admin')}>Admin</button>
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} style={secondaryBtnStyle}>{theme === 'dark' ? 'Light' : 'Dark'} Mode</button>
          <div style={{ fontSize: 13, color: palette.muted }}>{status}</div>
          <button onClick={handleLogout} style={secondaryBtnStyle}>Logout</button>
        </div>
      </header>
      <main style={{ display: 'grid', placeItems: 'center', padding: 16, gap: 16 }}>
        {['attendance','register'].includes(mode) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start', width: '100%', maxWidth: 1040 }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <video ref={videoRef} width={720} height={405} style={{ width: '100%', background: '#000', borderRadius: 8 }} autoPlay muted playsInline />
              <canvas ref={canvasRef} width={720} height={405} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', borderRadius: 8, pointerEvents: 'none', zIndex: 2 }} />
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
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
                  return (
                    <tr key={r.id}>
                      <td style={thtd}>{r.employeeName || (emp?.name || r.employeeId)}</td>
                      <td style={thtd}>{r.checkIn ? new Date(r.checkIn).toLocaleTimeString() : '-'}</td>
                      <td style={thtd}>{r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : '-'}</td>
                    </tr>
                  )
                })}
                {todayRows.length === 0 && (
                  <tr><td style={thtd} colSpan={3}>No records yet</td></tr>
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
                    <td style={thtd}>{e.name}</td>
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
                      <button style={{ ...secondaryBtnStyle, marginLeft: 8 }} onClick={async () => {
                        if (!confirm('Remove employee?')) return
                        if (useBackend) {
                          if (!adminToken) { setStatus('Admin login required'); pushSnack('Admin login required', 'error'); return }
                          await deleteEmployeeRemote(company.id, e.id)
                          setCompany(await getCompanyRemote(company.id))
                        } else {
                          deleteEmployee(company.id, e.id)
                          setCompany(getCompany(company.id))
                        }
                        pushSnack('Employee removed', 'success')
                      }}>Remove</button>
                    </td>
                  </tr>
                ))}
                {employees.length === 0 && (
                  <tr><td style={thtd} colSpan={4}>No employees yet</td></tr>
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
              <button style={secondaryBtnStyle} onClick={async () => {
                if (useBackend) { if (!adminToken) { setStatus('Admin login required'); pushSnack('Admin login required', 'error'); return } await closeDayRemote(company.id) ; setCompany(await getCompanyRemote(company.id)) }
                else { closeDayLocal(company.id); setCompany(getCompany(company.id)) }
                setStatus('Absences marked for today'); pushSnack('Absences marked for today', 'success')
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
                      <button style={secondaryBtnStyle} onClick={async () => {
                        if (!adminToken) { setStatus('Admin login required'); return }
                        await deleteDepartmentRemote(company.id, d.id)
                        setDepartments(await listDepartmentsRemote(company.id))
                        pushSnack('Department deleted', 'success')
                      }}>Delete</button>
                    </li>
                  ))}
                  {departments.length === 0 && <li style={{ color: '#999' }}>(none)</li>}
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
                      <button style={secondaryBtnStyle} onClick={async () => {
                        if (!adminToken) { setStatus('Admin login required'); return }
                        await deleteShiftRemote(company.id, s.id)
                        setShifts(await listShiftsRemote(company.id))
                        pushSnack('Shift deleted', 'success')
                      }}>Delete</button>
                    </li>
                  ))}
                  {shifts.length === 0 && <li style={{ color: '#999' }}>(none)</li>}
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
                  return (
                    <tr key={r.id}>
                      <td style={thtd}>{r.date}</td>
                      <td style={thtd}>{r.employeeName || (emp?.name || r.employeeId)}</td>
                      <td style={thtd}>{r.checkIn ? new Date(r.checkIn).toLocaleTimeString() : '-'}</td>
                      <td style={thtd}>{r.checkOut ? new Date(r.checkOut).toLocaleTimeString() : '-'}</td>
                      <td style={thtd}>{r.late ? 'late' : ''}</td>
                      <td style={thtd}>{r.earlyLeave ? 'early' : ''}</td>
                      <td style={thtd}>{r.absent ? 'absent' : ''}</td>
                    </tr>
                  )
                })}
                {historyRows.length === 0 && (<tr><td style={thtd} colSpan={7}>No records</td></tr>)}
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

        {!modelsLoaded && !(['attendance','register'].includes(mode)) && (
          <p style={{ marginTop: 8, fontSize: 13, color: '#b36b00' }}>
            Note: Face models are not present. Add models under <code>public/models</code>.
          </p>
        )}
      </main>
    </div>
  )
}


function Onboarding({ useBackend, setUseBackend, onCreated, onLoggedIn, secondaryBtnStyle, primaryBtnStyle, palette }) {
  const [companyName, setCompanyName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
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
          <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Admin password" style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
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
                <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Password" style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
                <button style={secondaryBtnStyle || { padding:'10px 14px', borderRadius:6, border:'1px solid #ddd', background:'#fff', color:'#222', cursor:'pointer' }} onClick={async () => {
                  try {
                    const session = await loginRemote(null, adminEmail.trim(), adminPassword)
                    onLoggedIn(session)
                  } catch (e) { setStatus(String(e.message||'Login failed')); pushSnack('Login failed', 'error') }
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
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
      <input value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="Admin email" style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
      <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Password" style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }} />
      <button style={secondaryBtnStyle || { padding:'10px 14px', borderRadius:6, border:'1px solid #ddd', background:'#fff', color:'#222', cursor:'pointer' }} onClick={async () => {
        try {
          const session = await loginRemote(null, adminEmail, adminPassword)
          onLoggedIn(session)
        } catch (e) { pushSnack('Login failed', 'error') }
      }}>Login</button>
    </div>
  )
}
