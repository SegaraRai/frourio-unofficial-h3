import fs from 'fs'
import { version } from '../package.json'
import { run } from '../src'
import build from '../src/buildServerFile'
import aspidaBuild from 'aspida/dist/buildTemplate'

test('version command', async () => {
  const spyLog = jest.spyOn(console, 'log')
  const args = ['--version']

  await run(args)
  expect(console.log).toHaveBeenCalledWith(`v${version}`)

  spyLog.mockRestore()
})

test('build', async () => {
  const inputDir = 'servers'

  const inputs = (await fs.promises.readdir(inputDir, { withFileTypes: true }))
    .filter(d => d.isDirectory())
    .map(d => `${inputDir}/${d.name}`)

  for (const input of inputs) {
    const result = await build(input)
    expect(result.text).toBe(
      (await fs.promises.readFile(result.filePath, 'utf8')).replace(/\r/g, '')
    )

    // aspida is synchronous
    const [target] = aspidaBuild({
      input: `${input}/api`,
      baseURL: '',
      trailingSlash: false,
      outputEachDir: false,
      outputMode: 'all'
    })
    expect(target.text).toBe(
      (await fs.promises.readFile(target.filePath, 'utf8')).replace(/\r/g, '')
    )
  }
}, 20_000)
