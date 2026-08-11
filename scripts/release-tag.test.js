import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { applyTagWrite, planTagWrite } from './release-tag.js';
import { inspectRemoteTag } from './release-eligibility.js';

const leftovers = [];

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function makeBareRemote() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gogchat-tag-remote-'));
  leftovers.push(dir);
  git(dir, ['init', '--bare']);
  return dir;
}

function makeWorktree(remote, { pushMain = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gogchat-tag-work-'));
  leftovers.push(dir);
  git(dir, ['init']);
  git(dir, ['config', 'user.email', 'tag@example.test']);
  git(dir, ['config', 'user.name', 'Tag']);
  fs.writeFileSync(path.join(dir, 'README'), 'tag');
  git(dir, ['add', 'README']);
  git(dir, ['commit', '-m', 'init']);
  git(dir, ['remote', 'add', 'origin', remote]);
  if (pushMain) {
    git(dir, ['push', 'origin', 'HEAD:main']);
  }
  return { dir, sha: git(dir, ['rev-parse', 'HEAD']) };
}

function cloneWorktree(sourceDir, remote) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gogchat-tag-clone-'));
  leftovers.push(dir);
  git(sourceDir, ['clone', '--local', sourceDir, dir]);
  git(dir, ['remote', 'set-url', 'origin', remote]);
  return { dir, sha: git(dir, ['rev-parse', 'HEAD']) };
}

describe('release-tag write planner', () => {
  afterEach(() => {
    for (const dir of leftovers.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates an absent tag, retries same-SHA, and refuses wrong-SHA without moving', () => {
    const remote = makeBareRemote();
    const work = makeWorktree(remote);

    expect(planTagWrite({ remoteSha: null, sourceSha: work.sha })).toEqual(
      expect.objectContaining({ action: 'create', write: true, ok: true })
    );

    const created = applyTagWrite({
      cwd: work.dir,
      remote,
      tagName: 'v3.19.0',
      sourceSha: work.sha,
    });
    expect(created.action).toBe('create');
    expect(inspectRemoteTag(remote, 'v3.19.0')).toBe(work.sha);

    const retry = applyTagWrite({
      cwd: work.dir,
      remote,
      tagName: 'v3.19.0',
      sourceSha: work.sha,
    });
    expect(retry.action).toBe('retry');
    expect(retry.write).toBe(false);
    expect(inspectRemoteTag(remote, 'v3.19.0')).toBe(work.sha);

    fs.writeFileSync(path.join(work.dir, 'OTHER'), 'other');
    git(work.dir, ['add', 'OTHER']);
    git(work.dir, ['commit', '-m', 'other']);
    const otherSha = git(work.dir, ['rev-parse', 'HEAD']);

    expect(() =>
      applyTagWrite({
        cwd: work.dir,
        remote,
        tagName: 'v3.19.0',
        sourceSha: otherSha,
      })
    ).toThrow(/wrong-SHA|refusing/);
    expect(inspectRemoteTag(remote, 'v3.19.0')).toBe(work.sha);
  });

  it('pushes refs/tags/ and refuses a later different-SHA writer', () => {
    const remote = makeBareRemote();
    const work = makeWorktree(remote);

    applyTagWrite({
      cwd: work.dir,
      remote,
      tagName: 'v3.19.0',
      sourceSha: work.sha,
    });

    const remoteRefs = execFileSync('git', ['ls-remote', '--tags', remote], { encoding: 'utf8' });
    expect(remoteRefs).toContain('refs/tags/v3.19.0');

    fs.writeFileSync(path.join(work.dir, 'OTHER'), 'other');
    git(work.dir, ['add', 'OTHER']);
    git(work.dir, ['commit', '-m', 'other']);
    const otherSha = git(work.dir, ['rev-parse', 'HEAD']);

    expect(() =>
      applyTagWrite({
        cwd: work.dir,
        remote,
        tagName: 'v3.19.0',
        sourceSha: otherSha,
      })
    ).toThrow(/wrong-SHA|refusing/);
    expect(inspectRemoteTag(remote, 'v3.19.0')).toBe(work.sha);
  });

  it('rejects an unsafe tag name before writing', () => {
    const remote = makeBareRemote();
    const work = makeWorktree(remote);
    expect(() =>
      applyTagWrite({
        cwd: work.dir,
        remote,
        tagName: 'v3.19.0;rm -rf /',
        sourceSha: work.sha,
      })
    ).toThrow(/invalid release tag name/);
    expect(execFileSync('git', ['ls-remote', '--tags', remote], { encoding: 'utf8' }).trim()).toBe(
      ''
    );
  });

  it('lets one of two concurrent writers win without moving the tag', () => {
    const remote = makeBareRemote();
    const first = makeWorktree(remote);
    const second = cloneWorktree(first.dir, remote);
    expect(second.sha).toBe(first.sha);

    const results = [first, second].map((work) => {
      try {
        return applyTagWrite({
          cwd: work.dir,
          remote,
          tagName: 'v9.0.0',
          sourceSha: first.sha,
        });
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    });

    const actions = results.map((result) => result.action).filter(Boolean);
    expect(actions.some((action) => action === 'create' || action === 'retry')).toBe(true);
    expect(results.every((result) => result.ok !== false || result.action === 'retry')).toBe(true);
    expect(inspectRemoteTag(remote, 'v9.0.0')).toBe(first.sha);
  });
});
