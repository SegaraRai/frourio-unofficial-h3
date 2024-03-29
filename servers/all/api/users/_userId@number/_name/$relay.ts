import type { H3Event, Router } from 'h3'
import type { Injectable } from 'velona'
import { depend } from 'velona'
import { Hooks, ServerMethods, symContext } from '../../../../$common'
import type { AdditionalContext as AdditionalContext0 } from '../../hooks'
import type { AdditionalContext as AdditionalContext1 } from './hooks'
import type { Methods } from './'

type AdditionalContext = AdditionalContext0 & AdditionalContext1
type CurrentContext = AdditionalContext & {
  params: {
    userId: number
    name: string
  }
}
type ControllerMethods = ServerMethods<Methods, CurrentContext>

export function defineHooks<T extends Hooks>(hooks: (router: Router) => T): (router: Router) => T
export function defineHooks<T extends Record<string, any>, U extends Hooks>(
  deps: T,
  cb: (d: T, router: Router) => U
): Injectable<T, [Router], U>
export function defineHooks<T extends Record<string, any>>(
  hooks: (router: Router) => Hooks | T,
  cb?: ((deps: T, router: Router) => Hooks) | undefined
) {
  return cb && typeof hooks !== 'function' ? depend(hooks, cb) : hooks
}

export function defineController(
  methods: (router: Router) => ControllerMethods
): (router: Router) => ControllerMethods
export function defineController<T extends Record<string, any>>(
  deps: T,
  cb: (d: T, router: Router) => ControllerMethods
): Injectable<T, [Router], ControllerMethods>
export function defineController<T extends Record<string, any>>(
  methods: (router: Router) => ControllerMethods | T,
  cb?: ((deps: T, router: Router) => ControllerMethods) | undefined
) {
  return cb && typeof methods !== 'function' ? depend(methods, cb) : methods
}

export function useContext(event: H3Event): CurrentContext {
  return (event as any)[symContext]
}
