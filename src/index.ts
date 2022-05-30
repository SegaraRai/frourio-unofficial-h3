import minimist from 'minimist'
import write from 'aspida/dist/writeRouteFile'
import watch from 'aspida/dist/watchInputDir'
import buildCommon from './buildCommonFile'
import buildServer from './buildServerFile'
import clean from './cleanStaleRoutes'
import cleanAll from './cleanAllStaleRoutes'

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
    await cleanAll(dir)
    write(buildCommon(dir))
    write(await buildServer(dir, argv.project))
    const callSerialized = createAsyncSerializer()
    watch(dir, (event, file) =>
      callSerialized(async latest => {
        await clean(dir, event, file)
        if (latest) {
          // we do not have to write $common.ts as it is static for now
          write(await buildServer(dir, argv.project))
        }
      })
    )
  } else {
    await cleanAll(dir)
    write(buildCommon(dir))
    write(await buildServer(dir, argv.project))
  }
}
