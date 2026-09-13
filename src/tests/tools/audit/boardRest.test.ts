import { describe, it, expect } from 'vitest';
import { fromRest } from '../../../../tools/audit/lib/board-rest.mjs';

const restCard = {
  id: 245082702,
  node_id: 'PVTI_lAHOBlZOB84Bip03zg6bqk4',
  content_type: 'Issue',
  content: {
    number: 53,
    title: 'Panning the camera re-renders every world-effect overlay on every frame',
    body: 'What breaks',
    html_url: 'https://github.com/bk-bf/Fantasia4x/issues/53'
  },
  fields: [
    { data_type: 'single_select', name: 'Status', value: { id: 'a25ed474', name: { raw: 'Manual', html: 'Manual' } } },
    { data_type: 'single_select', name: 'Work type', value: { id: '1403ea1e', name: { raw: 'perf', html: 'perf' } } },
    { data_type: 'labels', name: 'Labels', value: [{ name: 'high' }, { name: 'needs playtest' }] },
    {
      data_type: 'milestone',
      name: 'Milestone',
      value: { title: 'v0.2 - Performance', description: 'The part of v0.2', due_on: '2026-11-27T00:00:00Z' }
    },
    { data_type: 'single_select', name: 'Agent', value: null }
  ]
};

describe('fromRest', () => {
  it('shapes a REST card the way gh project item-list does', () => {
    expect(fromRest(restCard, 'bk-bf/Fantasia4x')).toEqual({
      id: 'PVTI_lAHOBlZOB84Bip03zg6bqk4',
      title: 'Panning the camera re-renders every world-effect overlay on every frame',
      content: {
        type: 'Issue',
        number: 53,
        title: 'Panning the camera re-renders every world-effect overlay on every frame',
        body: 'What breaks',
        url: 'https://github.com/bk-bf/Fantasia4x/issues/53',
        repository: 'bk-bf/Fantasia4x'
      },
      status: 'Manual',
      'work type': 'perf',
      labels: ['high', 'needs playtest'],
      milestone: { title: 'v0.2 - Performance', description: 'The part of v0.2', dueOn: '2026-11-27T00:00:00Z' }
    });
  });

  it('leaves out a field the card has no value for', () => {
    expect(fromRest(restCard, 'bk-bf/Fantasia4x')).not.toHaveProperty('agent');
  });

  it('gives a milestone with no due date an empty dueOn', () => {
    const card = { ...restCard, fields: [{ data_type: 'milestone', name: 'Milestone', value: { title: 'v0.3 - Content', due_on: null } }] };
    expect(fromRest(card, 'bk-bf/Fantasia4x').milestone).toEqual({ title: 'v0.3 - Content', description: '', dueOn: '' });
  });
});
