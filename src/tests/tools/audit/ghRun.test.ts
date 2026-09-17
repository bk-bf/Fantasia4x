import { describe, it, expect } from 'vitest';
import { restPlan } from '../../../../tools/audit/lib/gh-run.mjs';
import { restIdOf, selectFieldsFromRest } from '../../../../tools/audit/lib/board-rest.mjs';

type Call = [string, string, unknown];

function fakeIo(responses: Record<string, unknown> = {}, failing: Record<string, string> = {}) {
  const calls: Call[] = [];
  const io = {
    repo: () => 'bk-bf/Fantasia4x',
    api: (method: string, path: string, body?: unknown) => {
      calls.push([method, path, body]);
      if (failing[`${method} ${path}`]) throw Object.assign(new Error('failed'), { stderr: failing[`${method} ${path}`] });
      return responses[`${method} ${path}`] ?? {};
    },
    pages: (path: string) => {
      calls.push(['PAGES', path, undefined]);
      return (responses[`PAGES ${path}`] as unknown[]) ?? [];
    },
    readFile: () => 'body from a file'
  };
  return { calls, io };
}

const run = (args: string[], io: unknown, input?: string) => {
  const plan = restPlan(args, input, io);
  expect(plan).not.toBeNull();
  return plan();
};

const restPull = (n: number, merged: boolean) => ({
  number: n,
  title: `pull ${n}`,
  body: `Fixes #${n + 100}`,
  html_url: `https://github.com/bk-bf/Fantasia4x/pull/${n}`,
  state: 'closed',
  draft: false,
  head: { ref: `fix/thing-${n}`, sha: `sha${n}` },
  base: { ref: 'dev' },
  labels: [{ name: 'tools', color: 'fff' }],
  merged_at: merged ? '2026-09-17T15:28:01Z' : null,
  merge_commit_sha: `merge${n}`
});

describe('gh commands answered over REST', () => {
  it('lists merged pull requests with their merge commit, skipping closed ones', () => {
    const path = 'repos/bk-bf/Fantasia4x/pulls?state=closed&per_page=100&base=dev';
    const { io } = fakeIo({ [`PAGES ${path}`]: [restPull(1, true), restPull(2, false)] });
    const out = JSON.parse(
      run(['pr', 'list', '--base', 'dev', '--state', 'merged', '--limit', '30', '--json', 'number,headRefName,body,mergeCommit,mergedAt'], io)
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      number: 1,
      headRefName: 'fix/thing-1',
      body: 'Fixes #101',
      mergeCommit: { oid: 'merge1' },
      labels: [{ name: 'tools' }]
    });
  });

  it('lists issues without the pull requests the issues endpoint also returns', () => {
    const path = 'repos/bk-bf/Fantasia4x/issues?state=all&per_page=100';
    const { io } = fakeIo({
      [`PAGES ${path}`]: [
        { number: 5, title: 'an issue', state: 'closed', labels: [{ name: 'tools' }], created_at: 'c', updated_at: 'u' },
        { number: 6, title: 'a pull request', state: 'open', labels: [], pull_request: {} }
      ]
    });
    const out = JSON.parse(run(['issue', 'list', '--state', 'all', '--limit', '400', '--json', 'number,title,body,state,labels'], io));
    expect(out).toEqual([
      expect.objectContaining({ number: 5, state: 'CLOSED', body: '', labels: [{ name: 'tools' }], createdAt: 'c' })
    ]);
  });

  it('views an issue with its comments', () => {
    const { io } = fakeIo({
      'GET repos/bk-bf/Fantasia4x/issues/7': { number: 7, title: 't', body: 'b', state: 'open', labels: [] },
      'PAGES repos/bk-bf/Fantasia4x/issues/7/comments?per_page=100': [
        { body: '**Answered** yes', user: { login: 'bk-bf' }, created_at: 'c' }
      ]
    });
    const out = JSON.parse(run(['issue', 'view', '7', '--json', 'comments'], io));
    expect(out.comments.at(-1)).toEqual(expect.objectContaining({ body: '**Answered** yes', author: { login: 'bk-bf' } }));
  });

  it('edits the body, adds labels and removes labels, ignoring a label already gone', () => {
    const { io, calls } = fakeIo({}, { 'DELETE repos/bk-bf/Fantasia4x/issues/9/labels/needs%20decision': 'HTTP 404' });
    run(['issue', 'edit', '9', '--body-file', '-', '--add-label', 'ready', '--remove-label', 'needs decision'], io, 'new body');
    expect(calls).toEqual([
      ['PATCH', 'repos/bk-bf/Fantasia4x/issues/9', { body: 'new body' }],
      ['POST', 'repos/bk-bf/Fantasia4x/issues/9/labels', { labels: ['ready'] }],
      ['DELETE', 'repos/bk-bf/Fantasia4x/issues/9/labels/needs%20decision', undefined]
    ]);
  });

  it('sets a milestone by its title', () => {
    const { io, calls } = fakeIo({
      'PAGES repos/bk-bf/Fantasia4x/milestones?state=all&per_page=100': [{ title: 'v0.3 - Code health', number: 12 }]
    });
    run(['issue', 'edit', '9', '--milestone', 'v0.3 - Code health'], io);
    expect(calls).toContainEqual(['PATCH', 'repos/bk-bf/Fantasia4x/issues/9', { milestone: 12 }]);
  });

  it('closes an issue with a comment naming the commit', () => {
    const { io, calls } = fakeIo();
    run(['issue', 'close', '4', '--reason', 'completed', '--comment', 'Fixed in abc123.'], io);
    expect(calls).toEqual([
      ['POST', 'repos/bk-bf/Fantasia4x/issues/4/comments', { body: 'Fixed in abc123.' }],
      ['PATCH', 'repos/bk-bf/Fantasia4x/issues/4', { state: 'closed', state_reason: 'completed' }]
    ]);
  });

  it('posts a comment and prints its address', () => {
    const { io } = fakeIo({
      'POST repos/bk-bf/Fantasia4x/issues/4/comments': { html_url: 'https://github.com/bk-bf/Fantasia4x/issues/4#c1' }
    });
    expect(run(['issue', 'comment', '4', '--body-file', '-'], io, 'hi')).toBe(
      'https://github.com/bk-bf/Fantasia4x/issues/4#c1\n'
    );
  });

  it('adds an issue to the board by its database id', () => {
    const { io, calls } = fakeIo({
      'GET repos/bk-bf/Fantasia4x/issues/42': { id: 999 },
      'POST /users/bk-bf/projectsV2/4/items': { node_id: 'PVTI_x' }
    });
    const out = run(['project', 'item-add', '4', '--owner', 'bk-bf', '--format', 'json', '--url', 'https://github.com/bk-bf/Fantasia4x/issues/42'], io);
    expect(JSON.parse(out)).toEqual({ id: 'PVTI_x' });
    expect(calls).toContainEqual(['POST', '/users/bk-bf/projectsV2/4/items', { type: 'Issue', id: 999 }]);
  });

  it('names the repository', () => {
    const { io } = fakeIo();
    expect(JSON.parse(run(['repo', 'view', '--json', 'nameWithOwner'], io))).toEqual({ nameWithOwner: 'bk-bf/Fantasia4x' });
  });

  it('answers nothing it cannot translate exactly', () => {
    const { io } = fakeIo();
    expect(restPlan(['api', 'graphql', '-f', 'query={}'], undefined, io)).toBeNull();
    expect(restPlan(['issue', 'list', '--search', 'x'], undefined, io)).toBeNull();
    expect(restPlan(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], undefined, io)).toBeNull();
    expect(restPlan(['issue', 'create', '--title', 't'], undefined, io)).toBeNull();
  });
});

describe('board lookups over REST', () => {
  it('finds a card or field REST id by its GraphQL node id', () => {
    const pages = [[{ id: 1, node_id: 'A' }], [{ id: 2, node_id: 'B' }]];
    expect(restIdOf(pages, 'B')).toBe(2);
    expect(restIdOf(pages, 'C')).toBeNull();
  });

  it('shapes single-select fields the way the GraphQL read does', () => {
    const pages = [[
      { id: 1, node_id: 'F1', name: 'Status', data_type: 'single_select', options: [{ id: 'o1', name: { raw: 'Ready', html: 'Ready' } }] },
      { id: 2, node_id: 'F2', name: 'Title', data_type: 'title' }
    ]];
    expect(selectFieldsFromRest(pages)).toEqual([{ id: 'F1', name: 'Status', options: [{ id: 'o1', name: 'Ready' }] }]);
  });
});
