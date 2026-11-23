'use strict';

const readline = require('readline');
const { action } = require('../util');
const EventEmitter = require('events');
const { beep, cursor } = require('sisteransi');
const color = require('kleur');

const inputs = new WeakMap();

function inputFor(stream) {
  let input = inputs.get(stream);
  if (input) return input;
  input = { queue: [], prompt: null, handoff: false, ended: !!stream.readableEnded };
  inputs.set(stream, input);
  let afterReturn = false;
  stream.on('keypress', (str, key = {}) => {
    const crlf = afterReturn && key.name === 'enter' && !stream.isTTY;
    afterReturn = key.name === 'return';
    if (crlf || (!input.prompt && !input.handoff)) return;
    input.queue.push([str, key]);
    drain(input);
  });
  stream.on('end', () => {
    input.ended = true;
    drain(input);
  });
  return input;
}

function drain(input) {
  const ready = p => p && p.ready && !p.busy && !p.closed;
  while (input.queue.length && ready(input.prompt)) {
    input.prompt.dispatch(...input.queue.shift());
  }
  if (input.ended && !input.queue.length && ready(input.prompt)) {
    input.prompt.abort();
  }
}

/**
 * Base prompt skeleton
 * @param {Stream} [opts.stdin] The Readable stream to listen to
 * @param {Stream} [opts.stdout] The Writable stream to write readline data to
 */
class Prompt extends EventEmitter {
  constructor(opts={}) {
    super();

    this.firstRender = true;
    this.in = opts.stdin || process.stdin;
    this.out = opts.stdout || process.stdout;
    this.onRender = (opts.onRender || (() => void 0)).bind(this);
    const rl = readline.createInterface({ input:this.in, escapeCodeTimeout:50 });
    readline.emitKeypressEvents(this.in, rl);

    if (this.in.isTTY) this.in.setRawMode(true);
    const isSelect = [ 'SelectPrompt', 'MultiselectPrompt' ].indexOf(this.constructor.name) > -1;
    const input = inputFor(this.in);

    this.dispatch = (str, key) => {
      let a = action(key, isSelect);
      let result;
      if (a === false) {
        result = this._ && this._(str, key);
      } else if (typeof this[a] === 'function') {
        result = this[a](key);
      } else {
        this.bell();
      }
      if (result && typeof result.then === 'function') {
        this.busy = true;
        const done = () => {
          this.busy = false;
          drain(input);
        };
        result.then(done, done);
      }
    };

    this.close = () => {
      this.out.write(cursor.show);
      if (input.prompt === this) {
        input.prompt = null;
        input.handoff = true;
        setImmediate(() => { input.handoff = false; });
      }
      if (this.in.isTTY) this.in.setRawMode(false);
      rl.close();
      this.emit(this.aborted ? 'abort' : this.exited ? 'exit' : 'submit', this.value);
      this.closed = true;
    };

    input.prompt = this;
    process.nextTick(() => {
      this.ready = true;
      drain(input);
    });
  }

  fire() {
    this.emit('state', {
      value: this.value,
      aborted: !!this.aborted,
      exited: !!this.exited
    });
  }

  bell() {
    this.out.write(beep);
  }

  render() {
    this.onRender(color);
    if (this.firstRender) this.firstRender = false;
  }
}

module.exports = Prompt;
