import type { AspidaMethodParams, AspidaMethods, HttpStatusOk } from 'aspida'
import type { H3Event, H3Response } from 'h3'

export type EventHandlerFnMiddleware = (event: H3Event) => void | Promise<void>

export type EventHandlerFnTerminal = (event: H3Event) => H3Response | Promise<H3Response>

export type EventHandlerFn = EventHandlerFnMiddleware | EventHandlerFnTerminal

export type HttpStatusNoOk =
  | 301
  | 302
  | 400
  | 401
  | 402
  | 403
  | 404
  | 405
  | 406
  | 409
  | 500
  | 501
  | 502
  | 503
  | 504
  | 505

export type PartiallyPartial<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

export type BaseResponse<T, U, V> = {
  status: V extends number ? V : HttpStatusOk
  body: T
  headers: U
}

export type FServerResponse<K extends AspidaMethodParams> =
  | (K extends { resBody: K['resBody']; resHeaders: K['resHeaders'] }
      ? BaseResponse<K['resBody'], K['resHeaders'], K['status']>
      : K extends { resBody: K['resBody'] }
      ? PartiallyPartial<BaseResponse<K['resBody'], K['resHeaders'], K['status']>, 'headers'>
      : K extends { resHeaders: K['resHeaders'] }
      ? PartiallyPartial<BaseResponse<K['resBody'], K['resHeaders'], K['status']>, 'body'>
      : PartiallyPartial<
          BaseResponse<K['resBody'], K['resHeaders'], K['status']>,
          'body' | 'headers'
        >)
  | PartiallyPartial<BaseResponse<any, any, HttpStatusNoOk>, 'body' | 'headers'>

export type RequestParams<T extends AspidaMethodParams> = Pick<
  {
    query: T['query']
    body: T['reqBody']
    headers: T['reqHeaders']
  },
  {
    query: Required<T>['query'] extends {} | null ? 'query' : never
    body: Required<T>['reqBody'] extends {} | null ? 'body' : never
    headers: Required<T>['reqHeaders'] extends {} | null ? 'headers' : never
  }['query' | 'body' | 'headers']
>

export type ServerMethods<
  T extends AspidaMethods & Record<string, any>,
  U extends Record<string, any> = {}
> = {
  [K in keyof T]: (
    ctx: RequestParams<T[K]> & U,
    event: H3Event
  ) => FServerResponse<T[K]> | Promise<FServerResponse<T[K]>>
}

export interface Hooks {
  readonly onRequest?: EventHandlerFnMiddleware | readonly EventHandlerFnMiddleware[] | undefined
  readonly preHandler?: EventHandlerFnMiddleware | readonly EventHandlerFnMiddleware[] | undefined
}

export const symContext = Symbol('context')
