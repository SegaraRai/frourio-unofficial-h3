import type { LowerHttpMethod } from 'aspida'
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
import { ZodError, ZodSchema } from 'zod'
import { Hooks, ServerMethods, symContext } from './$common'

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
    async (req: IncomingMessage) => {
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
            type: `invalid_request_${parsing}`,
            issues: error.issues
          })
        }
        throw error
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

  const hooks0 = hooksFn0(router)
  const hooks1 = hooksFn1(router)
  const hooks2 = hooksFn2(router)
  const hooks3 = hooksFn3(router)
  const ctrlHooks0 = ctrlHooksFn0(router)
  const ctrlHooks7 = ctrlHooksFn7(router)
  const controller0 = controllerFn0(router)
  const controller1 = controllerFn1(router)
  const controller2 = controllerFn2(router)
  const controller3 = controllerFn3(router)
  const controller4 = controllerFn4(router)
  const controller5 = controllerFn5(router)
  const controller6 = controllerFn6(router)
  const controller7 = controllerFn7(router)
  const controller8 = controllerFn8(router)
  const controller9 = controllerFn9(router)

  /* prettier-ignore */ router.get(basePath || '/', methodToHandler(controller0.get, [hooks0, ctrlHooks0], { query: zQuery }, [], [['optionalNum', 'i', true, false], ['optionalNumArr', 'i', true, true], ['emptyNum', 'i', true, false], ['optionalBool', 'b', true, false], ['optionalBoolArray', 'b', true, true], ['requiredNum', 'i', false, false], ['requiredNumArr', 'i', false, true], ['id', 's', false, false], ['disable', 's', false, false], ['bool', 'b', false, false], ['boolArray', 'b', false, true]], true, createError))
  /* prettier-ignore */ router.post(basePath || '/', methodToHandler(controller0.post, [hooks0, ctrlHooks0], { query: zQuery, body: zBody }, [], [['optionalNum', 'i', true, false], ['optionalNumArr', 'i', true, true], ['emptyNum', 'i', true, false], ['optionalBool', 'b', true, false], ['optionalBoolArray', 'b', true, true], ['requiredNum', 'i', false, false], ['requiredNumArr', 'i', false, true], ['id', 's', false, false], ['disable', 's', false, false], ['bool', 'b', false, false], ['boolArray', 'b', false, true]], false, createError))
  /* prettier-ignore */ router.get(`${basePath}/500`, methodToHandler(controller1.get, [hooks0], {}, [], [], false, createError))
  /* prettier-ignore */ router.get(`${basePath}/empty/noEmpty`, methodToHandler(controller2.get, [hooks0, hooks1], {}, [], [], false, createError))
  /* prettier-ignore */ router.post(`${basePath}/multiForm`, methodToHandler(controller3.post, [hooks0], { body: zMultiForm }, [], [], false, createError))
  /* prettier-ignore */ router.get(`${basePath}/texts`, methodToHandler(controller4.get, [hooks0], {}, [], [['val', 's', false, false], ['limit', 'i', true, false]], true, createError))
  /* prettier-ignore */ router.put(`${basePath}/texts`, methodToHandler(controller4.put, [hooks0], {}, [], [], false, createError))
  /* prettier-ignore */ router.put(`${basePath}/texts/sample`, methodToHandler(controller5.put, [hooks0], {}, [], [], false, createError))
  /* prettier-ignore */ router.get(`${basePath}/texts/:label`, methodToHandler(controller6.get, [hooks0], {}, [], [], false, createError))
  /* prettier-ignore */ router.get(`${basePath}/users`, methodToHandler(controller7.get, [hooks0, hooks2, ctrlHooks7], {}, [], [], false, createError))
  /* prettier-ignore */ router.post(`${basePath}/users`, methodToHandler(controller7.post, [hooks0, hooks2, ctrlHooks7], { body: zUserInfo }, [], [], false, createError))
  /* prettier-ignore */ router.get(`${basePath}/users/:userId`, methodToHandler(controller8.get, [hooks0, hooks2], {}, ['userId'], [], false, createError))
  /* prettier-ignore */ router.get(`${basePath}/users/:userId/:name`, methodToHandler(controller9.get, [hooks0, hooks2, hooks3], {}, ['userId'], [], false, createError))

  return router
}
