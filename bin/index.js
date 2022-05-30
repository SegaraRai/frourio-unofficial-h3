#!/usr/bin/env node
require('../dist')
  .run(process.argv.slice(2))
  .catch(e => console.error(e))
