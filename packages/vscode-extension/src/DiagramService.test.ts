import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => import('./__mocks__/vscode'));
vi.mock('nanoid', () => ({ nanoid: () => 'mock_id1' }));
vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
}));

import { DiagramService } from './DiagramService';
import type { DiagramDocument } from './types/DiagramDocument';
import * as vscode from 'vscode';
import * as nodeFs from 'fs';

function makeMockTextDocument(content: string): vscode.TextDocument {
  return {
    getText: () => content,
    uri: vscode.Uri.file('/test/file.diagram'),
    lineCount: content.split('\n').length,
    save: vi.fn().mockResolvedValue(true),
  } as unknown as vscode.TextDocument;
}

function makeValidDoc(): DiagramDocument {
  return {
    meta: {
      version: '1.0',
      title: 'Test',
      created: '2025-01-01T00:00:00Z',
      modified: '2025-01-01T00:00:00Z',
    },
    nodes: [],
    edges: [],
    groups: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

describe('DiagramService', () => {
  let service: DiagramService;

  beforeEach(() => {
    service = new DiagramService();
    vi.clearAllMocks();
  });

  describe('setActiveDocument / getActiveDocument', () => {
    it('returns null initially', () => {
      expect(service.getActiveDocument()).toBeNull();
    });

    it('stores and retrieves document', () => {
      const doc = makeMockTextDocument('{}');
      service.setActiveDocument(doc);
      expect(service.getActiveDocument()).toBe(doc);
    });

    it('clears document with null', () => {
      const doc = makeMockTextDocument('{}');
      service.setActiveDocument(doc);
      service.setActiveDocument(null);
      expect(service.getActiveDocument()).toBeNull();
    });
  });

  describe('parseDocument', () => {
    it('returns null when no active document', () => {
      expect(service.parseDocument()).toBeNull();
    });

    it('parses valid JSON from active document', () => {
      const validDoc = makeValidDoc();
      const textDoc = makeMockTextDocument(JSON.stringify(validDoc));
      service.setActiveDocument(textDoc);

      const result = service.parseDocument();
      expect(result).toEqual(validDoc);
    });

    it('parses from explicit document parameter', () => {
      const validDoc = makeValidDoc();
      const textDoc = makeMockTextDocument(JSON.stringify(validDoc));

      const result = service.parseDocument(textDoc);
      expect(result).toEqual(validDoc);
    });

    it('returns null for invalid JSON', () => {
      const textDoc = makeMockTextDocument('not json');
      service.setActiveDocument(textDoc);

      expect(service.parseDocument()).toBeNull();
    });
  });

  describe('applySemanticOps', () => {
    it('returns error when no active document', async () => {
      const result = await service.applySemanticOps([]);
      expect(result.success).toBe(false);
      expect(result.error).toContain('No active diagram document');
    });

    it('returns error when document is invalid JSON', async () => {
      const textDoc = makeMockTextDocument('not json');
      service.setActiveDocument(textDoc);

      const result = await service.applySemanticOps([]);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to parse');
    });

    it('applies add_node operation and writes to file', async () => {
      const validDoc = makeValidDoc();
      const textDoc = makeMockTextDocument(JSON.stringify(validDoc));
      service.setActiveDocument(textDoc);

      const result = await service.applySemanticOps([
        { op: 'add_node', node: { label: 'New Node' } },
      ]);

      expect(result.success).toBe(true);
      expect(nodeFs.writeFileSync).toHaveBeenCalledTimes(1);
    });

    it('uses explicit document parameter over active', async () => {
      const validDoc = makeValidDoc();
      const textDoc = makeMockTextDocument(JSON.stringify(validDoc));

      const result = await service.applySemanticOps(
        [{ op: 'add_node', node: { label: 'New' } }],
        textDoc,
      );

      expect(result.success).toBe(true);
    });

    it('returns error when write fails', async () => {
      vi.mocked(nodeFs.writeFileSync).mockImplementationOnce(() => { throw new Error('Write failed'); });
      vi.mocked(vscode.workspace.applyEdit).mockResolvedValueOnce(false);

      const validDoc = makeValidDoc();
      const textDoc = makeMockTextDocument(JSON.stringify(validDoc));
      service.setActiveDocument(textDoc);

      const result = await service.applySemanticOps([
        { op: 'add_node', node: { label: 'Node' } },
      ]);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to apply workspace edit');
    });
  });

  describe('autoLayoutAll', () => {
    it('does nothing when no active document', async () => {
      await service.autoLayoutAll();
      expect(nodeFs.writeFileSync).not.toHaveBeenCalled();
    });

    it('does nothing for invalid document', async () => {
      const textDoc = makeMockTextDocument('bad json');
      service.setActiveDocument(textDoc);

      await service.autoLayoutAll();
      expect(nodeFs.writeFileSync).not.toHaveBeenCalled();
    });

    it('resets pinned state and applies layout', async () => {
      const doc = makeValidDoc();
      doc.nodes = [
        {
          id: 'n1',
          label: 'A',
          shape: 'rectangle',
          color: 'default',
          x: 100,
          y: 100,
          width: 160,
          height: 48,
          pinned: true,
        },
        {
          id: 'n2',
          label: 'B',
          shape: 'rectangle',
          color: 'default',
          x: 200,
          y: 200,
          width: 160,
          height: 48,
          pinned: true,
        },
      ];
      doc.edges = [
        {
          id: 'e1',
          source: 'n1',
          target: 'n2',
          style: 'solid',
          arrow: 'normal',
          animated: false,
        },
      ];

      const textDoc = makeMockTextDocument(JSON.stringify(doc));
      service.setActiveDocument(textDoc);

      await service.autoLayoutAll();

      expect(nodeFs.writeFileSync).toHaveBeenCalledTimes(1);
    });

    it('uses explicit document parameter', async () => {
      const doc = makeValidDoc();
      const textDoc = makeMockTextDocument(JSON.stringify(doc));

      await service.autoLayoutAll(textDoc);

      expect(nodeFs.writeFileSync).toHaveBeenCalledTimes(1);
    });

    it('writes agentContext into the document after layout', async () => {
      const doc = makeValidDoc();
      doc.nodes = [
        {
          id: 'n1', label: 'Frontend', x: 0, y: 0, width: 160, height: 48,
          shape: 'rectangle', color: 'default', pinned: false,
        },
        {
          id: 'n2', label: 'Backend', x: 0, y: 0, width: 160, height: 48,
          shape: 'rectangle', color: 'default', pinned: false,
        },
      ];
      doc.edges = [
        { id: 'e1', source: 'n1', target: 'n2', style: 'solid', arrow: 'arrow' },
      ];

      const textDoc = makeMockTextDocument(JSON.stringify(doc));
      let written: any;
      vi.mocked(nodeFs.writeFileSync).mockImplementation((_path, data) => { if (typeof data === 'string') written = JSON.parse(data); });

      await service.autoLayoutAll(textDoc);

      expect(nodeFs.writeFileSync).toHaveBeenCalledTimes(1);
      if (written) {
        expect(written.agentContext).toBeDefined();
        expect(written.agentContext.format).toBe('diagramflow-v1');
        expect(written.agentContext.nodeIndex).toHaveLength(2);
      }
    });
  });

  describe('emptyDocument', () => {
    it('returns a valid empty document', () => {
      const doc = service.emptyDocument();

      expect(doc.meta.title).toBe('Untitled Diagram');
      expect(doc.meta.created).toBeDefined();
      expect(doc.meta.modified).toBeDefined();
      expect(doc.nodes).toEqual([]);
      expect(doc.edges).toEqual([]);
      expect(doc.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    });
  });

  describe('moveNode – clears group x/y for grouped child', () => {
    it('clears stored group.x and group.y when a grouped node is moved', async () => {
      const doc = makeValidDoc();
      doc.nodes = [
        { id: 'n1', label: 'A', x: 200, y: 200, width: 160, height: 48, shape: 'rectangle', color: 'default', pinned: false, group: 'g1' },
      ];
      doc.groups = [{ id: 'g1', label: 'Group', x: 100, y: 100 }];

      let written: any;
      vi.mocked(nodeFs.writeFileSync).mockImplementation((_path, data) => { if (typeof data === 'string') written = JSON.parse(data); });

      const textDoc = makeMockTextDocument(JSON.stringify(doc));
      await service.moveNode('n1', { x: 350, y: 350 }, textDoc);

      expect(nodeFs.writeFileSync).toHaveBeenCalledTimes(1);
      if (written) {
        expect(written.groups[0].x).toBeUndefined();
        expect(written.groups[0].y).toBeUndefined();
      }
    });

    it('does not touch groups when moving an ungrouped node', async () => {
      const doc = makeValidDoc();
      doc.nodes = [
        { id: 'n1', label: 'A', x: 100, y: 100, width: 160, height: 48, shape: 'rectangle', color: 'default', pinned: false },
      ];
      doc.groups = [{ id: 'g1', label: 'Group', x: 50, y: 50 }];

      let written: any;
      vi.mocked(nodeFs.writeFileSync).mockImplementation((_path, data) => { if (typeof data === 'string') written = JSON.parse(data); });

      const textDoc = makeMockTextDocument(JSON.stringify(doc));
      await service.moveNode('n1', { x: 200, y: 200 }, textDoc);

      expect(nodeFs.writeFileSync).toHaveBeenCalledTimes(1);
      // Group position should remain untouched
      if (written) {
        expect(written.groups[0].x).toBe(50);
        expect(written.groups[0].y).toBe(50);
      }
    });
  });

  describe('moveNodes – clears group x/y for affected groups', () => {
    it('clears stored group.x and group.y for each group of a moved node', async () => {
      const doc = makeValidDoc();
      doc.nodes = [
        { id: 'n1', label: 'A', x: 200, y: 200, width: 160, height: 48, shape: 'rectangle', color: 'default', pinned: false, group: 'g1' },
        { id: 'n2', label: 'B', x: 300, y: 300, width: 160, height: 48, shape: 'rectangle', color: 'default', pinned: false },
      ];
      doc.groups = [{ id: 'g1', label: 'Group', x: 100, y: 100 }];

      let written: any;
      vi.mocked(nodeFs.writeFileSync).mockImplementation((_path, data) => { if (typeof data === 'string') written = JSON.parse(data); });

      const textDoc = makeMockTextDocument(JSON.stringify(doc));
      await service.moveNodes([
        { id: 'n1', position: { x: 400, y: 400 } },
        { id: 'n2', position: { x: 500, y: 500 } },
      ], textDoc);

      expect(nodeFs.writeFileSync).toHaveBeenCalledTimes(1);
      if (written) {
        // g1's x/y should be cleared because n1 (in g1) was moved
        expect(written.groups[0].x).toBeUndefined();
        expect(written.groups[0].y).toBeUndefined();
      }
    });
  });
});

describe('sortNodes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sorts nodes and writes to file', async () => {
    const service = new DiagramService();
    const doc = makeValidDoc();
    doc.nodes = [
      { id: 'n1', label: 'A', x: 300, y: 100, width: 160, height: 48, shape: 'rectangle', color: 'default', pinned: false },
      { id: 'n2', label: 'B', x: 100, y: 100, width: 160, height: 48, shape: 'rectangle', color: 'default', pinned: false },
    ];
    const textDoc = makeMockTextDocument(JSON.stringify(doc));
    service.setActiveDocument(textDoc);

    let written: any;
    vi.mocked(nodeFs.writeFileSync).mockImplementation((_path, data) => { if (typeof data === 'string') written = JSON.parse(data); });

    await service.sortNodes(undefined, textDoc);

    expect(nodeFs.writeFileSync).toHaveBeenCalledTimes(1);
    if (written) {
      // TB sort: both nodes at y=100, sorted by x: n2 (x=100) before n1 (x=300)
      expect(written.nodes[0].id).toBe('n2');
      expect(written.nodes[1].id).toBe('n1');
      expect(written.meta.layoutDirection).toBe('TB');
    }
  });

  it('does nothing when no active document', async () => {
    const service2 = new DiagramService();
    await service2.sortNodes();
    expect(nodeFs.writeFileSync).not.toHaveBeenCalled();
  });
});

describe('applySemanticOps — sort_nodes skips partial layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('nodes placed at origin by sort are NOT re-positioned by partial layout engine', async () => {
    const service = new DiagramService();
    const doc = makeValidDoc();
    // Two unpinned nodes at origin — normally partial layout would reposition them via Dagre.
    // After sort, the first grid slot is at (0,0). Without the fix, applyPartialLayout
    // would see that node and override it with a Dagre position.
    doc.nodes = [
      { id: 'n1', label: 'Alpha', x: 0, y: 0, width: 160, height: 48, shape: 'rectangle', color: 'default', pinned: false },
      { id: 'n2', label: 'Beta', x: 10, y: 0, width: 160, height: 48, shape: 'rectangle', color: 'default', pinned: false },
    ];
    const textDoc = makeMockTextDocument(JSON.stringify(doc));

    let written: any;
    vi.mocked(nodeFs.writeFileSync).mockImplementation((_path, data) => { if (typeof data === 'string') written = JSON.parse(data); });

    const result = await service.applySemanticOps(
      [{ op: 'sort_nodes', direction: 'LR' }],
      textDoc,
    );

    expect(result.success).toBe(true);
    if (written) {
      // Sort LR: n1 (x=0) first, n2 (x=10) second.
      // Grid places n1 at (0,0) and n2 at (0, stepH) since LR uses column-major.
      // applyPartialLayout must NOT have re-positioned n1 (it sits at 0,0 after sort).
      const n1 = written.nodes.find((n: { id: string }) => n.id === 'n1');
      const n2 = written.nodes.find((n: { id: string }) => n.id === 'n2');
      // n1 remains at the sort-assigned position (0,0)
      expect(n1.x).toBe(0);
      expect(n1.y).toBe(0);
      // n2 is placed below n1 in LR layout
      expect(n2.x).toBe(0);
      expect(n2.y).toBeGreaterThan(0);
      // meta.layoutDirection must be persisted
      expect(written.meta.layoutDirection).toBe('LR');
    }
  });
});

