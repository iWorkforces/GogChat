#!/usr/bin/env node

/**
 * Sole tag-write helper. Rechecks the remote immediately before creating a tag.
 * Never force-pushes, deletes, or moves an existing tag.
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { classifyRemoteTag, inspectRemoteTag, parseArgs } from './release-eligibility.js';

export function planTagWrite({ remoteSha, sourceSha }) {
  const classification = classifyRemoteTag({ remoteSha, sourceSha });
  if (classification === 'absent') {
    return { action: 'create', write: true, ok: true, classification };
  }
  if (classification === 'same-SHA') {
    return {
      action: 'retry',
      write: false,
      ok: true,
      classification,
      reason: 'same-SHA tag already exists; continue without moving it',
    };
  }
  return {
    action: 'fail',
    write: false,
    ok: false,
    classification,
    reason: `refusing to move tag: remote is ${remoteSha}, source is ${sourceSha}`,
  };
}

export function applyTagWrite({ cwd, remote, tagName, sourceSha }) {
  const remoteSha = inspectRemoteTag(remote, tagName);
  const planned = planTagWrite({ remoteSha, sourceSha });
  if (!planned.ok) {
    const error = new Error(planned.reason);
    error.plan = planned;
    throw error;
  }
  if (!planned.write) {
    return { ...planned, remoteSha };
  }

  try {
    execFileSync('git', ['tag', tagName, sourceSha], { cwd, encoding: 'utf8' });
    execFileSync('git', ['push', remote, tagName], { cwd, encoding: 'utf8' });
    return { ...planned, remoteSha: sourceSha };
  } catch (error) {
    const raced = inspectRemoteTag(remote, tagName);
    const recovery = planTagWrite({ remoteSha: raced, sourceSha });
    if (recovery.action === 'retry') {
      return { ...recovery, remoteSha: raced, raced: true };
    }
    const wrapped = new Error(recovery.reason ?? String(error));
    wrapped.cause = error;
    throw wrapped;
  }
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const result = applyTagWrite({
    cwd: args.cwd ?? process.cwd(),
    remote: args.remote ?? 'origin',
    tagName: args.tag,
    sourceSha: args['source-sha'],
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
