import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  candidateTagFromVersion,
  classifyRemoteTag,
  evaluateEligibility,
  inspectRemoteTag,
  main,
  sanitizeReleaseTagName,
} from './release-eligibility.js';

const leftovers = [];

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function makeBareRemote() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gogchat-elig-remote-'));
  leftovers.push(dir);
  git(dir, ['init', '--bare']);
  return dir;
}

function makeWorktree(remote) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gogchat-elig-work-'));
  leftovers.push(dir);
  git(dir, ['init']);
  git(dir, ['config', 'user.email', 'eligibility@example.test']);
  git(dir, ['config', 'user.name', 'Eligibility']);
  fs.writeFileSync(path.join(dir, 'README'), 'eligibility');
  git(dir, ['add', 'README']);
  git(dir, ['commit', '-m', 'init']);
  git(dir, ['remote', 'add', 'origin', remote]);
  git(dir, ['push', 'origin', 'HEAD:main']);
  return { dir, sha: git(dir, ['rev-parse', 'HEAD']) };
}

describe('release-eligibility', () => {
  afterEach(() => {
    for (const dir of leftovers.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('builds a v-prefixed candidate tag', () => {
    expect(candidateTagFromVersion('3.19.0')).toBe('v3.19.0');
    expect(candidateTagFromVersion('v3.19.0')).toBe('v3.19.0');
  });

  it('rejects unsafe tag names before touching git', () => {
    expect(sanitizeReleaseTagName('v3.19.0')).toBe('v3.19.0');
    expect(sanitizeReleaseTagName('v3.19.0-rc.1')).toBe('v3.19.0-rc.1');
    expect(() => sanitizeReleaseTagName('v3.19.0;rm -rf /')).toThrow(/invalid release tag name/);
    expect(() => sanitizeReleaseTagName('../v3.19.0')).toThrow(/invalid release tag name/);
    expect(() => sanitizeReleaseTagName('refs/tags/v3.19.0')).toThrow(/invalid release tag name/);
  });

  it('classifies absent, same-SHA, and wrong-SHA remote tags', () => {
    expect(classifyRemoteTag({ remoteSha: null, sourceSha: 'a'.repeat(40) })).toBe('absent');
    expect(classifyRemoteTag({ remoteSha: 'a'.repeat(40), sourceSha: 'a'.repeat(40) })).toBe(
      'same-SHA'
    );
    expect(classifyRemoteTag({ remoteSha: 'b'.repeat(40), sourceSha: 'a'.repeat(40) })).toBe(
      'wrong-SHA'
    );
  });

  it('does not mutate a disposable remote for absent, same-SHA, wrong-SHA, or tag-trigger', () => {
    const remote = makeBareRemote();
    const work = makeWorktree(remote);
    const before = execFileSync('git', ['ls-remote', remote], { encoding: 'utf8' });

    const absent = evaluateEligibility({
      ref: 'refs/heads/main',
      refName: 'main',
      sourceSha: work.sha,
      packageVersion: '3.19.0',
      remoteTagSha: inspectRemoteTag(remote, 'v3.19.0'),
    });
    expect(absent.classification).toBe('absent');
    expect(absent.eligible).toBe(true);
    expect(absent.should_release).toBe(true);
    expect(absent.mutation).toBe(false);

    execFileSync('git', ['tag', 'v3.19.0', work.sha], { cwd: work.dir });
    execFileSync('git', ['push', remote, 'v3.19.0'], { cwd: work.dir });
    const same = evaluateEligibility({
      ref: 'refs/heads/main',
      refName: 'main',
      sourceSha: work.sha,
      packageVersion: '3.19.0',
      remoteTagSha: inspectRemoteTag(remote, 'v3.19.0'),
    });
    expect(same.classification).toBe('same-SHA');
    expect(same.retry).toBe(true);
    expect(same.should_release).toBe(true);

    const wrong = evaluateEligibility({
      ref: 'refs/heads/main',
      refName: 'main',
      sourceSha: 'c'.repeat(40),
      packageVersion: '3.19.0',
      remoteTagSha: inspectRemoteTag(remote, 'v3.19.0'),
    });
    expect(wrong.classification).toBe('wrong-SHA');
    expect(wrong.fail).toBe(true);
    expect(wrong.eligible).toBe(false);
    expect(wrong.should_release).toBe(false);

    const tagEvent = evaluateEligibility({
      ref: 'refs/tags/v3.19.0',
      refName: 'v3.19.0',
      sourceSha: work.sha,
      packageVersion: '3.19.0',
      remoteTagSha: inspectRemoteTag(remote, 'v3.19.0'),
    });
    expect(tagEvent.classification).toBe('tag-trigger');
    expect(tagEvent.publish_intent).toBe(false);
    expect(tagEvent.mutation).toBe(false);
    expect(tagEvent.should_release).toBe(false);

    const after = execFileSync('git', ['ls-remote', remote], { encoding: 'utf8' });
    expect(after).toBe(execFileSync('git', ['ls-remote', remote], { encoding: 'utf8' }));
    expect(after).toContain(before.trim().split('\n')[0] ?? '');
    expect(
      main([
        '--ref',
        'refs/heads/main',
        '--ref-name',
        'main',
        '--source-sha',
        work.sha,
        '--package-version',
        '9.9.9',
        '--remote',
        remote,
      ]).classification
    ).toBe('absent');
    expect(execFileSync('git', ['ls-remote', remote], { encoding: 'utf8' })).toBe(after);
  });

  it('peels annotated tags to the commit SHA', () => {
    const remote = makeBareRemote();
    const work = makeWorktree(remote);
    git(work.dir, ['tag', '-a', 'v3.19.0', '-m', 'annotated', work.sha]);
    git(work.dir, ['push', 'origin', 'refs/tags/v3.19.0']);

    const peeled = inspectRemoteTag(remote, 'v3.19.0');
    expect(peeled).toBe(work.sha);
    const raw = execFileSync(
      'git',
      ['ls-remote', '--tags', remote, 'refs/tags/v3.19.0', 'refs/tags/v3.19.0^{}'],
      { encoding: 'utf8' }
    );
    expect(raw).toContain('^{}');
    const tagObjectSha = raw
      .split('\n')
      .find((line) => line.includes('refs/tags/v3.19.0') && !line.includes('^{}'))
      ?.split(/\s+/)[0];
    expect(tagObjectSha).toBeTruthy();
    expect(tagObjectSha).not.toBe(work.sha);
  });
});
