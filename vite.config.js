import { defineConfig } from 'vite'
import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'

// Plugin to copy models and vendor files to dist folder
function copyAssets() {
  return {
    name: 'copy-assets',
    closeBundle() {
      // Copy face detection models
      const modelsSource = join(process.cwd(), 'public', 'models')
      const modelsDest = join(process.cwd(), 'dist', 'models')
      
      if (existsSync(modelsSource)) {
        mkdirSync(modelsDest, { recursive: true })
        const files = readdirSync(modelsSource)
        for (const file of files) {
          copyFileSync(join(modelsSource, file), join(modelsDest, file))
        }
        console.log('✓ Copied face detection models to dist/models')
      }
      
      // Copy OpenCV.js from node_modules
      const opencvSource = join(process.cwd(), 'node_modules', '@techstark', 'opencv-js', 'dist', 'opencv.js')
      const vendorDest = join(process.cwd(), 'dist', 'vendor')
      
      if (existsSync(opencvSource)) {
        mkdirSync(vendorDest, { recursive: true })
        copyFileSync(opencvSource, join(vendorDest, 'opencv.js'))
        console.log('✓ Copied OpenCV.js to dist/vendor')
      }
    }
  }
}

export default defineConfig({
  plugins: [copyAssets()],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})
