import fs from 'fs'

let eslintCache: any
let prettierCache: any

function initESLint() {
  if (eslintCache != null) {
    return eslintCache
  }

  try {
    const { ESLint } = require('eslint')
    eslintCache = new ESLint({
      useEslintrc: true,
      fix: true
    })
  } catch (_error) {
    eslintCache = false
  }

  return eslintCache
}

function initPrettier() {
  try {
    prettierCache = require('prettier')
  } catch (_error) {
    prettierCache = false
  }

  return prettierCache
}

export async function writeCode(
  filePath: string,
  code: string,
  write = fs.promises.writeFile
): Promise<void> {
  const eslint = initESLint()
  if (eslint) {
    const [result] = await eslint.lintText(code, {
      filePath
    })
    code = result.output || code
  }

  const prettier = initPrettier()
  if (prettier) {
    const options = await prettier.resolveConfig(filePath)
    code = prettier.format(code, {
      ...options,
      filepath: filePath
    })
  }

  await write(filePath, code, 'utf-8')
}

export function writeCode2(
  {
    filePath,
    text
  }: {
    readonly filePath: string
    readonly text: string
  },
  write = fs.promises.writeFile
): Promise<void> {
  return writeCode(filePath, text, write)
}
