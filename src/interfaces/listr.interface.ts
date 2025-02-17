import type * as Enquirer from 'enquirer'
import type { Observable } from 'rxjs'
import { Readable } from 'stream'

import {
  ListrDefaultNonTTYRendererOptions,
  ListrDefaultRendererOptions,
  ListrDefaultRendererValue,
  ListrFallbackRendererValue,
  ListrGetRendererTaskOptions,
  ListrRendererFactory,
  ListrRendererValue
} from './renderer.interface'
import { ListrEventType } from '@constants/event.constants'
import { Task } from '@lib/task'
import { TaskWrapper } from '@lib/task-wrapper'
import { Listr } from '@root/listr'

/** Listr Default Context */
export type ListrContext = any | undefined

export interface ListrTask<Ctx = ListrContext, Renderer extends ListrRendererFactory = any> {
  /**
   * Title of the task.
   *
   * Give this task a title if you want to track it by name in the current renderer.
   * Tasks without a title will tend to hide themselves in the default renderer and useful for
   */
  title?: string
  /**
   * The task itself.
   *
   * Task can be a sync or async function, an Observable or a Stream.
   */
  task: (ctx: Ctx, task: TaskWrapper<Ctx, Renderer>) => void | ListrTaskResult<Ctx>
  /**
   * Runs a specific event if the current task or any of the subtasks has failed.
   * Mostly useful for rollback purposes for subtasks.
   */
  rollback?: (ctx: Ctx, task: TaskWrapper<Ctx, Renderer>) => void | ListrTaskResult<Ctx>
  /**
   * Adds a couple of retries to the task if the task fails
   */
  retry?: number
  /**
   * Skip this task depending on the context.
   *
   * The function that has been passed in will be evaluated at the runtime when task tries to initially run.
   */
  skip?: boolean | string | ((ctx: Ctx) => boolean | string | Promise<boolean> | Promise<string>)
  /**
   * Enable a task depending on the context.
   *
   * The function that has been passed in will be evaluated at the initial creation of the Listr class.
   */
  enabled?: boolean | ((ctx: Ctx) => boolean | Promise<boolean>)
  /**
   * Per task options, depending on the selected renderer.
   *
   * This options depend on the implementation of selected renderer. If selected renderer has no options it will
   * be displayed as never.
   */
  options?: ListrGetRendererTaskOptions<Renderer>
  /**
   * Set exit on error option from task level instead of setting it for all the subtasks.
   */
  exitOnError?: boolean | ((ctx: Ctx) => boolean | Promise<boolean>)
}

/**
 * Options to set the behavior of this base task.
 */
export interface ListrOptions<Ctx = ListrContext> {
  /**
   * Concurrency will set how many tasks will be run in parallel.
   *
   * @default false > Default is to run everything synchronously.
   *
   * `true` will set it to `Infinity`, `false` will set it to synchronous.
   * If you pass in a `number` it will limit it at that number.
   */
  concurrent?: boolean | number
  /**
   * Determine the behavior of exiting on errors.
   *
   * @default true > exit on any error coming from the tasks.
   */
  exitOnError?: boolean
  /**
   * Determine the behaviour of exiting after rollback actions.
   *
   * @default true > exit after rolling back tasks
   */
  exitAfterRollback?: boolean
  /**
   * To inject a context through this options wrapper. Mostly useful when combined with manager.
   * @default any
   */
  ctx?: Ctx
  /**
   * By default, Listr2 will track SIGINIT signal to update the renderer one last time before compeletely failing.
   * @default true
   */
  registerSignalListeners?: boolean
  /**
   * Determine the certain condition required to use the non-tty renderer.
   * @default null > handled internally
   */
  rendererFallback?: boolean | (() => boolean)
  /**
   * Determine the certain condition required to use the silent renderer.
   * @default null > handled internally
   */
  rendererSilent?: boolean | (() => boolean)
  /**
   * Disabling the color, useful for tests and such.
   * @default false
   */
  disableColor?: boolean
  /**
   * Inject data directly to TaskWrapper.
   */
  injectWrapper?: {
    // eslint-disable-next-line @typescript-eslint/ban-types
    enquirer?: Enquirer<object>
  }
}

/**
 * Task can be set of sync or async function, an Observable or a stream.
 */
export type ListrTaskResult<Ctx> = string | Promise<any> | Listr<Ctx, ListrRendererValue, any> | Readable | NodeJS.ReadableStream | Observable<any>

/**
 * Parent class options.
 *
 * Parent class has more options where you can also select the and set renderer and non-tty renderer.
 *
 * Any subtasks will respect those options so they will be stripped of that properties.
 */
export type ListrBaseClassOptions<
  Ctx = ListrContext,
  Renderer extends ListrRendererValue = ListrDefaultRendererValue,
  FallbackRenderer extends ListrRendererValue = ListrFallbackRendererValue
> = ListrOptions<Ctx> & ListrDefaultRendererOptions<Renderer> & ListrDefaultNonTTYRendererOptions<FallbackRenderer>

/**
 * Sub class options.
 *
 * Subtasks has reduced set options where the missing ones are explicitly set by the base class.
 */
export type ListrSubClassOptions<Ctx = ListrContext, Renderer extends ListrRendererValue = ListrDefaultRendererValue> = ListrOptions<Ctx> &
Omit<ListrDefaultRendererOptions<Renderer>, 'renderer'>

/** The internal communication event. */
export type ListrEvent =
  | {
    type: Exclude<ListrEventType, 'MESSAGE'>
    data?: string | boolean
  }
  | {
    type: ListrEventType.MESSAGE
    data: Task<any, any>['message']
  }
