const fs = require('fs')
const path = require('path')
const write = require('aspida/dist/writeRouteFile').default
const buildCommon = require('../dist/buildCommonFile').default
const buildServer = require('../dist/buildServerFile').default

async function main() {
  const dirs = await fs.promises.readdir(__dirname, { withFileTypes: true })
  for (const dir of dirs) {
    if (dir.isDirectory()) {
      write(buildCommon(path.join(__dirname, dir.name)))
      write(await buildServer(path.join(__dirname, dir.name)))
    }
  }
}

main().catch(e => console.error(e))
