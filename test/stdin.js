'use strict';

const test = require('tape');
const { PassThrough } = require('stream');
const prompt = require('../lib/index');

const io = () => {
  prompt._injected = undefined;
  return { stdin: new PassThrough(), stdout: new PassThrough() };
};

test('stdin: answers written in one chunk reach each prompt', (t) => {
  const { stdin, stdout } = io();
  const answers = prompt([
    { type: 'text', name: 'a', message: 'a', stdin, stdout, validate: async v => v !== 'bad' || 'no' },
    { type: 'confirm', name: 'b', message: 'b', stdin, stdout },
    { type: 'select', name: 'c', message: 'c', stdin, stdout, choices: [{ title: 'x' }, { title: 'y' }] },
    { type: 'text', name: 'd', message: 'd', stdin, stdout }
  ]);
  stdin.write('bad\n\b\b\bok\r\ny\x1b[B\rlast\n');
  answers.then(r => {
    t.same(r, { a: 'ok', b: true, c: 1, d: 'last' });
    t.end();
  });
});

test('stdin: ending before an answer cancels the prompt', (t) => {
  const { stdin, stdout } = io();
  let cancelled;
  const answers = prompt([
    { type: 'text', name: 'a', message: 'a', stdin, stdout },
    { type: 'number', name: 'b', message: 'b', stdin, stdout, validate: n => n > 0 || 'positive' }
  ], { onCancel: q => { cancelled = q.name; } });
  stdin.end('one\n\n');
  answers.then(r => {
    t.same(r, { a: 'one' });
    t.equal(cancelled, 'b');
    t.end();
  });
});

test('stdin: a prompt on an already ended stream cancels', (t) => {
  const { stdin, stdout } = io();
  let cancelled = false;
  stdin.on('end', () => {
    prompt({ type: 'toggle', name: 'a', message: 'a', stdin, stdout }, { onCancel: () => { cancelled = true; } })
      .then(r => {
        t.same(r, {});
        t.ok(cancelled);
        t.end();
      });
  });
  stdin.resume();
  stdin.end();
});
