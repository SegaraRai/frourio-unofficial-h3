import fs from 'fs'
import rimraf from 'rimraf'
import createDefaultFilesIfNotExists from '../src/createDefaultFilesIfNotExists'

test('createDefaultFilesIfNotExists', async () => {
  const dir = 'tmp'
  await fs.promises.mkdir(dir)
  await createDefaultFilesIfNotExists(dir)

  expect(await fs.promises.readFile(`${dir}/index.ts`, 'utf8')).toBe(`export type Methods = {
  get: {
    resBody: string
  }
}
`)

  expect(await fs.promises.readFile(`${dir}/controller.ts`, 'utf8'))
    .toBe(`import { defineController } from './$relay'

export default defineController(() => ({
  get: () => ({ status: 200, body: 'Hello' })
}))
`)

  expect(fs.existsSync(`${dir}/hooks.ts`)).toBeFalsy()

  await fs.promises.writeFile(`${dir}/hooks.ts`, '', 'utf8')
  await createDefaultFilesIfNotExists(dir)

  expect(await fs.promises.readFile(`${dir}/hooks.ts`, 'utf8')).toBe(
    `import { defineHooks } from './$relay'

export default defineHooks(() => ({
  onRequest: (req, reply, done) => {
    console.log('Directory level onRequest hook:', req.url)
    done()
  }
}))
`
  )
  rimraf.sync(dir)

  await fs.promises.mkdir(dir)
  await fs.promises.writeFile(`${dir}/$test.ts`, '// test file')
  await createDefaultFilesIfNotExists(dir)
  expect(await fs.promises.readdir(dir)).toEqual(['$test.ts'])

  rimraf.sync(dir)
})
