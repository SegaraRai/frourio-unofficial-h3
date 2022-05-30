import fs from 'fs'
import path from 'path'
import { writeCode } from './writeCode'

export default async (dir: string) => {
  const isEmptyDir = (await fs.promises.readdir(dir)).length === 0

  const indexFilePath = path.join(dir, 'index.ts')

  if (isEmptyDir && !fs.existsSync(indexFilePath)) {
    await writeCode(
      indexFilePath,
      `export type Methods = {
  get: {
    resBody: string
  }
}
`
    )
  }

  const controllerFilePath = path.join(dir, 'controller.ts')

  if (isEmptyDir && !fs.existsSync(controllerFilePath)) {
    await writeCode(
      controllerFilePath,
      `import { defineController } from './$relay'

export default defineController(() => ({
  get: () => ({ status: 200, body: 'Hello' })
}))
`
    )
  }

  const hooksFilePath = path.join(dir, 'hooks.ts')

  if (fs.existsSync(hooksFilePath) && !(await fs.promises.readFile(hooksFilePath, 'utf8'))) {
    await writeCode(
      hooksFilePath,
      `import { defineHooks } from './$relay'

export default defineHooks(() => ({
  onRequest: (req, reply, done) => {
    console.log('Directory level onRequest hook:', req.url)
    done()
  }
}))
`
    )
  }
}
