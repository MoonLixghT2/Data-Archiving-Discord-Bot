/**
 * Async Queue Utility
 *
 * A lightweight concurrency-limited task queue.
 * Runs at most `concurrency` tasks simultaneously.
 */

'use strict';

class AsyncQueue {
  /**
   * @param {number} concurrency - Maximum simultaneous running tasks
   */
  constructor(concurrency = 1) {
    this.concurrency = concurrency;
    this._running = 0;
    this._queue = [];
    this.isPaused = false;
  }

  /**
   * Adds a task function to the queue.
   * Returns a Promise that resolves with the task's return value.
   * @param {Function} taskFn - Async function to enqueue
   * @returns {Promise<any>}
   */
  add(taskFn) {
    return new Promise((resolve, reject) => {
      this._queue.push({ taskFn, resolve, reject });
      this._tick();
    });
  }

  /**
   * Pauses queue processing. Running tasks complete normally.
   */
  pause() {
    this.isPaused = true;
  }

  /**
   * Resumes queue processing.
   */
  resume() {
    this.isPaused = false;
    this._tick();
  }

  /**
   * Clears all pending (not yet running) tasks.
   */
  clear() {
    this._queue = [];
  }

  /** @type {number} Number of tasks waiting in the queue */
  get size() {
    return this._queue.length;
  }

  /** @type {number} Number of tasks currently running */
  get pending() {
    return this._running;
  }

  /**
   * Returns a Promise that resolves when all current tasks finish.
   * @returns {Promise<void>}
   */
  onIdle() {
    if (this._running === 0 && this._queue.length === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (this._running === 0 && this._queue.length === 0) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });
  }

  _tick() {
    if (this.isPaused) return;
    while (this._running < this.concurrency && this._queue.length > 0) {
      const { taskFn, resolve, reject } = this._queue.shift();
      this._running++;
      Promise.resolve()
        .then(() => taskFn())
        .then(resolve, reject)
        .finally(() => {
          this._running--;
          this._tick();
        });
    }
  }
}

module.exports = AsyncQueue;
