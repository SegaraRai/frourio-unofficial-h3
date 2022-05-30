import fs from 'fs'
import path from 'path'

export default async (dir: string) => {
  const isEmptyDir = (await fs.promises.readdir(dir)).length === 0

  const indexFilePath = path.join(dir, 'index.ts')

  if (isEmptyDir && !fs.existsSync(indexFilePath)) {
    await fs.promises.writeFile(
      indexFilePath,
      `export type Methods = {
  get: {
    resBody: string
  }
}
`,
      'utf8'
    )
  }

  const controllerFilePath = path.join(dir, 'controller.ts')

  if (isEmptyDir && !fs.existsSync(controllerFilePath)) {
    await fs.promises.writeFile(
      controllerFilePath,
      `import { defineController } from './$relay'

export default defineController(() => ({
  get: () => ({ status: 200, body: 'Hello' })
}))
`,
      'utf8'
    )
  }

  const hooksFilePath = path.join(dir, 'hooks.ts')

  if (fs.existsSync(hooksFilePath) && !(await fs.promises.readFile(hooksFilePath, 'utf8'))) {
    await fs.promises.writeFile(
      hooksFilePath,
      `import { defineHooks } from './$relay'

export default defineHooks(() => ({
  onRequest: (req, reply, done) => {
    console.log('Directory level onRequest hook:', req.url)
    done()
  }
}))
`,
      'utf8'
    )
  }
}
