#!/usr/bin/env node

/**
 * Read-only release eligibility. Never creates, moves, or deletes tags.
 *
 * Usage:
 *   node scripts/release-eligibility.js \
 *     --ref refs/heads/main \
 *     --ref-name main \
 *     --source-sha <sha> \
 *     --package-version 3.19.0 \
 *     --remote <url-or-path>
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function candidateTagFromVersion(version) {
  const trimmed = String(version ?? '').trim();
  if (!trimmed) {
    throw new Error('package version is required');
  }
  return trimmed.startsWith('v') ? trimmed : `v${trimmed}`;
}

export function classifyRemoteTag({ remoteSha, sourceSha }) {
  if (!remoteSha) return 'absent';
  if (remoteSha === sourceSha) return 'same-SHA';
  return 'wrong-SHA';
}

export function inspectRemoteTag(remote, tagName) {
  const output = execFileSync('git', ['ls-remote', '--tags', remote, `refs/tags/${tagName}`], {
    encoding: 'utf8',
  }).trim();
  if (!output) return null;
  return output.split(/\s+/)[0] ?? null;
}

export function evaluateEligibility({ ref, refName, sourceSha, packageVersion, remoteTagSha }) {
  if (!sourceSha || !/^[0-9a-f]{40}$/i.test(sourceSha)) {
    throw new Error('source SHA must be a 40-character hex object id');
  }

  if (String(ref ?? '').startsWith('refs/tags/')) {
    return {
      eligible: false,
      should_release: false,
      publish_intent: false,
      mutation: false,
      tag_name: refName || String(ref).slice('refs/tags/'.length),
      source_sha: sourceSha,
      classification: 'tag-trigger',
      reason: 'tag-triggered runs validate only and must not publish or mutate',
    };
  }

  const tagName = candidateTagFromVersion(packageVersion);
  const classification = classifyRemoteTag({ remoteSha: remoteTagSha, sourceSha });

  if (classification === 'wrong-SHA') {
    return {
      eligible: false,
      should_release: false,
      publish_intent: false,
      mutation: false,
      fail: true,
      tag_name: tagName,
      source_sha: sourceSha,
      classification,
      reason: `tag ${tagName} exists at ${remoteTagSha}, not ${sourceSha}`,
    };
  }

  return {
    eligible: true,
    should_release: true,
    publish_intent: false,
    mutation: false,
    retry: classification === 'same-SHA',
    tag_name: tagName,
    source_sha: sourceSha,
    classification,
    reason:
      classification === 'same-SHA'
        ? 'same-SHA tag permits retry without mutation'
        : 'absent tag is eligible at the immutable source SHA',
  };
}

export function formatGithubOutputs(result) {
  const lines = [
    `tag_name=${result.tag_name}`,
    `source_sha=${result.source_sha}`,
    `should_release=${result.should_release ? 'true' : 'false'}`,
    `eligible=${result.eligible ? 'true' : 'false'}`,
    `classification=${result.classification}`,
    `publish_intent=${result.publish_intent ? 'true' : 'false'}`,
    `mutation=${result.mutation ? 'true' : 'false'}`,
  ];
  return `${lines.join('\n')}\n`;
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    args[key.slice(2)] = argv[i + 1];
    i += 1;
  }
  return args;
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const remote = args.remote ?? 'origin';
  const packageVersion =
    args['package-version'] ??
    JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')).version;
  const sourceSha = args['source-sha'];
  const tagName = String(args.ref ?? '').startsWith('refs/tags/')
    ? args['ref-name']
    : candidateTagFromVersion(packageVersion);
  const remoteTagSha = inspectRemoteTag(remote, tagName);
  const result = evaluateEligibility({
    ref: args.ref,
    refName: args['ref-name'],
    sourceSha,
    packageVersion,
    remoteTagSha,
  });

  if (result.fail) {
    process.stderr.write(`${result.reason}\n`);
    if (env.GITHUB_OUTPUT) {
      fs.appendFileSync(env.GITHUB_OUTPUT, formatGithubOutputs(result));
    }
    if (env.RELEASE_ELIGIBILITY_CLI === '1') {
      process.exitCode = 1;
    }
    return result;
  }

  if (env.GITHUB_OUTPUT) {
    fs.appendFileSync(env.GITHUB_OUTPUT, formatGithubOutputs(result));
  } else {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.env.RELEASE_ELIGIBILITY_CLI = '1';
  main();
}
