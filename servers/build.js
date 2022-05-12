const fs = require('fs')
const path = require('path')
const write = require('aspida/dist/writeRouteFile').default
const buildCommon = require('../dist/buildCommonFile').default
const buildServer = require('../dist/buildServerFile').default

fs.readdirSync(__dirname, { withFileTypes: true }).forEach(dir => {
  if (dir.isDirectory()) {
    write(buildCommon(path.join(__dirname, dir.name)))
    write(buildServer(path.join(__dirname, dir.name)))
  }
})
