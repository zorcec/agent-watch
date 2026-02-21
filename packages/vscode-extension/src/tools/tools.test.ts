import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => import('../__mocks__/vscode'));

import { GetDiagramTool } from './GetDiagramTool';
import { AddNodesTool } from './AddNodesTool';
import { RemoveNodesTool } from './RemoveNodesTool';
import { UpdateNodesTool } from './UpdateNodesTool';
import { AddEdgesTool } from './AddEdgesTool';
import { RemoveEdgesTool } from './RemoveEdgesTool';
import { UpdateEdgesTool } from './UpdateEdgesTool';
import { registerDiagramTools } from './index';
import type { DiagramService } from '../DiagramService';
import type { DiagramDocument } from '../types/DiagramDocument';
import * as vscode from 'vscode';

interface MockToolResult {
  parts: Array<{ value: string }>;
}

function resultText(result: unknown): string {
  return (result as MockToolResult).parts[0].value;
}

function makeDoc(): DiagramDocument {
  return {
    meta: {
      version: '1.0',
      title: 'Test',
      created: '2025-01-01T00:00:00Z',
      modified: '2025-01-01T00:00:00Z',
    },
    nodes: [
      {
        id: 'n1',
        label: 'Node A',
        shape: 'rectangle',
        color: 'default',
        x: 0,
        y: 0,
        width: 160,
        height: 48,
        pinned: false,
      },
      {
        id: 'n2',
        label: 'Node B',
        shape: 'diamond',
        color: 'blue',
        x: 100,
        y: 100,
        width: 160,
        height: 48,
        pinned: true,
      },
    ],
    edges: [
      {
        id: 'e1',
        source: 'n1',
        target: 'n2',
        label: 'connects',
        style: 'dashed',
        arrow: 'normal',
        animated: false,
      },
    ],
    groups: [{ id: 'g1', label: 'Group 1' }],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function makeMockDiagramService(
  overrides: Partial<DiagramService> = {},
): DiagramService {
  return {
    parseDocument: vi.fn().mockReturnValue(makeDoc()),
    applySemanticOps: vi.fn().mockResolvedValue({ success: true }),
    setActiveDocument: vi.fn(),
    getActiveDocument: vi.fn().mockReturnValue(null),
    autoLayoutAll: vi.fn().mockResolvedValue(undefined),
    emptyDocument: vi.fn(),
    ...overrides,
  } as unknown as DiagramService;
}

const mockToken = {
  isCancellationRequested: false,
  onCancellationRequested: vi.fn(),
} as unknown as vscode.CancellationToken;

describe('GetDiagramTool', () => {
  it('prepareInvocation returns a message', async () => {
    const svc = makeMockDiagramService();
    const tool = new GetDiagramTool(svc);

    const result = await tool.prepareInvocation(
      { input: {} } as any,
      mockToken,
    );

    expect(result?.invocationMessage).toContain('Reading');
  });

  it('returns error when no document is open', async () => {
    const svc = makeMockDiagramService({
      parseDocument: vi.fn().mockReturnValue(null),
    });
    const tool = new GetDiagramTool(svc);

    const result = await tool.invoke({ input: {} } as any, mockToken);

    expect(resultText(result)).toContain('No .diagram file');
  });

  it('returns compact diagram representation', async () => {
    const svc = makeMockDiagramService();
    const tool = new GetDiagramTool(svc);

    const result = await tool.invoke({ input: {} } as any, mockToken);
    const parsed = JSON.parse(resultText(result));

    expect(parsed.title).toBe('Test');
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.edges).toHaveLength(1);
    expect(parsed.groups).toHaveLength(1);
  });

  it('omits default shape and color in compact output', async () => {
    const svc = makeMockDiagramService();
    const tool = new GetDiagramTool(svc);

    const result = await tool.invoke({ input: {} } as any, mockToken);
    const parsed = JSON.parse(resultText(result));

    expect(parsed.nodes[0].shape).toBeUndefined();
    expect(parsed.nodes[0].color).toBeUndefined();
    expect(parsed.nodes[1].shape).toBe('diamond');
    expect(parsed.nodes[1].color).toBe('blue');
  });

  it('does not throw when doc.meta is undefined (corrupted file)', async () => {
    const docWithoutMeta = { ...makeDoc(), meta: undefined as any };
    const svc = makeMockDiagramService({
      parseDocument: vi.fn().mockReturnValue(docWithoutMeta),
    });
    const tool = new GetDiagramTool(svc);

    // Must not throw – returns an empty title instead of crashing
    let result: unknown;
    await expect(
      (async () => { result = await tool.invoke({ input: {} } as any, mockToken); })()
    ).resolves.not.toThrow();

    const parsed = JSON.parse(resultText(result));
    expect(parsed.title).toBe('');
  });
});

describe('AddNodesTool', () => {
  it('prepareInvocation shows node count and labels', async () => {
    const svc = makeMockDiagramService();
    const tool = new AddNodesTool(svc);

    const result = await tool.prepareInvocation(
      { input: { nodes: [{ label: 'Foo' }, { label: 'Bar' }] } } as any,
      mockToken,
    );

    expect(result?.invocationMessage).toContain('2');
    expect(result?.invocationMessage).toContain('Foo');
    expect(result?.invocationMessage).toContain('Bar');
  });

  it('invokes applySemanticOps with add_node ops', async () => {
    const svc = makeMockDiagramService();
    const tool = new AddNodesTool(svc);

    await tool.invoke(
      {
        input: {
          nodes: [
            { label: 'A', shape: 'diamond', color: 'blue' },
            { label: 'B', notes: 'some note', group: 'g1' },
          ],
        },
      } as any,
      mockToken,
    );

    expect(svc.applySemanticOps).toHaveBeenCalledTimes(1);
    const ops = vi.mocked(svc.applySemanticOps).mock.calls[0][0];
    expect(ops).toHaveLength(2);
    expect(ops[0]).toEqual({
      op: 'add_node',
      node: { label: 'A', shape: 'diamond', color: 'blue' },
    });
    expect(ops[1]).toEqual({
      op: 'add_node',
      node: { label: 'B', notes: 'some note', group: 'g1' },
    });
  });

  it('returns success message with added node IDs', async () => {
    const svc = makeMockDiagramService();
    const tool = new AddNodesTool(svc);

    const result = await tool.invoke(
      { input: { nodes: [{ label: 'A' }] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Added 1 node(s)');
  });

  it('returns error message on failure', async () => {
    const svc = makeMockDiagramService({
      applySemanticOps: vi.fn().mockResolvedValue({
        success: false,
        error: 'Validation failed',
      }),
    });
    const tool = new AddNodesTool(svc);

    const result = await tool.invoke(
      { input: { nodes: [{ label: 'A' }] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Failed');
    expect(resultText(result)).toContain('Validation failed');
  });
});

describe('RemoveNodesTool', () => {
  it('prepareInvocation shows count', async () => {
    const svc = makeMockDiagramService();
    const tool = new RemoveNodesTool(svc);

    const result = await tool.prepareInvocation(
      { input: { nodeIds: ['n1', 'n2'] } } as any,
      mockToken,
    );

    expect(result?.invocationMessage).toContain('2');
  });

  it('invokes remove_node ops', async () => {
    const svc = makeMockDiagramService();
    const tool = new RemoveNodesTool(svc);

    await tool.invoke(
      { input: { nodeIds: ['n1', 'n2'] } } as any,
      mockToken,
    );

    const ops = vi.mocked(svc.applySemanticOps).mock.calls[0][0];
    expect(ops).toEqual([
      { op: 'remove_node', id: 'n1' },
      { op: 'remove_node', id: 'n2' },
    ]);
  });

  it('returns failure message on error', async () => {
    const svc = makeMockDiagramService({
      applySemanticOps: vi
        .fn()
        .mockResolvedValue({ success: false, error: 'Not found' }),
    });
    const tool = new RemoveNodesTool(svc);

    const result = await tool.invoke(
      { input: { nodeIds: ['n99'] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Failed');
  });
});

describe('UpdateNodesTool', () => {
  it('prepareInvocation shows count', async () => {
    const svc = makeMockDiagramService();
    const tool = new UpdateNodesTool(svc);

    const result = await tool.prepareInvocation(
      {
        input: {
          updates: [
            { id: 'n1', label: 'New Label' },
            { id: 'n2', color: 'red' },
          ],
        },
      } as any,
      mockToken,
    );

    expect(result?.invocationMessage).toContain('2');
  });

  it('maps updates to update_node ops with proper casting', async () => {
    const svc = makeMockDiagramService();
    const tool = new UpdateNodesTool(svc);

    await tool.invoke(
      {
        input: {
          updates: [
            {
              id: 'n1',
              label: 'Updated',
              shape: 'diamond',
              color: 'red',
              notes: 'note',
              group: 'g1',
            },
          ],
        },
      } as any,
      mockToken,
    );

    const ops = vi.mocked(svc.applySemanticOps).mock.calls[0][0];
    expect(ops[0]).toEqual({
      op: 'update_node',
      id: 'n1',
      changes: {
        label: 'Updated',
        shape: 'diamond',
        color: 'red',
        notes: 'note',
        group: 'g1',
      },
    });
  });

  it('returns success message', async () => {
    const svc = makeMockDiagramService();
    const tool = new UpdateNodesTool(svc);

    const result = await tool.invoke(
      { input: { updates: [{ id: 'n1', label: 'X' }] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Updated 1 node(s)');
  });
});

describe('AddEdgesTool', () => {
  it('prepareInvocation shows edge count', async () => {
    const svc = makeMockDiagramService();
    const tool = new AddEdgesTool(svc);

    const result = await tool.prepareInvocation(
      { input: { edges: [{ source: 'n1', target: 'n2' }] } } as any,
      mockToken,
    );

    expect(result?.invocationMessage).toContain('1');
  });

  it('maps edges to add_edge ops with optional fields', async () => {
    const svc = makeMockDiagramService();
    const tool = new AddEdgesTool(svc);

    await tool.invoke(
      {
        input: {
          edges: [
            {
              source: 'n1',
              target: 'n2',
              label: 'test',
              style: 'dashed',
              arrow: 'open',
              animated: true,
            },
          ],
        },
      } as any,
      mockToken,
    );

    const ops = vi.mocked(svc.applySemanticOps).mock.calls[0][0];
    expect(ops[0]).toEqual({
      op: 'add_edge',
      edge: {
        source: 'n1',
        target: 'n2',
        label: 'test',
        style: 'dashed',
        arrow: 'open',
        animated: true,
      },
    });
  });

  it('returns failure message on error', async () => {
    const svc = makeMockDiagramService({
      applySemanticOps: vi
        .fn()
        .mockResolvedValue({ success: false, error: 'Bad edge' }),
    });
    const tool = new AddEdgesTool(svc);

    const result = await tool.invoke(
      { input: { edges: [{ source: 'n1', target: 'n99' }] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Failed');
  });
});

describe('RemoveEdgesTool', () => {
  it('prepareInvocation shows edge count', async () => {
    const svc = makeMockDiagramService();
    const tool = new RemoveEdgesTool(svc);

    const result = await tool.prepareInvocation(
      { input: { edgeIds: ['e1', 'e2'] } } as any,
      mockToken,
    );

    expect(result?.invocationMessage).toContain('2');
  });

  it('invokes remove_edge ops', async () => {
    const svc = makeMockDiagramService();
    const tool = new RemoveEdgesTool(svc);

    await tool.invoke(
      { input: { edgeIds: ['e1', 'e2'] } } as any,
      mockToken,
    );

    const ops = vi.mocked(svc.applySemanticOps).mock.calls[0][0];
    expect(ops).toEqual([
      { op: 'remove_edge', id: 'e1' },
      { op: 'remove_edge', id: 'e2' },
    ]);
  });

  it('returns success message', async () => {
    const svc = makeMockDiagramService();
    const tool = new RemoveEdgesTool(svc);

    const result = await tool.invoke(
      { input: { edgeIds: ['e1'] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Removed 1 edge(s)');
  });
});

describe('UpdateEdgesTool', () => {
  it('prepareInvocation shows update count', async () => {
    const svc = makeMockDiagramService();
    const tool = new UpdateEdgesTool(svc);

    const result = await tool.prepareInvocation(
      { input: { updates: [{ id: 'e1', label: 'x' }, { id: 'e2', style: 'dashed' }] } } as any,
      mockToken,
    );

    expect(result?.invocationMessage).toContain('2');
  });

  it('maps updates to update_edge ops', async () => {
    const svc = makeMockDiagramService();
    const tool = new UpdateEdgesTool(svc);

    await tool.invoke(
      {
        input: {
          updates: [
            {
              id: 'e1',
              label: 'updated',
              style: 'dotted',
              arrow: 'none',
              animated: true,
              source: 'n2',
              target: 'n1',
            },
          ],
        },
      } as any,
      mockToken,
    );

    const ops = vi.mocked(svc.applySemanticOps).mock.calls[0][0];
    expect(ops[0]).toEqual({
      op: 'update_edge',
      id: 'e1',
      changes: {
        label: 'updated',
        style: 'dotted',
        arrow: 'none',
        animated: true,
        source: 'n2',
        target: 'n1',
      },
    });
  });

  it('returns failure on error', async () => {
    const svc = makeMockDiagramService({
      applySemanticOps: vi
        .fn()
        .mockResolvedValue({ success: false, error: 'Oops' }),
    });
    const tool = new UpdateEdgesTool(svc);

    const result = await tool.invoke(
      { input: { updates: [{ id: 'e1', label: 'x' }] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Failed');
  });
});

describe('registerDiagramTools', () => {
  it('registers all 7 tools', () => {
    const svc = makeMockDiagramService();
    const context = {
      subscriptions: [] as any[],
      push: vi.fn(),
    } as unknown as vscode.ExtensionContext;

    registerDiagramTools(context, svc as any);

    expect(vscode.lm.registerTool).toHaveBeenCalledTimes(7);
    const toolNames = vi
      .mocked(vscode.lm.registerTool)
      .mock.calls.map((c) => c[0]);
    expect(toolNames).toContain('diagramflow_getDiagram');
    expect(toolNames).toContain('diagramflow_addNodes');
    expect(toolNames).toContain('diagramflow_removeNodes');
    expect(toolNames).toContain('diagramflow_updateNodes');
    expect(toolNames).toContain('diagramflow_addEdges');
    expect(toolNames).toContain('diagramflow_removeEdges');
    expect(toolNames).toContain('diagramflow_updateEdges');
  });
});
