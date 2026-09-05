import { copyFile } from 'node:fs/promises'

// GitHub Pages serves 404.html for direct SPA paths. Keeping the requested
// path lets React Router resolve /invite/:token after an email confirmation.
await copyFile('dist/index.html', 'dist/404.html')
