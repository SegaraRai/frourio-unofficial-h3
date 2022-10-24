import path from 'path'
import fs from 'fs'
import ts from 'typescript'
import createDefaultFiles from './createDefaultFilesIfNotExists'
import { writeCode } from './writeCode'

type HooksEvent = 'onRequest' | 'preHandler'
type Param = [string, string]

const findRootFiles = async (dir: string): Promise<string[]> =>
  (await fs.promises.readdir(dir, { withFileTypes: true })).reduce<Promise<string[]>>(
    async (prev, d) => [
      ...(await prev),
      ...(d.isDirectory()
        ? await findRootFiles(`${dir}/${d.name}`)
        : d.name === 'hooks.ts' || d.name === 'controller.ts'
        ? [`${dir}/${d.name}`]
        : [])
    ],
    Promise.resolve([])
  )

const initTSC = async (appDir: string, project: string) => {
  const configDir = path.resolve(project.replace(/\/[^/]+\.json$/, ''))
  const configFileName = ts.findConfigFile(
    configDir,
    ts.sys.fileExists,
    project.endsWith('.json') ? project.split('/').pop() : undefined
  )

  const compilerOptions = configFileName
    ? ts.parseJsonConfigFileContent(
        ts.readConfigFile(configFileName, ts.sys.readFile).config,
        ts.sys,
        configDir
      )
    : undefined

  const program = ts.createProgram(
    await findRootFiles(appDir),
    compilerOptions?.options
      ? {
          baseUrl: compilerOptions?.options.baseUrl,
          paths: compilerOptions?.options.paths,
          strictNullChecks: true
        }
      : { strictNullChecks: true }
  )

  return { program, checker: program.getTypeChecker() }
}

const createRelayFile = async (
  input: string,
  appText: string,
  additionalReqs: string[],
  params: Param[],
  write = writeCode
) => {
  const hasAdditionals = !!additionalReqs.length
  const text = `import type { H3Event, Router } from 'h3'
import type { Injectable } from 'velona'
import { depend } from 'velona'
import { Hooks, ServerMethods, symContext } from '${appText}'
${
  hasAdditionals
    ? additionalReqs
        .map(
          (req, i) =>
            `import type { AdditionalContext as AdditionalContext${i} } from '${req.replace(
              /^\.\/\./,
              '.'
            )}'\n`
        )
        .join('')
    : ''
}import type { Methods } from './'

${
  hasAdditionals
    ? `type AdditionalContext = ${additionalReqs
        .map((_, i) => `AdditionalContext${i}`)
        .join(' & ')}\n`
    : ''
}type CurrentContext = ${hasAdditionals ? 'AdditionalContext & ' : ''}{${
    params.length
      ? `\n  params: {\n${params.map(v => `    ${v[0]}: ${v[1]}`).join('\n')}\n  }\n`
      : ''
  }}
type ControllerMethods = ServerMethods<Methods, CurrentContext>

export function defineHooks<T extends Hooks>(hooks: (router: Router) => T): (router: Router) => T
export function defineHooks<T extends Record<string, any>, U extends Hooks>(deps: T, cb: (d: T, router: Router) => U): Injectable<T, [Router], U>
export function defineHooks<T extends Record<string, any>>(hooks: (router: Router) => Hooks | T, cb?: ((deps: T, router: Router) => Hooks) | undefined) {
  return cb && typeof hooks !== 'function' ? depend(hooks, cb) : hooks
}

export function defineController(methods: (router: Router) => ControllerMethods): (router: Router) => ControllerMethods
export function defineController<T extends Record<string, any>>(deps: T, cb: (d: T, router: Router) => ControllerMethods): Injectable<T, [Router], ControllerMethods>
export function defineController<T extends Record<string, any>>(methods: (router: Router) => ControllerMethods | T, cb?: ((deps: T, router: Router) => ControllerMethods) | undefined) {
  return cb && typeof methods !== 'function' ? depend(methods, cb) : methods
}

export function useContext(event: H3Event): CurrentContext {
  return (event as any)[symContext]
}
`

  await write(path.join(input, '$relay.ts'), text.replace(', {}', '').replace(' & {}', ''))
}

const getAdditionalResPath = async (input: string, name: string) =>
  fs.existsSync(path.join(input, `${name}.ts`)) &&
  /(^|\n)export .+ AdditionalContext[, ]/.test(
    await fs.promises.readFile(path.join(input, `${name}.ts`), 'utf8')
  )
    ? [`./${name}`]
    : []

const createFiles = async (
  appDir: string,
  dirPath: string,
  params: Param[],
  appPath: string,
  additionalContextPaths: string[],
  write = writeCode
) => {
  const input = path.posix.join(appDir, dirPath)
  const appText = `../${appPath}`
  const additionalReqs = [
    ...additionalContextPaths.map(p => `./.${p}`),
    ...(await getAdditionalResPath(input, 'hooks'))
  ]

  await createDefaultFiles(input, write)
  await createRelayFile(
    input,
    appText,
    [...additionalReqs, ...(await getAdditionalResPath(input, 'controller'))],
    params,
    write
  )

  const dirs = (await fs.promises.readdir(input, { withFileTypes: true })).filter(d =>
    d.isDirectory()
  )
  if (dirs.filter(d => d.name.startsWith('_')).length >= 2) {
    throw new Error('There are two ore more path param folders.')
  }

  for (const d of dirs) {
    await createFiles(
      appDir,
      path.posix.join(dirPath, d.name),
      d.name.startsWith('_')
        ? [...params, [d.name.slice(1).split('@')[0], d.name.split('@')[1] ?? 'string']]
        : params,
      appText,
      additionalReqs,
      write
    )
  }
}

export default async (appDir: string, project: string, write = writeCode) => {
  await createFiles(appDir, '', [], '$common', [], write)

  const { program, checker } = await initTSC(appDir, project)
  const hooksPaths: string[] = []
  const controllers: [string, boolean][] = []
  const schemaSet = new Set<string>()
  const createText = async (
    dirPath: string,
    cascadingHooks: { name: string; events: { type: HooksEvent; isArray: boolean }[] }[]
  ) => {
    const input = path.posix.join(appDir, dirPath)
    const source = program.getSourceFile(path.join(input, 'index.ts'))
    const results: string[] = []
    let hooks = cascadingHooks

    if (source) {
      const methods = ts.forEachChild(source, node =>
        (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) &&
        node.name.escapedText === 'Methods' &&
        node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
          ? checker.getTypeAtLocation(node).getProperties()
          : undefined
      )

      const hooksSource = program.getSourceFile(path.join(input, 'hooks.ts'))

      if (hooksSource) {
        const events = ts.forEachChild(hooksSource, node => {
          if (ts.isExportAssignment(node)) {
            return node.forEachChild(
              node =>
                ts.isCallExpression(node) &&
                node.forEachChild(node => {
                  if (
                    ts.isMethodDeclaration(node) ||
                    ts.isArrowFunction(node) ||
                    ts.isFunctionDeclaration(node)
                  ) {
                    return (
                      node.body &&
                      checker
                        .getTypeAtLocation(node.body)
                        .getProperties()
                        .map(p => {
                          const typeNode =
                            p.valueDeclaration &&
                            checker.typeToTypeNode(
                              checker.getTypeOfSymbolAtLocation(p, p.valueDeclaration),
                              undefined,
                              undefined
                            )

                          return {
                            type: p.name as HooksEvent,
                            isArray: typeNode
                              ? ts.isArrayTypeNode(typeNode) || ts.isTupleTypeNode(typeNode)
                              : false
                          }
                        })
                    )
                  }
                })
            )
          }
        })

        if (events) {
          hooks = [...cascadingHooks, { name: `h${hooksPaths.length}`, events }]
          hooksPaths.push(`${input}/hooks`)
        }
      }

      if (methods?.length) {
        const controllerSource = program.getSourceFile(path.join(input, 'controller.ts'))
        let ctrlHooksSignature: ts.Signature | undefined

        if (controllerSource) {
          let ctrlHooksNode: ts.VariableDeclaration | ts.ExportSpecifier | undefined

          ts.forEachChild(controllerSource, node => {
            if (
              ts.isVariableStatement(node) &&
              node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
            ) {
              ctrlHooksNode =
                node.declarationList.declarations.find(d => d.name.getText() === 'hooks') ??
                ctrlHooksNode
            } else if (ts.isExportDeclaration(node)) {
              const { exportClause } = node
              if (exportClause && ts.isNamedExports(exportClause)) {
                ctrlHooksNode =
                  exportClause.elements.find(el => el.name.text === 'hooks') ?? ctrlHooksNode
              }
            }
          })

          if (ctrlHooksNode) {
            ctrlHooksSignature = checker.getSignaturesOfType(
              checker.getTypeAtLocation(ctrlHooksNode),
              ts.SignatureKind.Call
            )[0]
          }
        }

        const getTypeQueryParams = (query: ts.Symbol) => {
          const queryDeclaration = query.valueDeclaration
          if (!queryDeclaration) {
            return undefined
          }
          return checker
            .getTypeOfSymbolAtLocation(query, queryDeclaration)
            .getNonNullableType()
            .getProperties()
            .map(p => {
              // I don't know whether this is correct or not
              const declaration = p.valueDeclaration || p.declarations?.[0]
              if (!declaration) {
                return null
              }
              const sourceType = checker.getTypeOfSymbolAtLocation(p, declaration)
              const type = sourceType.getNonNullableType()
              const typeString = checker.typeToString(type)
              const optional =
                type !== sourceType ||
                !!p.declarations?.some(d =>
                  d.getChildren().some(c => c.kind === ts.SyntaxKind.QuestionToken)
                )
              const array = typeString.endsWith('[]')
              const baseTypeString = array
                ? typeString.replace(/^\(/, '').replace(/\)?\[\]$/, '')
                : typeString
              return [baseTypeString, p.name, optional, array] as const
            })
            .filter(
              (
                item
              ): item is readonly [
                typeName: string,
                key: string,
                optional: boolean,
                array: boolean
              ] => !!item
            )
        }

        results.push(
          methods
            .map(m => {
              const props = m.valueDeclaration
                ? checker.getTypeOfSymbolAtLocation(m, m.valueDeclaration).getProperties()
                : []
              const query = props.find(p => p.name === 'query')
              const isQueryOptional = !!query?.declarations?.some(
                d => d.getChildAt(1).kind === ts.SyntaxKind.QuestionToken
              )
              const queryParamTypes = (query && getTypeQueryParams(query)) || []
              const schemaInfo = [
                { name: 'query', val: query },
                { name: 'body', val: props.find(p => p.name === 'reqBody') },
                { name: 'headers', val: props.find(p => p.name === 'reqHeaders') }
              ]
                .filter((prop): prop is { name: string; val: ts.Symbol } => !!prop.val)
                .map(({ name, val }) => {
                  // e.g. 'reqBody: z.infer<typeof zUserInfo>;'
                  const text = val.valueDeclaration
                    ?.getText()
                    .trim()
                    .replace(/typeof\s+/, 'typeof\0')
                    .replace(/\s/g, '')
                    .replace(/\0/g, ' ')
                  const match = text?.match(
                    // semicolons and commas may not be used more than once
                    /^([^:]+):[A-Za-z$_][\w$]*\.infer<typeof\s+([A-Za-z$_][\w$]*)>[,;]?$/
                  )

                  return {
                    name,
                    type: match?.[2] || '',
                    hasQuestion: !!val.declarations?.some(
                      d => d.getChildAt(1).kind === ts.SyntaxKind.QuestionToken
                    )
                  }
                })
                .filter(item => item.type)

              const schemaText = schemaInfo.length
                ? '{ ' + schemaInfo.map(item => `${item.name}: ${item.type}`).join(', ') + ' }'
                : '{}'

              for (const schema of schemaInfo) {
                schemaSet.add(schema.type)
              }

              const allHooks = [
                ...hooks,
                ...(ctrlHooksSignature ? [{ name: `ch${controllers.length}` }] : [])
              ]
              const hooksTexts = '[' + allHooks.map(hook => hook.name).join(', ') + ']'

              const numberRouteParams = dirPath
                .split('/')
                .map(part => part.match(/^_([\w$]+)@number$/)?.[1])
                .filter((key): key is string => !!key)
              const routeParamTypesText =
                '[' + numberRouteParams.map(key => `'${key}'`).join(', ') + ']'

              const queryParamTypesText =
                '[' +
                queryParamTypes
                  .map(
                    ([type, key, optional, array]) =>
                      `['${key}', '${
                        type === 'boolean' ? 'b' : type === 'number' ? 'i' : 's'
                      }', ${optional}, ${array}]`
                  )
                  .join(', ') +
                ']'

              const pathText = dirPath
                ? `\`\${bp}${`/${dirPath}`.replace(/\/_/g, '/:').replace(/@.+?($|\/)/g, '$1')}\``
                : "bp || '/'"

              return `  /* prettier-ignore */ router.${m.name}(${pathText}, m2h(c${controllers.length}.${m.name}, ${hooksTexts}, ${schemaText}, ${routeParamTypesText}, ${queryParamTypesText}, ${isQueryOptional}, ce, nrw))\n`
            })
            .join('')
        )

        controllers.push([`${input}/controller`, !!ctrlHooksSignature])
      }
    }

    const childrenDirs = (await fs.promises.readdir(input, { withFileTypes: true })).filter(d =>
      d.isDirectory()
    )

    if (childrenDirs.length) {
      results.push(
        ...(await childrenDirs
          .filter(d => !d.name.startsWith('_'))
          .reduce<Promise<string[]>>(
            async (prev, d) => [
              ...(await prev),
              ...(await createText(path.posix.join(dirPath, d.name), hooks))
            ],
            Promise.resolve([])
          ))
      )

      const value = childrenDirs.find(d => d.name.startsWith('_'))

      if (value) {
        results.push(...(await createText(path.posix.join(dirPath, value.name), hooks)))
      }
    }

    return results
  }

  const text = (await createText('', [])).join('')
  const schemaImportText = schemaSet.size
    ? `import { ${Array.from(schemaSet).sort().join(', ')} } from './schemas'\n`
    : ''

  return {
    hasSchemas: !!schemaSet.size,
    imports: `${hooksPaths
      .map(
        (m, i) =>
          `import hooksFn${i} from '${m.replace(/^api/, './api').replace(appDir, './api')}'\n`
      )
      .join('')}${controllers
      .map(
        (ctrl, i) =>
          `import controllerFn${i}${
            ctrl[1] ? `, { ${ctrl[1] ? `hooks as ctrlHooksFn${i}` : ''} }` : ''
          } from '${ctrl[0].replace(/^api/, './api').replace(appDir, './api')}'\n`
      )
      .join('')}${schemaImportText}`,
    consts: `${hooksPaths
      .map((_, i) => `  const h${i} = hooksFn${i}(router)\n`)
      .join('')}${controllers
      .map(([, hasHooks], i) => (hasHooks ? `  const ch${i} = ctrlHooksFn${i}(router)\n` : ''))
      .join('')}${controllers
      .map((_, i) => `  const c${i} = controllerFn${i}(router)\n`)
      .join('')}`,
    controllers: text
  }
}
