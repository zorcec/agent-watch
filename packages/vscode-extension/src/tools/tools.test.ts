import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => import('../__mocks__/vscode'));

import { GetDiagramTool } from './GetDiagramTool';
import { ReadDiagramTool, buildReadableText } from './ReadDiagramTool';
import { AddNodesTool } from './AddNodesTool';
import { RemoveNodesTool } from './RemoveNodesTool';
import { UpdateNodesTool } from './UpdateNodesTool';
import { AddEdgesTool } from './AddEdgesTool';
import { RemoveEdgesTool } from './RemoveEdgesTool';
import { UpdateEdgesTool } from './UpdateEdgesTool';
import { AddGroupsTool } from './AddGroupsTool';
import { RemoveGroupsTool } from './RemoveGroupsTool';
import { UpdateGroupsTool } from './UpdateGroupsTool';
import { registerDiagramTools } from './index';
import type { DiagramService } from '../DiagramService';
import type { DiagramDocument } from '../types/DiagramDocument';
import * as vscode from 'vscode';

interface MockToolResult {
  parts: { value: string }[];
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

const TEST_FILE_PATH = '/workspace/test.diagram';

describe('GetDiagramTool', () => {
  it('prepareInvocation message includes filename', async () => {
    const svc = makeMockDiagramService();
    const tool = new GetDiagramTool(svc);

    const result = await tool.prepareInvocation(
      { input: { filePath: TEST_FILE_PATH } } as any,
      mockToken,
    );

    expect(result?.invocationMessage).toContain('Reading');
    expect(result?.invocationMessage).toContain('test.diagram');
  });

  it('returns error when diagram file cannot be parsed', async () => {
    const svc = makeMockDiagramService({
      parseDocument: vi.fn().mockReturnValue(null),
    });
    const tool = new GetDiagramTool(svc);

    const result = await tool.invoke(
      { input: { filePath: TEST_FILE_PATH } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Cannot parse diagram at');
    expect(resultText(result)).toContain(TEST_FILE_PATH);
  });

  it('returns error when file cannot be opened', async () => {
    vi.mocked(vscode.workspace.openTextDocument).mockRejectedValueOnce(
      new Error('File not found'),
    );
    const svc = makeMockDiagramService();
    const tool = new GetDiagramTool(svc);

    const result = await tool.invoke(
      { input: { filePath: '/nonexistent/missing.diagram' } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Cannot open file');
    expect(resultText(result)).toContain('/nonexistent/missing.diagram');
  });

  it('returns compact diagram representation', async () => {
    const svc = makeMockDiagramService();
    const tool = new GetDiagramTool(svc);

    const result = await tool.invoke(
      { input: { filePath: TEST_FILE_PATH } } as any,
      mockToken,
    );
    const parsed = JSON.parse(resultText(result));

    expect(parsed.title).toBe('Test');
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.edges).toHaveLength(1);
    expect(parsed.groups).toHaveLength(1);
  });

  it('omits default shape and color in compact output', async () => {
    const svc = makeMockDiagramService();
    const tool = new GetDiagramTool(svc);

    const result = await tool.invoke(
      { input: { filePath: TEST_FILE_PATH } } as any,
      mockToken,
    );
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
      (async () => { result = await tool.invoke({ input: { filePath: TEST_FILE_PATH } } as any, mockToken); })()
    ).resolves.not.toThrow();

    const parsed = JSON.parse(resultText(result));
    expect(parsed.title).toBe('');
  });

  it('omits style from compact output when edge style is solid', async () => {
    const docWithSolidEdge = makeDoc();
    docWithSolidEdge.edges[0] = { ...docWithSolidEdge.edges[0], style: 'solid' };
    const svc = makeMockDiagramService({
      parseDocument: vi.fn().mockReturnValue(docWithSolidEdge),
    });
    const tool = new GetDiagramTool(svc);

    const result = await tool.invoke(
      { input: { filePath: TEST_FILE_PATH } } as any,
      mockToken,
    );
    const parsed = JSON.parse(resultText(result));

    expect(parsed.edges[0].style).toBeUndefined();
  });
});

describe('AddNodesTool', () => {
  it('prepareInvocation shows node count, labels, and filename', async () => {
    const svc = makeMockDiagramService();
    const tool = new AddNodesTool(svc);

    const result = await tool.prepareInvocation(
      { input: { filePath: TEST_FILE_PATH, nodes: [{ label: 'Foo' }, { label: 'Bar' }] } } as any,
      mockToken,
    );

    expect(result?.invocationMessage).toContain('2');
    expect(result?.invocationMessage).toContain('Foo');
    expect(result?.invocationMessage).toContain('Bar');
    expect(result?.invocationMessage).toContain('test.diagram');
  });

  it('returns error when file cannot be opened', async () => {
    vi.mocked(vscode.workspace.openTextDocument).mockRejectedValueOnce(new Error('not found'));
    const svc = makeMockDiagramService();
    const tool = new AddNodesTool(svc);

    const result = await tool.invoke(
      { input: { filePath: '/bad/path.diagram', nodes: [{ label: 'A' }] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Cannot open file');
    expect(svc.applySemanticOps).not.toHaveBeenCalled();
  });

  it('invokes applySemanticOps with add_node ops and the opened document', async () => {
    const svc = makeMockDiagramService();
    const tool = new AddNodesTool(svc);

    await tool.invoke(
      {
        input: {
          filePath: TEST_FILE_PATH,
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
    // Second arg must be the opened TextDocument
    expect(vi.mocked(svc.applySemanticOps).mock.calls[0][1]).toBeDefined();
  });

  it('returns success message with added node IDs', async () => {
    const svc = makeMockDiagramService();
    const tool = new AddNodesTool(svc);

    const result = await tool.invoke(
      { input: { filePath: TEST_FILE_PATH, nodes: [{ label: 'A' }] } } as any,
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
      { input: { filePath: TEST_FILE_PATH, nodes: [{ label: 'A' }] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Failed');
    expect(resultText(result)).toContain('Validation failed');
  });
});

describe('RemoveNodesTool', () => {
  it('prepareInvocation shows count and filename', async () => {
    const svc = makeMockDiagramService();
    const tool = new RemoveNodesTool(svc);

    const result = await tool.prepareInvocation(
      { input: { filePath: TEST_FILE_PATH, nodeIds: ['n1', 'n2'] } } as any,
      mockToken,
    );

    expect(result?.invocationMessage).toContain('2');
    expect(result?.invocationMessage).toContain('test.diagram');
  });

  it('returns error when file cannot be opened', async () => {
    vi.mocked(vscode.workspace.openTextDocument).mockRejectedValueOnce(new Error('not found'));
    const svc = makeMockDiagramService();
    const tool = new RemoveNodesTool(svc);

    const result = await tool.invoke(
      { input: { filePath: '/bad/path.diagram', nodeIds: ['n1'] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Cannot open file');
    expect(svc.applySemanticOps).not.toHaveBeenCalled();
  });

  it('invokes remove_node ops with the opened document', async () => {
    const svc = makeMockDiagramService();
    const tool = new RemoveNodesTool(svc);

    await tool.invoke(
      { input: { filePath: TEST_FILE_PATH, nodeIds: ['n1', 'n2'] } } as any,
      mockToken,
    );

    const ops = vi.mocked(svc.applySemanticOps).mock.calls[0][0];
    expect(ops).toEqual([
      { op: 'remove_node', id: 'n1' },
      { op: 'remove_node', id: 'n2' },
    ]);
    expect(vi.mocked(svc.applySemanticOps).mock.calls[0][1]).toBeDefined();
  });

  it('returns failure message on error', async () => {
    const svc = makeMockDiagramService({
      applySemanticOps: vi
        .fn()
        .mockResolvedValue({ success: false, error: 'Not found' }),
    });
    const tool = new RemoveNodesTool(svc);

    const result = await tool.invoke(
      { input: { filePath: TEST_FILE_PATH, nodeIds: ['n99'] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Failed');
  });
});

describe('UpdateNodesTool', () => {
  it('prepareInvocation shows count and filename', async () => {
    const svc = makeMockDiagramService();
    const tool = new UpdateNodesTool(svc);

    const result = await tool.prepareInvocation(
      {
        input: {
          filePath: TEST_FILE_PATH,
          updates: [
            { id: 'n1', label: 'New Label' },
            { id: 'n2', color: 'red' },
          ],
        },
      } as any,
      mockToken,
    );

    expect(result?.invocationMessage).toContain('2');
    expect(result?.invocationMessage).toContain('test.diagram');
  });

  it('returns error when file cannot be opened', async () => {
    vi.mocked(vscode.workspace.openTextDocument).mockRejectedValueOnce(new Error('not found'));
    const svc = makeMockDiagramService();
    const tool = new UpdateNodesTool(svc);

    const result = await tool.invoke(
      { input: { filePath: '/bad/path.diagram', updates: [{ id: 'n1' }] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Cannot open file');
    expect(svc.applySemanticOps).not.toHaveBeenCalled();
  });

  it('maps updates to update_node ops with proper casting and passes the document', async () => {
    const svc = makeMockDiagramService();
    const tool = new UpdateNodesTool(svc);

    await tool.invoke(
      {
        input: {
          filePath: TEST_FILE_PATH,
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
    expect(vi.mocked(svc.applySemanticOps).mock.calls[0][1]).toBeDefined();
  });

  it('returns success message', async () => {
    const svc = makeMockDiagramService();
    const tool = new UpdateNodesTool(svc);

    const result = await tool.invoke(
      { input: { filePath: TEST_FILE_PATH, updates: [{ id: 'n1', label: 'X' }] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Updated 1 node(s)');
  });
});

describe('AddEdgesTool', () => {
  it('prepareInvocation shows edge count and filename', async () => {
    const svc = makeMockDiagramService();
    const tool = new AddEdgesTool(svc);

    const result = await tool.prepareInvocation(
      { input: { filePath: TEST_FILE_PATH, edges: [{ source: 'n1', target: 'n2' }] } } as any,
      mockToken,
    );

    expect(result?.invocationMessage).toContain('1');
    expect(result?.invocationMessage).toContain('test.diagram');
  });

  it('returns error when file cannot be opened', async () => {
    vi.mocked(vscode.workspace.openTextDocument).mockRejectedValueOnce(new Error('not found'));
    const svc = makeMockDiagramService();
    const tool = new AddEdgesTool(svc);

    const result = await tool.invoke(
      { input: { filePath: '/bad/path.diagram', edges: [{ source: 'n1', target: 'n2' }] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Cannot open file');
    expect(svc.applySemanticOps).not.toHaveBeenCalled();
  });

  it('maps edges to add_edge ops with optional fields and passes the document', async () => {
    const svc = makeMockDiagramService();
    const tool = new AddEdgesTool(svc);

    await tool.invoke(
      {
        input: {
          filePath: TEST_FILE_PATH,
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
    expect(vi.mocked(svc.applySemanticOps).mock.calls[0][1]).toBeDefined();
  });

  it('returns failure message on error', async () => {
    const svc = makeMockDiagramService({
      applySemanticOps: vi
        .fn()
        .mockResolvedValue({ success: false, error: 'Bad edge' }),
    });
    const tool = new AddEdgesTool(svc);

    const result = await tool.invoke(
      { input: { filePath: TEST_FILE_PATH, edges: [{ source: 'n1', target: 'n99' }] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Failed');
  });
});

describe('RemoveEdgesTool', () => {
  it('prepareInvocation shows edge count and filename', async () => {
    const svc = makeMockDiagramService();
    const tool = new RemoveEdgesTool(svc);

    const result = await tool.prepareInvocation(
      { input: { filePath: TEST_FILE_PATH, edgeIds: ['e1', 'e2'] } } as any,
      mockToken,
    );

    expect(result?.invocationMessage).toContain('2');
    expect(result?.invocationMessage).toContain('test.diagram');
  });

  it('returns error when file cannot be opened', async () => {
    vi.mocked(vscode.workspace.openTextDocument).mockRejectedValueOnce(new Error('not found'));
    const svc = makeMockDiagramService();
    const tool = new RemoveEdgesTool(svc);

    const result = await tool.invoke(
      { input: { filePath: '/bad/path.diagram', edgeIds: ['e1'] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Cannot open file');
    expect(svc.applySemanticOps).not.toHaveBeenCalled();
  });

  it('invokes remove_edge ops with the opened document', async () => {
    const svc = makeMockDiagramService();
    const tool = new RemoveEdgesTool(svc);

    await tool.invoke(
      { input: { filePath: TEST_FILE_PATH, edgeIds: ['e1', 'e2'] } } as any,
      mockToken,
    );

    const ops = vi.mocked(svc.applySemanticOps).mock.calls[0][0];
    expect(ops).toEqual([
      { op: 'remove_edge', id: 'e1' },
      { op: 'remove_edge', id: 'e2' },
    ]);
    expect(vi.mocked(svc.applySemanticOps).mock.calls[0][1]).toBeDefined();
  });

  it('returns success message', async () => {
    const svc = makeMockDiagramService();
    const tool = new RemoveEdgesTool(svc);

    const result = await tool.invoke(
      { input: { filePath: TEST_FILE_PATH, edgeIds: ['e1'] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Removed 1 edge(s)');
  });

  it('returns failure message on error', async () => {
    const svc = makeMockDiagramService({
      applySemanticOps: vi.fn().mockResolvedValue({ success: false, error: 'Edge not found' }),
    });
    const tool = new RemoveEdgesTool(svc);

    const result = await tool.invoke(
      { input: { filePath: TEST_FILE_PATH, edgeIds: ['bad-edge'] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Failed');
  });
});

describe('UpdateEdgesTool', () => {
  it('prepareInvocation shows update count and filename', async () => {
    const svc = makeMockDiagramService();
    const tool = new UpdateEdgesTool(svc);

    const result = await tool.prepareInvocation(
      { input: { filePath: TEST_FILE_PATH, updates: [{ id: 'e1', label: 'x' }, { id: 'e2', style: 'dashed' }] } } as any,
      mockToken,
    );

    expect(result?.invocationMessage).toContain('2');
    expect(result?.invocationMessage).toContain('test.diagram');
  });

  it('returns error when file cannot be opened', async () => {
    vi.mocked(vscode.workspace.openTextDocument).mockRejectedValueOnce(new Error('not found'));
    const svc = makeMockDiagramService();
    const tool = new UpdateEdgesTool(svc);

    const result = await tool.invoke(
      { input: { filePath: '/bad/path.diagram', updates: [{ id: 'e1' }] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Cannot open file');
    expect(svc.applySemanticOps).not.toHaveBeenCalled();
  });

  it('maps updates to update_edge ops and passes the document', async () => {
    const svc = makeMockDiagramService();
    const tool = new UpdateEdgesTool(svc);

    await tool.invoke(
      {
        input: {
          filePath: TEST_FILE_PATH,
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
    expect(vi.mocked(svc.applySemanticOps).mock.calls[0][1]).toBeDefined();
  });

  it('returns failure on error', async () => {
    const svc = makeMockDiagramService({
      applySemanticOps: vi
        .fn()
        .mockResolvedValue({ success: false, error: 'Oops' }),
    });
    const tool = new UpdateEdgesTool(svc);

    const result = await tool.invoke(
      { input: { filePath: TEST_FILE_PATH, updates: [{ id: 'e1', label: 'x' }] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Failed');
  });
});

describe('ReadDiagramTool', () => {
  it('prepareInvocation message includes filename', async () => {
    const svc = makeMockDiagramService();
    const tool = new ReadDiagramTool(svc);

    const result = await tool.prepareInvocation(
      { input: { filePath: TEST_FILE_PATH } } as any,
      mockToken,
    );

    expect(result?.invocationMessage).toContain('Reading');
    expect(result?.invocationMessage).toContain('test.diagram');
  });

  it('returns error when diagram file cannot be parsed', async () => {
    const svc = makeMockDiagramService({
      parseDocument: vi.fn().mockReturnValue(null),
    });
    const tool = new ReadDiagramTool(svc);

    const result = await tool.invoke(
      { input: { filePath: TEST_FILE_PATH } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Cannot parse diagram at');
    expect(resultText(result)).toContain(TEST_FILE_PATH);
  });

  it('returns error when file cannot be opened', async () => {
    vi.mocked(vscode.workspace.openTextDocument).mockRejectedValueOnce(
      new Error('File not found'),
    );
    const svc = makeMockDiagramService();
    const tool = new ReadDiagramTool(svc);

    const result = await tool.invoke(
      { input: { filePath: '/nonexistent/missing.diagram' } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Cannot open file');
    expect(resultText(result)).toContain('/nonexistent/missing.diagram');
  });

  it('returns readable text when document is open', async () => {
    const svc = makeMockDiagramService();
    const tool = new ReadDiagramTool(svc);

    const result = await tool.invoke(
      { input: { filePath: TEST_FILE_PATH } } as any,
      mockToken,
    );
    const text = resultText(result);

    expect(text).toContain('Node A');
    expect(text).toContain('Node B');
  });
});

describe('buildReadableText', () => {
  it('uses agentContext summary when present', () => {
    const doc = makeDoc();
    doc.agentContext = {
      summary: 'A test architecture summary',
      nodeIndex: [],
      edgeIndex: [],
      groupIndex: [],
      generatedAt: new Date().toISOString(),
    } as any;

    const text = buildReadableText(doc);

    expect(text).toContain('A test architecture summary');
  });

  it('formats agentContext node index correctly', () => {
    const doc = makeDoc();
    doc.agentContext = {
      summary: 'Summary',
      nodeIndex: [{ label: 'AuthService', type: 'service', notes: 'Handles auth' }],
      edgeIndex: [],
      groupIndex: [],
      generatedAt: new Date().toISOString(),
    } as any;

    const text = buildReadableText(doc);

    expect(text).toContain('AuthService');
    expect(text).toContain('[service]');
    expect(text).toContain('Handles auth');
  });

  it('formats agentContext edge index correctly', () => {
    const doc = makeDoc();
    doc.agentContext = {
      summary: 'Summary',
      nodeIndex: [],
      edgeIndex: [{ from: 'A', to: 'B', label: 'calls', protocol: 'HTTP' }],
      groupIndex: [],
      generatedAt: new Date().toISOString(),
    } as any;

    const text = buildReadableText(doc);

    expect(text).toContain('A → B');
    expect(text).toContain('"calls"');
    expect(text).toContain('via HTTP');
  });

  it('formats agentContext group index correctly', () => {
    const doc = makeDoc();
    doc.agentContext = {
      summary: 'Summary',
      nodeIndex: [],
      edgeIndex: [],
      groupIndex: [{ group: 'Backend', members: ['AuthService', 'DB'] }],
      generatedAt: new Date().toISOString(),
    } as any;

    const text = buildReadableText(doc);

    expect(text).toContain('Backend');
    expect(text).toContain('AuthService, DB');
  });

  it('includes insights when present in agentContext', () => {
    const doc = makeDoc();
    doc.agentContext = {
      summary: 'Summary',
      nodeIndex: [],
      edgeIndex: [],
      groupIndex: [],
      insights: ['Circular dependency detected'],
      generatedAt: new Date().toISOString(),
    } as any;

    const text = buildReadableText(doc);

    expect(text).toContain('Insights');
    expect(text).toContain('Circular dependency detected');
  });

  it('includes glossary when present in agentContext', () => {
    const doc = makeDoc();
    doc.agentContext = {
      summary: 'Summary',
      nodeIndex: [],
      edgeIndex: [],
      groupIndex: [],
      glossary: { API: 'Application Programming Interface' },
      generatedAt: new Date().toISOString(),
    } as any;

    const text = buildReadableText(doc);

    expect(text).toContain('Glossary');
    expect(text).toContain('API');
    expect(text).toContain('Application Programming Interface');
  });

  it('falls back to raw doc description when agentContext absent', () => {
    const doc = makeDoc();

    const text = buildReadableText(doc);

    expect(text).toContain('Node A');
    expect(text).toContain('Node B');
    expect(text).toContain('Node A → Node B');
  });

  it('includes meta description in fallback mode', () => {
    const doc = makeDoc();
    (doc.meta as any).description = 'Architecture overview for testing';

    const text = buildReadableText(doc);

    expect(text).toContain('Architecture overview for testing');
  });

  it('includes node notes in fallback mode', () => {
    const doc = makeDoc();
    (doc.nodes[0] as any).notes = 'Primary entry point';

    const text = buildReadableText(doc);

    expect(text).toContain('Primary entry point');
  });

  it('includes edge label in fallback mode', () => {
    const doc = makeDoc();

    const text = buildReadableText(doc);

    expect(text).toContain('"connects"');
  });

  it('returns empty-node message for empty diagram in fallback mode', () => {
    const doc = makeDoc();
    doc.nodes = [];
    doc.edges = [];

    const text = buildReadableText(doc);

    expect(text).toContain('No nodes');
  });

  it('includes node properties (repo, team) when present in agentContext nodeIndex', () => {
    const doc = makeDoc();
    doc.agentContext = {
      summary: 'Summary',
      nodeIndex: [{
        label: 'AuthService',
        properties: { repo: 'github.com/org/svc', team: 'platform' },
      }],
      edgeIndex: [],
      groupIndex: [],
      generatedAt: new Date().toISOString(),
    } as any;

    const text = buildReadableText(doc);

    expect(text).toContain('repo: github.com/org/svc');
    expect(text).toContain('team: platform');
  });
});

describe('AddGroupsTool', () => {
  it('prepareInvocation shows group count, labels, and filename', async () => {
    const svc = makeMockDiagramService();
    const tool = new AddGroupsTool(svc);

    const result = await tool.prepareInvocation(
      { input: { filePath: TEST_FILE_PATH, groups: [{ label: 'Team A' }, { label: 'Team B' }] } } as any,
      mockToken,
    );

    expect(result?.invocationMessage).toContain('2');
    expect(result?.invocationMessage).toContain('test.diagram');
    expect(result?.invocationMessage).toContain('Team A');
  });

  it('returns error when file cannot be opened', async () => {
    vi.mocked(vscode.workspace.openTextDocument).mockRejectedValueOnce(new Error('not found'));
    const svc = makeMockDiagramService();
    const tool = new AddGroupsTool(svc);

    const result = await tool.invoke(
      { input: { filePath: '/bad/path.diagram', groups: [{ label: 'G1' }] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Cannot open file');
    expect(svc.applySemanticOps).not.toHaveBeenCalled();
  });

  it('maps groups to add_group ops and passes the document', async () => {
    const svc = makeMockDiagramService();
    const tool = new AddGroupsTool(svc);

    await tool.invoke(
      { input: { filePath: TEST_FILE_PATH, groups: [{ label: 'Infra', color: 'blue' }] } } as any,
      mockToken,
    );

    const ops = vi.mocked(svc.applySemanticOps).mock.calls[0][0];
    expect(ops[0]).toEqual({ op: 'add_group', group: { label: 'Infra', color: 'blue' } });
    expect(vi.mocked(svc.applySemanticOps).mock.calls[0][1]).toBeDefined();
  });

  it('returns group IDs on success', async () => {
    const svc = makeMockDiagramService();
    const tool = new AddGroupsTool(svc);

    const result = await tool.invoke(
      { input: { filePath: TEST_FILE_PATH, groups: [{ label: 'G1' }] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Added');
  });

  it('returns failure message on error', async () => {
    const svc = makeMockDiagramService({
      applySemanticOps: vi.fn().mockResolvedValue({ success: false, error: 'Oops' }),
    });
    const tool = new AddGroupsTool(svc);

    const result = await tool.invoke(
      { input: { filePath: TEST_FILE_PATH, groups: [{ label: 'G1' }] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Failed');
  });
});

describe('RemoveGroupsTool', () => {
  it('prepareInvocation shows count and filename', async () => {
    const svc = makeMockDiagramService();
    const tool = new RemoveGroupsTool(svc);

    const result = await tool.prepareInvocation(
      { input: { filePath: TEST_FILE_PATH, groupIds: ['g1', 'g2', 'g3'] } } as any,
      mockToken,
    );

    expect(result?.invocationMessage).toContain('3');
    expect(result?.invocationMessage).toContain('test.diagram');
  });

  it('returns error when file cannot be opened', async () => {
    vi.mocked(vscode.workspace.openTextDocument).mockRejectedValueOnce(new Error('not found'));
    const svc = makeMockDiagramService();
    const tool = new RemoveGroupsTool(svc);

    const result = await tool.invoke(
      { input: { filePath: '/bad/path.diagram', groupIds: ['g1'] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Cannot open file');
    expect(svc.applySemanticOps).not.toHaveBeenCalled();
  });

  it('maps groupIds to remove_group ops and passes the document', async () => {
    const svc = makeMockDiagramService();
    const tool = new RemoveGroupsTool(svc);

    await tool.invoke(
      { input: { filePath: TEST_FILE_PATH, groupIds: ['g1', 'g2'] } } as any,
      mockToken,
    );

    const ops = vi.mocked(svc.applySemanticOps).mock.calls[0][0];
    expect(ops).toEqual([
      { op: 'remove_group', id: 'g1' },
      { op: 'remove_group', id: 'g2' },
    ]);
    expect(vi.mocked(svc.applySemanticOps).mock.calls[0][1]).toBeDefined();
  });

  it('returns success message on success', async () => {
    const svc = makeMockDiagramService();
    const tool = new RemoveGroupsTool(svc);

    const result = await tool.invoke(
      { input: { filePath: TEST_FILE_PATH, groupIds: ['g1'] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Removed');
  });

  it('returns failure message on error', async () => {
    const svc = makeMockDiagramService({
      applySemanticOps: vi.fn().mockResolvedValue({ success: false, error: 'Oops' }),
    });
    const tool = new RemoveGroupsTool(svc);

    const result = await tool.invoke(
      { input: { filePath: TEST_FILE_PATH, groupIds: ['g1'] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Failed');
  });
});

describe('UpdateGroupsTool', () => {
  it('prepareInvocation shows update count and filename', async () => {
    const svc = makeMockDiagramService();
    const tool = new UpdateGroupsTool(svc);

    const result = await tool.prepareInvocation(
      { input: { filePath: TEST_FILE_PATH, updates: [{ id: 'g1', label: 'New' }] } } as any,
      mockToken,
    );

    expect(result?.invocationMessage).toContain('1');
    expect(result?.invocationMessage).toContain('test.diagram');
  });

  it('returns error when file cannot be opened', async () => {
    vi.mocked(vscode.workspace.openTextDocument).mockRejectedValueOnce(new Error('not found'));
    const svc = makeMockDiagramService();
    const tool = new UpdateGroupsTool(svc);

    const result = await tool.invoke(
      { input: { filePath: '/bad/path.diagram', updates: [{ id: 'g1', label: 'X' }] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Cannot open file');
    expect(svc.applySemanticOps).not.toHaveBeenCalled();
  });

  it('maps updates to update_group ops and passes the document', async () => {
    const svc = makeMockDiagramService();
    const tool = new UpdateGroupsTool(svc);

    await tool.invoke(
      { input: { filePath: TEST_FILE_PATH, updates: [{ id: 'g1', label: 'Renamed', color: 'red' }] } } as any,
      mockToken,
    );

    const ops = vi.mocked(svc.applySemanticOps).mock.calls[0][0];
    expect(ops[0]).toEqual({ op: 'update_group', id: 'g1', changes: { label: 'Renamed', color: 'red' } });
    expect(vi.mocked(svc.applySemanticOps).mock.calls[0][1]).toBeDefined();
  });

  it('returns success message on success', async () => {
    const svc = makeMockDiagramService();
    const tool = new UpdateGroupsTool(svc);

    const result = await tool.invoke(
      { input: { filePath: TEST_FILE_PATH, updates: [{ id: 'g1', label: 'X' }] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Updated');
  });

  it('returns failure message on error', async () => {
    const svc = makeMockDiagramService({
      applySemanticOps: vi.fn().mockResolvedValue({ success: false, error: 'Oops' }),
    });
    const tool = new UpdateGroupsTool(svc);

    const result = await tool.invoke(
      { input: { filePath: TEST_FILE_PATH, updates: [{ id: 'g1' }] } } as any,
      mockToken,
    );

    expect(resultText(result)).toContain('Failed');
  });
});

describe('registerDiagramTools', () => {
  it('registers all 11 tools', () => {
    const svc = makeMockDiagramService();
    const context = {
      subscriptions: [] as any[],
      push: vi.fn(),
    } as unknown as vscode.ExtensionContext;

    registerDiagramTools(context, svc as any);

    expect(vscode.lm.registerTool).toHaveBeenCalledTimes(11);
    const toolNames = vi
      .mocked(vscode.lm.registerTool)
      .mock.calls.map((c) => c[0]);
    expect(toolNames).toContain('diagramflow_readDiagram');
    expect(toolNames).toContain('diagramflow_getDiagram');
    expect(toolNames).toContain('diagramflow_addNodes');
    expect(toolNames).toContain('diagramflow_removeNodes');
    expect(toolNames).toContain('diagramflow_updateNodes');
    expect(toolNames).toContain('diagramflow_addEdges');
    expect(toolNames).toContain('diagramflow_removeEdges');
    expect(toolNames).toContain('diagramflow_updateEdges');
    expect(toolNames).toContain('diagramflow_addGroups');
    expect(toolNames).toContain('diagramflow_removeGroups');
    expect(toolNames).toContain('diagramflow_updateGroups');
  });
});
