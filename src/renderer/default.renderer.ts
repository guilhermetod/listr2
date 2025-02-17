import * as cliTruncate from 'cli-truncate'
import * as figures from 'figures'
import * as indentString from 'indent-string'
import * as logUpdate from 'log-update'
import { EOL } from 'os'
import * as cliWrap from 'wrap-ansi'

import { ListrContext } from '@interfaces/listr.interface'
import { ListrRenderer } from '@interfaces/renderer.interface'
import { Task } from '@lib/task'
import chalk from '@utils/chalk'
import { parseTaskTime } from '@utils/parse-time'

/** Default updating renderer for Listr2 */
export class DefaultRenderer implements ListrRenderer {
  /** designates whether this renderer can output to a non-tty console */
  public static nonTTY = false
  /** renderer options for the defauult renderer */
  public static rendererOptions: {
    /**
     * indentation per level of subtask
     * @default 2
     */
    indentation?: number
    /**
     * clear output when task finishes
     * @default false
     * @global global option that can not be temperated with from subtasks
     */
    clearOutput?: boolean
    /**
     * show the subtasks of the current task if it returns a new listr
     * @default true
     * @global global option that can not be temperated with from subtasks
     */
    showSubtasks?: boolean
    /**
     * collapse subtasks after finish
     * @default true
     */
    collapse?: boolean
    /**
     * collapse skip messages in to single message and override the task title
     * @default true
     */
    collapseSkips?: boolean
    /**
     * show skip messages or show the original title of the task, this will also disable collapseSkips mode
     *
     * You can disable showing the skip messages, eventhough you passed in a message by settings this option,
     * if you want to keep the original task title intacted.
     * @default true
     */
    showSkipMessage?: boolean
    /**
     * suffix skip messages with [SKIPPED] when in collapseSkips mode
     * @default true
     */
    suffixSkips?: boolean
    /**
     * collapse error messages in to single message in task title
     * @default true
     */
    collapseErrors?: boolean
    /**
     * shows the thrown error message or show the original title of the task, this will also disable collapseErrors mode
     * You can disable showing the error messages, eventhough you passed in a message by settings this option,
     * if you want to keep the original task title intacted.
     * @default true
     */
    showErrorMessage?: boolean
    /**
     * suffix retry messages with [RETRY-${COUNT}] when retry is enabled for a task
     * @default true
     */
    suffixRetries?: boolean
    /**
     * only update via renderhook
     *
     * useful for tests and stuff. this will disable showing spinner and only update the screen if the something else has
     * happened in the task worthy to show
     * @default false
     * @global global option that can not be temperated with from subtasks
     */
    lazy?: boolean
    /**
     * show duration for all tasks
     *
     * overwrites per task renderer options
     * @default false
     * @global global option that can not be temperated with from subtasks
     */
    showTimer?: boolean
    /**
     * removes empty lines from the data output
     *
     * @default true
     */
    removeEmptyLines?: boolean
    /**
     * formats data output depending on your requirements.
     * log-update mostly breaks if there is no wrap, so there is many options to choose your preference
     *
     * @default 'truncate'
     * @global global option that can not be temperated with from subtasks
     */
    formatOutput?: 'truncate' | 'wrap'
  } = {
    indentation: 2,
    clearOutput: false,
    showSubtasks: true,
    collapse: true,
    collapseSkips: true,
    showSkipMessage: true,
    suffixSkips: true,
    collapseErrors: true,
    showErrorMessage: true,
    suffixRetries: true,
    lazy: false,
    showTimer: false,
    removeEmptyLines: true,
    formatOutput: 'truncate'
  }

  /** per task options for the default renderer */
  public static rendererTaskOptions: {
    /**
     * write task output to bottom bar instead of the gap under the task title itself.
     * useful for stream of data.
     * @default false
     *
     * `true` only keep 1 line of latest data outputted by the task.
     * `false` only keep 1 line of latest data outputted by the task.
     * `number` will keep designated data of latest data outputted by the task.
     */
    bottomBar?: boolean | number
    /**
     * keep output after task finishes
     * @default false
     *
     * works both for bottom bar and the default behavior
     */
    persistentOutput?: boolean
    /**
     * show the task time if it was successful
     */
    showTimer?: boolean
  }

  private id?: NodeJS.Timeout
  private bottomBar: { [uuid: string]: { data?: string[], items?: number } } = {}
  private promptBar: string
  private spinner: string[] = process.platform === 'win32' && !process.env.WT_SESSION ? [ '-', '\\', '|', '/' ] : [ '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏' ]
  private spinnerPosition = 0

  constructor (public tasks: Task<any, typeof DefaultRenderer>[], public options: typeof DefaultRenderer['rendererOptions'], public renderHook$?: Task<any, any>['renderHook$']) {
    this.options = { ...DefaultRenderer.rendererOptions, ...this.options }
  }

  public getTaskOptions (task: Task<any, typeof DefaultRenderer>): typeof DefaultRenderer['rendererTaskOptions'] {
    return { ...DefaultRenderer.rendererTaskOptions, ...task.rendererTaskOptions }
  }

  public isBottomBar (task: Task<any, typeof DefaultRenderer>): boolean {
    const bottomBar = this.getTaskOptions(task).bottomBar

    return typeof bottomBar === 'number' && bottomBar !== 0 || typeof bottomBar === 'boolean' && bottomBar !== false
  }

  public hasPersistentOutput (task: Task<any, typeof DefaultRenderer>): boolean {
    return this.getTaskOptions(task).persistentOutput === true
  }

  public hasTimer (task: Task<any, typeof DefaultRenderer>): boolean {
    return this.getTaskOptions(task).showTimer === true
  }

  public getSelfOrParentOption<T extends keyof typeof DefaultRenderer['rendererOptions']>(
    task: Task<any, typeof DefaultRenderer>,
    key: T
  ): typeof DefaultRenderer['rendererOptions'][T] {
    return task?.rendererOptions?.[key] ?? this.options?.[key]
  }

  /* istanbul ignore next */
  public getTaskTime (task: Task<any, typeof DefaultRenderer>): string {
    return chalk.dim(`[${parseTaskTime(task.message.duration)}]`)
  }

  public createRender (options?: { tasks?: boolean, bottomBar?: boolean, prompt?: boolean }): string {
    options = {
      ...{
        tasks: true,
        bottomBar: true,
        prompt: true
      },
      ...options
    }

    const render: string[] = []

    const renderTasks = this.multiLineRenderer(this.tasks)
    const renderBottomBar = this.renderBottomBar()
    const renderPrompt = this.renderPrompt()

    if (options.tasks && renderTasks?.trim().length > 0) {
      render.push(renderTasks)
    }

    if (options.bottomBar && renderBottomBar?.trim().length > 0) {
      render.push((render.length > 0 ? EOL : '') + renderBottomBar)
    }

    if (options.prompt && renderPrompt?.trim().length > 0) {
      render.push((render.length > 0 ? EOL : '') + renderPrompt)
    }

    return render.length > 0 ? render.join(EOL) : ''
  }

  public render (): void {
    // Do not render if we are already rendering
    if (this.id) {
      return
    }

    const updateRender = (): void => logUpdate(this.createRender())

    /* istanbul ignore if */
    if (!this.options?.lazy) {
      this.id = setInterval(() => {
        this.spinnerPosition = ++this.spinnerPosition % this.spinner.length
        updateRender()
      }, 100)
    }

    this.renderHook$.subscribe(() => {
      updateRender()
    })
  }

  public end (): void {
    clearInterval(this.id)
    if (this.id) {
      this.id = undefined
    }

    // clear log updater
    logUpdate.clear()
    logUpdate.done()

    // directly write to process.stdout, since logupdate only can update the seen height of terminal
    if (!this.options.clearOutput) {
      process.stdout.write(this.createRender({ prompt: false }) + EOL)
    }
  }

  // eslint-disable-next-line
  private multiLineRenderer(tasks: Task<any, typeof DefaultRenderer>[], level = 0): string {
    let output: string[] = []

    for (const task of tasks) {
      if (task.isEnabled()) {
        // Current Task Title
        if (task.hasTitle()) {
          if (!(tasks.some((task) => task.hasFailed()) && !task.hasFailed() && task.options.exitOnError !== false && !(task.isCompleted() || task.isSkipped()))) {
            // if task is skipped
            if (task.hasFailed() && this.getSelfOrParentOption(task, 'collapseErrors')) {
              // current task title and skip change the title
              output = [
                ...output,
                this.formatString(
                  !task.hasSubtasks() && task.message.error && this.getSelfOrParentOption(task, 'showErrorMessage') ? task.message.error : task.title,
                  this.getSymbol(task),
                  level
                )
              ]
            } else if (task.isSkipped() && this.getSelfOrParentOption(task, 'collapseSkips')) {
              // current task title and skip change the title
              output = [
                ...output,
                this.formatString(
                  this.addSuffixToMessage(
                    task.message.skip && this.getSelfOrParentOption(task, 'showSkipMessage') ? task.message.skip : task.title,
                    'SKIPPED',
                    this.getSelfOrParentOption(task, 'suffixSkips')
                  ),
                  this.getSymbol(task),
                  level
                )
              ]
            } else if (task.isRetrying() && this.getSelfOrParentOption(task, 'suffixRetries')) {
              output = [ ...output, this.formatString(this.addSuffixToMessage(task.title, `RETRYING-${task.message.retry.count}`), this.getSymbol(task), level) ]
            } else if (task.isCompleted() && task.hasTitle() && (this.getSelfOrParentOption(task, 'showTimer') || this.hasTimer(task))) {
              // task with timer
              output = [ ...output, this.formatString(`${task?.title} ${this.getTaskTime(task)}`, this.getSymbol(task), level) ]
            } else {
              // normal state
              output = [ ...output, this.formatString(task.title, this.getSymbol(task), level) ]
            }
          } else {
            // some sibling task but self has failed and this has stopped
            output = [ ...output, this.formatString(task.title, chalk.red(figures.main.squareSmallFilled), level) ]
          }
        }

        // task should not have subtasks since subtasks will handle the error already
        // maybe it is a better idea to show the error or skip messages when show subtasks is disabled.
        if (!task.hasSubtasks() || !this.getSelfOrParentOption(task, 'showSubtasks')) {
          // without the collapse option for skip and errors
          if (
            task.hasFailed() &&
            this.getSelfOrParentOption(task, 'collapseErrors') === false &&
            (this.getSelfOrParentOption(task, 'showErrorMessage') || !this.getSelfOrParentOption(task, 'showSubtasks'))
          ) {
            // show skip data if collapsing is not defined
            output = [ ...output, this.dumpData(task, level, 'error') ]
          } else if (
            task.isSkipped() &&
            this.getSelfOrParentOption(task, 'collapseSkips') === false &&
            (this.getSelfOrParentOption(task, 'showSkipMessage') || !this.getSelfOrParentOption(task, 'showSubtasks'))
          ) {
            // show skip data if collapsing is not defined
            output = [ ...output, this.dumpData(task, level, 'skip') ]
          }
        }

        // Current Task Output
        if (task?.output) {
          if ((task.isPending() || task.isRetrying() || task.isRollingBack()) && task.isPrompt()) {
            // data output to prompt bar if prompt
            this.promptBar = task.output
          } else if (this.isBottomBar(task) || !task.hasTitle()) {
            // data output to bottom bar
            const data = [ this.dumpData(task, -1) ]

            // create new if there is no persistent storage created for bottom bar
            if (!this.bottomBar[task.id]) {
              this.bottomBar[task.id] = {}
              this.bottomBar[task.id].data = []

              const bottomBar = this.getTaskOptions(task).bottomBar
              if (typeof bottomBar === 'boolean') {
                this.bottomBar[task.id].items = 1
              } else {
                this.bottomBar[task.id].items = bottomBar
              }
            }

            // persistent bottom bar and limit items in it
            if (!this.bottomBar[task.id]?.data?.some((element) => data.includes(element)) && !task.isSkipped()) {
              this.bottomBar[task.id].data = [ ...this.bottomBar[task.id].data, ...data ]
            }
          } else if (task.isPending() || task.isRetrying() || task.isRollingBack() || this.hasPersistentOutput(task)) {
            // keep output if persistent output is set
            output = [ ...output, this.dumpData(task, level) ]
          }
        }

        // render subtasks, some complicated conditionals going on
        if (
          // check if renderer option is on first
          this.getSelfOrParentOption(task, 'showSubtasks') !== false &&
          // if it doesnt have subtasks no need to check
          task.hasSubtasks() &&
          (task.isPending() ||
            task.hasFailed() ||
            task.isCompleted() && !task.hasTitle() ||
            // have to be completed and have subtasks
            task.isCompleted() && this.getSelfOrParentOption(task, 'collapse') === false && !task.subtasks.some((subtask) => subtask.rendererOptions.collapse === true) ||
            // if any of the subtasks have the collapse option of
            task.subtasks.some((subtask) => subtask.rendererOptions.collapse === false) ||
            // if any of the subtasks has failed
            task.subtasks.some((subtask) => subtask.hasFailed()) ||
            // if any of the subtasks rolled back
            task.subtasks.some((subtask) => subtask.hasRolledBack()))
        ) {
          // set level
          const subtaskLevel = !task.hasTitle() ? level : level + 1

          // render the subtasks as in the same way
          const subtaskRender = this.multiLineRenderer(task.subtasks, subtaskLevel)
          if (subtaskRender?.trim() !== '' && !task.subtasks.every((subtask) => !subtask.hasTitle())) {
            output = [ ...output, subtaskRender ]
          }
        }

        // after task is finished actions
        if (task.isCompleted() || task.hasFailed() || task.isSkipped() || task.hasRolledBack()) {
          // clean up prompts
          this.promptBar = null

          // clean up bottom bar items if not indicated otherwise
          if (!this.hasPersistentOutput(task)) {
            delete this.bottomBar[task.id]
          }
        }
      }
    }

    output = output.filter(Boolean)
    if (output.length > 0) {
      return output.join(EOL)
    } else {
      return
    }
  }

  private renderBottomBar (): string {
    // parse through all objects return only the last mentioned items
    if (Object.keys(this.bottomBar).length > 0) {
      this.bottomBar = Object.keys(this.bottomBar).reduce((o, key) => {
        if (!o?.[key]) {
          o[key] = {}
        }

        o[key] = this.bottomBar[key]

        this.bottomBar[key].data = this.bottomBar[key].data.slice(-this.bottomBar[key].items)
        o[key].data = this.bottomBar[key].data
        return o
      }, {} as Record<string, { data?: string[], items?: number} | undefined>)

      return Object.values(this.bottomBar)
        .reduce((o, value) => o = [ ...o, ...value.data ], [])
        .filter(Boolean)
        .join(EOL)
    }
  }

  private renderPrompt (): string {
    if (this.promptBar) {
      return this.promptBar
    }
  }

  private dumpData (task: Task<ListrContext, typeof DefaultRenderer>, level: number, source: 'output' | 'skip' | 'error' = 'output'): string {
    let data: string | boolean
    switch (source) {
    case 'output':
      data = task.output
      break
    case 'skip':
      data = task.message.skip
      break
    case 'error':
      data = task.message.error
      break
    }

    // dont return anything on some occasions
    if (task.hasTitle() && source === 'error' && data === task.title) {
      return
    }

    if (typeof data === 'string') {
      return this.formatString(data, this.getSymbol(task, true), level + 1)
    }
  }

  private formatString (str: string, icon: string, level: number): string {
    // we dont like empty data around here
    if (str.trim() === '') {
      return
    }

    str = `${icon} ${str}`
    let parsedStr: string[]

    let columns = process.stdout.columns ? process.stdout.columns : 80
    columns = columns - level * this.options.indentation - 2

    switch (this.options.formatOutput) {
    case 'truncate':
      parsedStr = str.split(EOL).map((s, i) => {
        return cliTruncate(this.indentMultilineOutput(s, i), columns)
      })
      break

    case 'wrap':
      parsedStr = cliWrap(str, columns, { hard: true })
        .split(EOL)
        .map((s, i) => this.indentMultilineOutput(s, i))
      break

    default:
      throw new Error('Format option for the renderer is wrong.')
    }

    // this removes the empty lines
    if (this.options.removeEmptyLines) {
      parsedStr = parsedStr.filter(Boolean)
    }

    return indentString(parsedStr.join(EOL), level * this.options.indentation)
  }

  private indentMultilineOutput (str: string, i: number): string {
    return i > 0 ? indentString(str.trim(), 2, { includeEmptyLines: false }) : str.trim()
  }

  // eslint-disable-next-line complexity
  private getSymbol (task: Task<ListrContext, typeof DefaultRenderer>, data = false): string {
    if (task.isPending() && !data) {
      return this.options?.lazy || this.getSelfOrParentOption(task, 'showSubtasks') !== false && task.hasSubtasks() && !task.subtasks.every((subtask) => !subtask.hasTitle())
        ? chalk.yellow(figures.main.pointer)
        : chalk.yellowBright(this.spinner[this.spinnerPosition])
    } else if (task.isCompleted() && !data) {
      if (task.hasSubtasks() && task.subtasks.some((subtask) => subtask.hasFailed())) {
        return chalk.yellow(figures.main.warning)
      }

      return chalk.green(figures.main.tick)
    } else if (task.isRetrying() && !data) {
      return this.options?.lazy ? chalk.keyword('orange')(figures.main.warning) : chalk.keyword('orange')(this.spinner[this.spinnerPosition])
    } else if (task.isRollingBack() && !data) {
      return this.options?.lazy ? chalk.red(figures.main.warning) : chalk.red(this.spinner[this.spinnerPosition])
    } else if (task.hasRolledBack() && !data) {
      return chalk.red(figures.main.arrowLeft)
    } else if (task.hasFailed() && !data) {
      return task.hasSubtasks() ? chalk.red(figures.main.pointer) : chalk.red(figures.main.cross)
    } else if (task.isSkipped() && !data && this.getSelfOrParentOption(task, 'collapseSkips') === false) {
      return chalk.yellow(figures.main.warning)
    } else if (task.isSkipped() && (data || this.getSelfOrParentOption(task, 'collapseSkips'))) {
      return chalk.yellow(figures.main.arrowDown)
    }

    if (!data) {
      return chalk.dim(figures.main.squareSmallFilled)
    } else {
      return figures.main.pointerSmall
    }
  }

  private addSuffixToMessage (message: string, suffix: string, condition?: boolean): string {
    return condition ?? true ? message + chalk.dim(` [${suffix}]`) : message
  }
}
