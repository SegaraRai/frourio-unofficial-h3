import path from 'path'
import createControllersText from './createControllersText'

export default (input: string, project?: string) => {
  const { hasSchemas, imports, consts, controllers } = createControllersText(
    `${input}/api`,
    project ?? input
  )

  return {
    text: `import type { LowerHttpMethod } from 'aspida'
import {
  CompatibilityEventHandler,
  H3Error,
  IncomingMessage,
  Router,
  ServerResponse,
  callHandler,
  createError,
  useBody,
  useQuery
} from 'h3'
${hasSchemas ? "import { ZodError, ZodSchema } from 'zod'" : ''}
import { Hooks, ServerMethods, symContext } from './$common'

${imports}
export type FrourioCreateError = (status: number, data: string | object) => H3Error

export interface FrourioOptions {
  basePath?: string | undefined
  createError?: FrourioCreateError
}
${
  hasSchemas
    ? ''
    : `
type ZodSchema = {
  parse: <T>(value: T) => T
  parseAsync: <T>(value: T) => Promise<T>
}
`
}
interface Schemas {
  body?: ZodSchema | undefined | null
  header?: ZodSchema | undefined | null
  query?: ZodSchema | undefined | null
}

export function defaultCreateError(status: number, data: string | object): H3Error {
  return createError({
    statusCode: status,
    data
  })
}

function hasBody(req: IncomingMessage): boolean {
  return (
    req.method === 'POST' ||
    req.method === 'PATCH' ||
    req.method === 'PUT' ||
    req.method === 'DELETE'
  )
}

function identity<T>(value: T): T {
  return value
}

function toBoolean(str: string): boolean | undefined {
  return {
    true: true,
    false: false,
    '1': true,
    '0': false
  }[str]
}

function toInteger(str: string): number | undefined {
  if (!/^\\d+$/.test(str)) {
    return undefined
  }
  const value = parseInt(str, 10)
  if (!isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    return undefined
  }
  return value
}

function toArray<T>(value: T | readonly T[]): readonly T[]
function toArray<T>(value: T | T[]): T[]
function toArray<T>(value: T | readonly T[] | T[]): readonly T[] | T[] {
  return Array.isArray(value) ? (value as any) : [value]
}

function mergeHooks(hooks: readonly Hooks[]) {
  return {
    onRequest: hooks.flatMap(hook => toArray(hook.onRequest || [])),
    preHandler: hooks.flatMap(hook => toArray(hook.preHandler || []))
  }
}

function castRouteParams(
  params: Record<string, string>,
  intParams: readonly string[],
  createError: FrourioCreateError
): Record<string, string | number> {
  const result: Record<string, string | number> = { ...params }
  for (const key of intParams) {
    const value = params[key]
    if (value == null) {
      throw createError(400, \`Missing required route parameter \${key}\`)
    }
    const intValue = toInteger(value)
    if (intValue == null) {
      throw createError(400, \`Invalid type of route parameter \${key}\`)
    }
    result[key] = intValue
  }
  return result
}

type ParamTypeSpec = [key: string, type: 'b' | 'i' | 's', optional: boolean, array: boolean]

function castQueryParams(
  params: Record<string, string | string[] | undefined>,
  paramTypes: readonly ParamTypeSpec[],
  isOptional: boolean,
  createError: FrourioCreateError
): Record<string, string | number | boolean | string[] | number[] | boolean[]> {
  if (isOptional && Object.keys(params).length === 0) {
    return {}
  }
  // NOTE: paramTypes has all parameters so we don't have to clone params here
  const result: Record<string, string | number | boolean | string[] | number[] | boolean[]> = {}
  for (const [key, type, optional, array] of paramTypes) {
    const castFn =
      type === 'b' ? toBoolean : type === 'i' ? toInteger : (identity as (str: string) => string)
    if (array) {
      const arrayKey = \`\${key}[]\`
      const value = params[arrayKey] || params[key]
      // delete result[key]
      // delete result[arrayKey]
      if (value == null) {
        if (optional) {
          continue
        }
        result[key] = []
      } else {
        const castedValues = toArray(value).map<any>(castFn)
        if (castedValues.some(v => v == null)) {
          throw createError(400, \`Invalid type of query parameter \${key}\`)
        }
        result[key] = castedValues
      }
    } else {
      const value = params[key]
      // delete result[key]
      if (value == null) {
        if (optional) {
          continue
        }
        throw createError(400, \`Missing required query parameter \${key}\`)
      }
      const castedValue = typeof value === 'string' ? castFn(value) : null
      if (castedValue == null) {
        throw createError(400, \`Invalid type of query parameter \${key}\`)
      }
      result[key] = castedValue
    }
  }
  return result
}

function methodToHandlers(
  methodCallback: ServerMethods<any, any>[LowerHttpMethod],
  hooks: readonly Hooks[],
  ${hasSchemas ? '' : '_'}schemas: Schemas,
  intRouteParams: readonly string[],
  queryParamTypes: readonly ParamTypeSpec[],
  isQueryOptional: boolean,
  createError: FrourioCreateError
): CompatibilityEventHandler[] {
  const mergedHooks = mergeHooks(hooks)
  return [
    (req: IncomingMessage) => {
      ;(req as any)[symContext] = {
        params: castRouteParams(req.context.params || {}, intRouteParams, createError)
      }
    },
    ...mergedHooks.onRequest,
    async (req: IncomingMessage) => {${
      hasSchemas
        ? `
      let parsing = ''
      try {
        // handle query first to throw exceptions early
        parsing = 'query'
        const query = castQueryParams(useQuery(req), queryParamTypes, isQueryOptional, createError)
        ;(req as any)[symContext].query = schemas.query
          ? await schemas.query.parseAsync(query)
          : query

        if (hasBody(req)) {
          parsing = 'body'
          const body = await useBody(req)
          ;(req as any)[symContext].body = schemas.body ? await schemas.body.parseAsync(body) : body
        }
      } catch (error: unknown) {
        if (error instanceof ZodError) {
          throw createError(400, {
            type: \`invalid_request_\${parsing}\`,
            issues: error.issues
          })
        }
        throw error
      }`
        : `
      // handle query first to throw exceptions early
      const query = castQueryParams(useQuery(req), queryParamTypes, isQueryOptional, createError)
      ;(req as any)[symContext].query = query

      if (hasBody(req)) {
        const body = await useBody(req)
        ;(req as any)[symContext].body = body
      }`
    }
    },
    ...mergedHooks.preHandler,
    async (req: IncomingMessage, res: ServerResponse) => {
      const context = (req as any)[symContext]
      const data = await methodCallback(context, req)
      const isText = typeof data.body === 'string'
      res.setHeader(
        'Content-Type',
        isText ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8'
      )
      if (data.headers) {
        for (const [key, value] of Object.entries(data.headers)) {
          res.setHeader(key, value as string)
        }
      }
      res.statusCode = data.status
      res.end(isText ? data.body : JSON.stringify(data.body))
    }
  ]
}

function mergeHandlers(handlers: CompatibilityEventHandler[]): CompatibilityEventHandler {
  return async (req: IncomingMessage, res: ServerResponse) => {
    for (const handler of handlers) {
      const data = await callHandler(handler, req, res)
      if (data) {
        return data
      }
    }
  }
}

function methodToHandler(...args: Parameters<typeof methodToHandlers>): CompatibilityEventHandler {
  return mergeHandlers(methodToHandlers(...args))
}

export default (router: Router, options: FrourioOptions = {}) => {
  const basePath = options.basePath ?? ''
  const createError = options.createError ?? defaultCreateError

${consts}
${controllers}
  return router
}
`,
    filePath: path.posix.join(input, '$server.ts')
  }
}
