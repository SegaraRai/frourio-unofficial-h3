import type { LowerHttpMethod } from 'aspida'
import {
  EventHandler,
  H3Error,
  H3Event,
  H3Response,
  Router,
  createError,
  eventHandler,
  getQuery,
  readBody
} from 'h3'
import { ZodError, ZodSchema } from 'zod'
import { EventHandlerFn, EventHandlerFnTerminal, Hooks, ServerMethods, symContext } from './$common'

import hooksFn0 from './api/hooks'
import hooksFn1 from './api/empty/hooks'
import hooksFn2 from './api/users/hooks'
import hooksFn3 from './api/users/_userId@number/_name/hooks'
import controllerFn0, { hooks as ctrlHooksFn0 } from './api/controller'
import controllerFn1 from './api/500/controller'
import controllerFn2 from './api/empty/noEmpty/controller'
import controllerFn3 from './api/multiForm/controller'
import controllerFn4 from './api/texts/controller'
import controllerFn5 from './api/texts/sample/controller'
import controllerFn6 from './api/texts/_label@string/controller'
import controllerFn7, { hooks as ctrlHooksFn7 } from './api/users/controller'
import controllerFn8 from './api/users/_userId@number/controller'
import controllerFn9 from './api/users/_userId@number/_name/controller'
import { zBody, zMultiForm, zQuery, zUserInfo } from './schemas'

export type FrourioCreateError = (status: number, data: string | object) => H3Error

export interface FrourioOptions {
  basePath?: string | undefined
  createError?: FrourioCreateError
  noRespondWith?: boolean
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

function hasBody({ req: { method } }: H3Event): boolean {
  return method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE'
}

function identity<T>(value: T): T {
  return value
}

function toBoolean(str: string): boolean | undefined {
  if (str === 'true' || str === '1' || str === '') {
    return true
  }
  if (str === 'false' || str === '0') {
    return false
  }
}

function toInteger(str: string): number | undefined {
  // Number.MAX_SAFE_INTEGER = 9007199254740991 (16 digits)
  if (/^\d{1,16}$/.test(str)) {
    const value = parseInt(str, 10)
    if (isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER) {
      return value
    }
  }
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
      // Route params could never be missing. Possibly a bug of the router.
      throw createError(400, `Missing required route parameter ${key}`)
    }
    const intValue = toInteger(value)
    if (intValue == null) {
      throw createError(400, `Invalid type of route parameter ${key}`)
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
      type === 's' ? (identity as (str: string) => string) : type === 'i' ? toInteger : toBoolean
    if (array) {
      const arrayKey = `${key}[]`
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
          throw createError(400, `Invalid type of query parameter ${key}`)
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
        throw createError(400, `Missing required query parameter ${key}`)
      }
      const castedValue = typeof value === 'string' ? castFn(value) : null
      if (castedValue == null) {
        throw createError(400, `Invalid type of query parameter ${key}`)
      }
      result[key] = castedValue
    }
  }
  return result
}

function methodToHandlers(
  methodCallback: ServerMethods<any, any>[LowerHttpMethod],
  hooks: readonly Hooks[],
  schemas: Schemas,
  intRouteParams: readonly string[],
  queryParamTypes: readonly ParamTypeSpec[],
  isQueryOptional: boolean,
  createError: FrourioCreateError,
  noRespondWith: boolean
): EventHandlerFn[] {
  const mergedHooks = mergeHooks(hooks)
  return [
    (event: H3Event) => {
      ;(event as any)[symContext] = {
        params: castRouteParams(event.context.params || {}, intRouteParams, createError)
      }
    },
    ...mergedHooks.onRequest,
    async (event: H3Event) => {
      let parsing = ''
      try {
        // handle query first to throw exceptions early
        parsing = 'query'
        const query = castQueryParams(
          getQuery(event),
          queryParamTypes,
          isQueryOptional,
          createError
        )
        ;(event as any)[symContext].query = schemas.query
          ? await schemas.query.parseAsync(query)
          : query

        if (hasBody(event)) {
          parsing = 'body'
          const body = await readBody(event)
          ;(event as any)[symContext].body = schemas.body
            ? await schemas.body.parseAsync(body)
            : body
        }
      } catch (error: unknown) {
        if (error instanceof ZodError) {
          throw createError(400, {
            type: `invalid_request_${parsing}`,
            issues: error.issues
          })
        }
        throw error
      }
    },
    ...mergedHooks.preHandler,
    async (event: H3Event) => {
      const context = (event as any)[symContext]
      const data = await methodCallback(context, event)
      const isText = typeof data.body === 'string'
      const h3res = new H3Response(isText ? data.body : JSON.stringify(data.body), {
        status: data.status,
        headers: data.headers
      })
      if (!h3res.headers.has('Content-Type')) {
        h3res.headers.set(
          'Content-Type',
          isText ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8'
        )
      }
      if (!noRespondWith) {
        event.respondWith(h3res)
      }
      return h3res
    }
  ]
}

function mergeHandlers(
  handlers: EventHandlerFn[],
  createError: FrourioCreateError
): EventHandlerFnTerminal {
  return async event => {
    for (const handler of handlers) {
      const data = await handler(event)
      if (data) {
        return data
      }
    }
    throw createError(500, 'No handler returned a response')
  }
}

function m2h(...args: Parameters<typeof methodToHandlers>): EventHandler<H3Response> {
  return eventHandler(mergeHandlers(methodToHandlers(...args), args[6]))
}

export default (router: Router, options: FrourioOptions = {}) => {
  const bp = options.basePath ?? ''
  const ce = options.createError ?? defaultCreateError
  const nrw = options.noRespondWith ?? false

  const h0 = hooksFn0(router)
  const h1 = hooksFn1(router)
  const h2 = hooksFn2(router)
  const h3 = hooksFn3(router)
  const ch0 = ctrlHooksFn0(router)
  const ch7 = ctrlHooksFn7(router)
  const c0 = controllerFn0(router)
  const c1 = controllerFn1(router)
  const c2 = controllerFn2(router)
  const c3 = controllerFn3(router)
  const c4 = controllerFn4(router)
  const c5 = controllerFn5(router)
  const c6 = controllerFn6(router)
  const c7 = controllerFn7(router)
  const c8 = controllerFn8(router)
  const c9 = controllerFn9(router)

  /* prettier-ignore */ router.get(bp || '/', m2h(c0.get, [h0, ch0], { query: zQuery }, [], [['optionalNum', 'i', true, false], ['optionalNumArr', 'i', true, true], ['emptyNum', 'i', true, false], ['optionalBool', 'b', true, false], ['optionalBoolArray', 'b', true, true], ['requiredNum', 'i', false, false], ['requiredNumArr', 'i', false, true], ['id', 's', false, false], ['disable', 's', false, false], ['bool', 'b', false, false], ['boolArray', 'b', false, true]], true, ce, nrw))
  /* prettier-ignore */ router.post(bp || '/', m2h(c0.post, [h0, ch0], { query: zQuery, body: zBody }, [], [['optionalNum', 'i', true, false], ['optionalNumArr', 'i', true, true], ['emptyNum', 'i', true, false], ['optionalBool', 'b', true, false], ['optionalBoolArray', 'b', true, true], ['requiredNum', 'i', false, false], ['requiredNumArr', 'i', false, true], ['id', 's', false, false], ['disable', 's', false, false], ['bool', 'b', false, false], ['boolArray', 'b', false, true]], false, ce, nrw))
  /* prettier-ignore */ router.get(`${bp}/500`, m2h(c1.get, [h0], {}, [], [], false, ce, nrw))
  /* prettier-ignore */ router.get(`${bp}/empty/noEmpty`, m2h(c2.get, [h0, h1], {}, [], [], false, ce, nrw))
  /* prettier-ignore */ router.post(`${bp}/multiForm`, m2h(c3.post, [h0], { body: zMultiForm }, [], [], false, ce, nrw))
  /* prettier-ignore */ router.get(`${bp}/texts`, m2h(c4.get, [h0], {}, [], [['val', 's', false, false], ['limit', 'i', true, false]], true, ce, nrw))
  /* prettier-ignore */ router.put(`${bp}/texts`, m2h(c4.put, [h0], {}, [], [], false, ce, nrw))
  /* prettier-ignore */ router.put(`${bp}/texts/sample`, m2h(c5.put, [h0], {}, [], [], false, ce, nrw))
  /* prettier-ignore */ router.get(`${bp}/texts/:label`, m2h(c6.get, [h0], {}, [], [], false, ce, nrw))
  /* prettier-ignore */ router.get(`${bp}/users`, m2h(c7.get, [h0, h2, ch7], {}, [], [], false, ce, nrw))
  /* prettier-ignore */ router.post(`${bp}/users`, m2h(c7.post, [h0, h2, ch7], { body: zUserInfo }, [], [], false, ce, nrw))
  /* prettier-ignore */ router.get(`${bp}/users/:userId`, m2h(c8.get, [h0, h2], {}, ['userId'], [], false, ce, nrw))
  /* prettier-ignore */ router.get(`${bp}/users/:userId/:name`, m2h(c9.get, [h0, h2, h3], {}, ['userId'], [], false, ce, nrw))

  return router
}
