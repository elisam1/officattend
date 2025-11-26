const fs = require('fs')
const path = require('path')
const https = require('https')

const BASE = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights'
const targetDir = path.join(__dirname, '..', 'public', 'models')

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    ensureDir(path.dirname(dest))
    const file = fs.createWriteStream(dest)
    const handle = (u) => {
      https.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Follow redirects
          handle(res.headers.location)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error('HTTP ' + res.statusCode + ' for ' + u))
          return
        }
        res.pipe(file)
        file.on('finish', () => file.close(resolve))
      }).on('error', reject)
    }
    handle(url)
  })
}

async function fetchManifest(name) {
  const url = `${BASE}/${name}`
  const dest = path.join(targetDir, name)
  await download(url, dest)
  const json = JSON.parse(fs.readFileSync(dest, 'utf-8'))
  return json
}

async function fetchWeightsFromManifest(manifest) {
  // Support both legacy and current manifest formats
  let groups = []
  if (Array.isArray(manifest)) {
    groups = manifest
  } else if (manifest.weightsManifest) {
    groups = manifest.weightsManifest
  } else if (manifest.weights_manifest) {
    groups = manifest.weights_manifest
  }
  for (const g of groups) {
    const paths = g.paths || g.files || []
    for (const rel of paths) {
      const url = `${BASE}/${rel}`
      const dest = path.join(targetDir, rel)
      process.stdout.write(`Downloading ${rel}...\n`)
      await download(url, dest)
    }
  }
}

async function run() {
  ensureDir(targetDir)
  const manifests = [
    'tiny_face_detector_model-weights_manifest.json',
    'face_landmark_68_model-weights_manifest.json',
    'face_recognition_model-weights_manifest.json',
    // Optional higher-accuracy detector
    'ssd_mobilenetv1_model-weights_manifest.json',
  ]
  for (const m of manifests) {
    process.stdout.write(`Fetching manifest ${m}...\n`)
    const manifest = await fetchManifest(m)
    await fetchWeightsFromManifest(manifest)
  }
  console.log('All face-api.js model files downloaded to', targetDir)
}

run().catch(err => {
  console.error('Failed to fetch models:', err)
  process.exit(1)
})
