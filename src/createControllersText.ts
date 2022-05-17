import path from 'path'
import fs from 'fs'
import ts from 'typescript'
import createDefaultFiles from './createDefaultFilesIfNotExists'

type HooksEvent = 'onRequest' | 'preHandler'
type Param = [string, string]

const findRootFiles = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .reduce<string[]>(
      (prev, d) => [
        ...prev,
        ...(d.isDirectory()
          ? findRootFiles(`${dir}/${d.name}`)
          : d.name === 'hooks.ts' || d.name === 'controller.ts'
          ? [`${dir}/${d.name}`]
          : [])
      ],
      []
    )

const initTSC = (appDir: string, project: string) => {
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
    findRootFiles(appDir),
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

const createRelayFile = (
  input: string,
  appText: string,
  additionalReqs: string[],
  params: Param[]
) => {
  const hasAdditionals = !!additionalReqs.length
  const text = `import type { IncomingMessage, Router } from 'h3'
import type { Injectable } from 'velona'
import { depend } from 'velona'
import { Hooks, ServerMethods, symContext } from '${appText}'
${
  hasAdditionals
    ? additionalReqs
        .map(
          (req, i) =>
            `import type { AdditionalRequest as AdditionalRequest${i} } from '${req.replace(
              /^\.\/\./,
              '.'
            )}'\n`
        )
        .join('')
    : ''
}import type { Methods } from './'

${
  hasAdditionals
    ? `type AdditionalRequest = ${additionalReqs
        .map((_, i) => `AdditionalRequest${i}`)
        .join(' & ')}\n`
    : ''
}type CurrentContext = ${hasAdditionals ? 'AdditionalRequest & ' : ''}{${
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

export function useContext(req: IncomingMessage): CurrentContext {
  return (req as any)[symContext]
}
`

  fs.writeFileSync(
    path.join(input, '$relay.ts'),
    text.replace(', {}', '').replace(' & {}', ''),
    'utf8'
  )
}

const getAdditionalResPath = (input: string, name: string) =>
  fs.existsSync(path.join(input, `${name}.ts`)) &&
  /(^|\n)export .+ AdditionalRequest(,| )/.test(
    fs.readFileSync(path.join(input, `${name}.ts`), 'utf8')
  )
    ? [`./${name}`]
    : []

const createFiles = (
  appDir: string,
  dirPath: string,
  params: Param[],
  appPath: string,
  additionalRequestPaths: string[]
) => {
  const input = path.posix.join(appDir, dirPath)
  const appText = `../${appPath}`
  const additionalReqs = [
    ...additionalRequestPaths.map(p => `./.${p}`),
    ...getAdditionalResPath(input, 'hooks')
  ]

  createDefaultFiles(input)
  createRelayFile(
    input,
    appText,
    [...additionalReqs, ...getAdditionalResPath(input, 'controller')],
    params
  )

  const dirs = fs.readdirSync(input, { withFileTypes: true }).filter(d => d.isDirectory())
  if (dirs.filter(d => d.name.startsWith('_')).length >= 2) {
    throw new Error('There are two ore more path param folders.')
  }

  dirs.forEach(d =>
    createFiles(
      appDir,
      path.posix.join(dirPath, d.name),
      d.name.startsWith('_')
        ? [...params, [d.name.slice(1).split('@')[0], d.name.split('@')[1] ?? 'string']]
        : params,
      appText,
      additionalReqs
    )
  )
}

export default (appDir: string, project: string) => {
  createFiles(appDir, '', [], '$common', [])

  const { program, checker } = initTSC(appDir, project)
  const hooksPaths: string[] = []
  const controllers: [string, boolean][] = []
  const schemaSet = new Set<string>()
  const createText = (
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
          hooks = [...cascadingHooks, { name: `hooks${hooksPaths.length}`, events }]
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
                  // e.g. 'reqBody: z.infer<typeof zUserInfo>'
                  const text = val.valueDeclaration
                    ?.getText()
                    .trim()
                    .replace(/typeof\s+/, 'typeof\0')
                    .replace(/\s/g, '')
                    .replace(/\0/g, ' ')
                  const match = text?.match(
                    /^([^:]+):[A-Za-z$_][\w$]*\.infer<typeof\s+([A-Za-z$_][\w$]*)>$/
                  )

                  return {
                    name,
                    type: (match && match[2]) || '',
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
                ...(ctrlHooksSignature ? [{ name: `ctrlHooks${controllers.length}` }] : [])
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
                ? `\`\${basePath}${`/${dirPath}`
                    .replace(/\/_/g, '/:')
                    .replace(/@.+?($|\/)/g, '$1')}\``
                : "basePath || '/'"

              return `  /* prettier-ignore */ router.${m.name}(${pathText}, methodToHandler(controller${controllers.length}.${m.name}, ${hooksTexts}, ${schemaText}, ${routeParamTypesText}, ${queryParamTypesText}, ${isQueryOptional}, createError))\n`
            })
            .join('')
        )

        controllers.push([`${input}/controller`, !!ctrlHooksSignature])
      }
    }

    const childrenDirs = fs.readdirSync(input, { withFileTypes: true }).filter(d => d.isDirectory())

    if (childrenDirs.length) {
      results.push(
        ...childrenDirs
          .filter(d => !d.name.startsWith('_'))
          .reduce<string[]>(
            (prev, d) => [...prev, ...createText(path.posix.join(dirPath, d.name), hooks)],
            []
          )
      )

      const value = childrenDirs.find(d => d.name.startsWith('_'))

      if (value) {
        results.push(...createText(path.posix.join(dirPath, value.name), hooks))
      }
    }

    return results
  }

  const text = createText('', []).join('')
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
      .map((_, i) => `  const hooks${i} = hooksFn${i}(router)\n`)
      .join('')}${controllers
      .map(([, hasHooks], i) =>
        hasHooks ? `  const ctrlHooks${i} = ctrlHooksFn${i}(router)\n` : ''
      )
      .join('')}${controllers
      .map((_, i) => `  const controller${i} = controllerFn${i}(router)\n`)
      .join('')}`,
    controllers: text
  }
}
