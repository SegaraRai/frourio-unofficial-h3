import minimist from 'minimist'
import write from 'aspida/dist/writeRouteFile'
import watch from 'aspida/dist/watchInputDir'
import buildCommon from './buildCommonFile'
import buildServer from './buildServerFile'
import clean from './cleanStaleRoutes'
import cleanAll from './cleanAllStaleRoutes'

export const run = (args: string[]) => {
  const argv = minimist(args, {
    string: ['version', 'watch', 'project'],
    alias: { v: 'version', w: 'watch', p: 'project' }
  })
  const dir = '.'

  if (argv.version !== undefined) {
    console.log(`v${require('../package.json').version}`)
  } else if (argv.watch !== undefined) {
    cleanAll(dir)
    write(buildCommon(dir))
    write(buildServer(dir, argv.project))
    watch(dir, (event, file) => {
      clean(dir, event, file)
      write(buildCommon(dir))
      write(buildServer(dir, argv.project))
    })
  } else {
    cleanAll(dir)
    write(buildCommon(dir))
    write(buildServer(dir, argv.project))
  }
}
