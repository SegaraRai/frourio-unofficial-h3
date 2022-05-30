// @ts-check

const fs = require('fs')
const path = require('path')
const buildCommon = require('../dist/buildCommonFile').default
const buildServer = require('../dist/buildServerFile').default
const { writeCode2 } = require('../dist/writeCode')

async function main() {
  const dirs = await fs.promises.readdir(__dirname, { withFileTypes: true })
  for (const dir of dirs) {
    if (dir.isDirectory()) {
      await writeCode2(buildCommon(path.join(__dirname, dir.name)))
      await writeCode2(await buildServer(path.join(__dirname, dir.name)))
    }
  }
}

main().catch(e => console.error(e))
