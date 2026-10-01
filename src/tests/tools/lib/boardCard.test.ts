import { describe, it, expect } from 'vitest';
import { cardFromNode } from '../../../../tools/lib/board-card.mjs';

const select = (field: string, name: string) => ({ name, field: { name: field } });

const issueNode = {
  __typename: 'Issue',
  number: 53,
  title: 'Panning the camera re-renders every world-effect overlay on every frame',
  labels: { nodes: [{ name: 'high' }, { name: 'needs playtest' }] },
  projectItems: {
    nodes: [
      { id: 'PVTI_other', project: { number: 9 }, fieldValues: { nodes: [select('Status', 'Done')] } },
      {
        id: 'PVTI_lAHOBlZOB84Bip03zg6bqk4',
        project: { number: 4 },
        fieldValues: {
          nodes: [
            select('Status', 'Manual'),
            select('Work type', 'perf'),
            select('Verify', 'playtest'),
            {},
            { text: 'a title field' }
          ]
        }
      }
    ]
  }
};

describe('cardFromNode', () => {
  it('shapes one issue card the way gh project item-list does', () => {
    expect(cardFromNode(issueNode, '4')).toEqual({
      id: 'PVTI_lAHOBlZOB84Bip03zg6bqk4',
      content: {
        type: 'Issue',
        number: 53,
        title: 'Panning the camera re-renders every world-effect overlay on every frame'
      },
      title: 'Panning the camera re-renders every world-effect overlay on every frame',
      labels: ['high', 'needs playtest'],
      status: 'Manual',
      'work type': 'perf',
      verify: 'playtest'
    });
  });

  it('returns null for an issue that is not on the board', () => {
    expect(cardFromNode({ ...issueNode, projectItems: { nodes: [] } }, '4')).toBeNull();
    expect(cardFromNode(null, '4')).toBeNull();
  });
});
