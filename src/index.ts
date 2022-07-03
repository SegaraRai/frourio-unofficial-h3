import crypto from 'crypto'
import fs from 'fs'
import minimist from 'minimist'
import buildCommon from './buildCommonFile'
import buildServer from './buildServerFile'
import clean from './cleanStaleRoutes'
import cleanAll from './cleanAllStaleRoutes'
import watch from './watchInputDir'
import { writeCode, writeCode2 } from './writeCode'

function createAsyncSerializer(): (fn: (latest: boolean) => void | Promise<void>) => void {
  let promise = Promise.resolve()
  return fn => {
    // TODO: error handling
    const newPromise: Promise<void> = promise.then(() => fn(promise === newPromise))
    promise = newPromise
  }
}

export const run = async (args: string[]) => {
  const argv = minimist(args, {
    string: ['version', 'watch', 'project'],
    alias: { v: 'version', w: 'watch', p: 'project' }
  })
  const dir = '.'

  if (argv.version !== undefined) {
    console.log(`v${require('../package.json').version}`)
  } else if (argv.watch !== undefined) {
    const cache = new Map<string, string>()
    const writeCodeCached = async (filePath: string, text: string) => {
      const hash = crypto.createHash('sha256').update(text).digest('hex')
      if (cache.get(filePath) === hash) {
        return
      }
      cache.set(filePath, hash)
      await writeCode(filePath, text, async (fp, code, charset) => {
        if (cache.get(filePath) !== hash) {
          // stale
          return
        }
        await fs.promises.writeFile(fp, code, charset)
      })
    }
    const writeCode2Cached = ({
      filePath,
      text
    }: {
      readonly filePath: string
      readonly text: string
    }) => {
      return writeCodeCached(filePath, text)
    }

    await cleanAll(dir)
    await writeCode2Cached(buildCommon(dir))
    await writeCode2Cached(await buildServer(dir, argv.project, writeCodeCached))
    const callSerialized = createAsyncSerializer()
    watch(dir, (event, file) =>
      callSerialized(async latest => {
        await clean(dir, event, file)
        if (latest) {
          // we do not have to write $common.ts as it is static for now
          await writeCode2Cached(await buildServer(dir, argv.project, writeCodeCached))
        }
      })
    )
  } else {
    await cleanAll(dir)
    await writeCode2(buildCommon(dir))
    await writeCode2(await buildServer(dir, argv.project))
  }
}
