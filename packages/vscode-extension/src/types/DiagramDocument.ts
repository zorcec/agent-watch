export type NodeShape = 'rectangle' | 'rounded' | 'diamond' | 'cylinder' | 'note';

export type LayoutDirection = 'TB' | 'LR' | 'BT' | 'RL';

export type EdgeStyle = 'solid' | 'dashed' | 'dotted';

export type ArrowType = 'normal' | 'arrow' | 'open' | 'none';

export type NodeColor =
  | 'default'
  | 'blue'
  | 'green'
  | 'red'
  | 'yellow'
  | 'purple'
  | 'gray';

/**
 * C4-inspired node type classification.
 * Helps AI agents reason about the role and constraints of a component.
 *  - Person: A human user or role (external or internal)
 *  - ExternalSystem: A third-party system outside your control
 *  - Container: A deployable unit (app, service, database, etc.)
 *  - Service: An internal microservice or API
 *  - Database: A data store (relational, document, etc.)
 *  - MessageQueue: An async broker (Kafka, RabbitMQ, SQS, etc.)
 *  - Cache: An in-memory or distributed cache
 *  - Function: A serverless function or lambda
 */
export type NodeType =
  | 'Person'
  | 'ExternalSystem'
  | 'Container'
  | 'Service'
  | 'Database'
  | 'MessageQueue'
  | 'Cache'
  | 'Function';

/**
 * PII / trust-boundary classification for security-aware agents.
 */
export type SecurityClassification = 'public' | 'internal' | 'pii-data-store' | 'security-boundary';

/**
 * Deployment environment scope of the node.
 */
export type DeploymentEnvironment = 'production' | 'staging' | 'development' | 'all';

/**
 * Structured properties bag for source-code and documentation linkage.
 * All fields are optional — include what is meaningful.
 */
export interface NodeProperties {
  /** Git repository URL (e.g. "github.com/org/order-service") */
  repo?: string;
  /** Owning team name (e.g. "Fulfilment Squad") */
  team?: string;
  /** Path to the primary entrypoint file relative to the repo root */
  entrypoint?: string;
  /** URL to the OpenAPI / AsyncAPI spec for this component */
  openapi?: string;
  /** Path to the Architecture Decision Record that governs this component */
  adr?: string;
  /** Short list of non-functional quality goals (e.g. ["high-availability", "eventual-consistency"]) */
  qualityGoals?: string[];
  /**
   * Known technical debt or caveats the agent should be aware of.
   * Include a tracking reference (JIRA, GitHub issue) when possible.
   */
  technicalDebt?: string;
  /**
   * Migration / deprecation state.
   * Use "deprecated" or "being-replaced-by:<successor-label>" so agents avoid investing in this node.
   */
  status?: string;
  /** Any other key/value metadata relevant to agents or tooling */
  [key: string]: unknown;
}

export interface DiagramNode {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: NodeShape;
  color: NodeColor;
  pinned: boolean;
  notes?: string;
  group?: string;
  /** C4-inspired component type — tells agents the role of this node */
  type?: NodeType;
  /** Classification tags for agent reasoning (e.g. ["deprecated", "external-facing"]) */
  tags?: string[];
  /** Source-code linkage, ownership, and architectural metadata */
  properties?: NodeProperties;
  /** Trust / data sensitivity boundary for security-aware agents */
  securityClassification?: SecurityClassification;
  /** Which environment(s) this node exists in */
  deploymentEnvironment?: DeploymentEnvironment;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  style: EdgeStyle;
  arrow: ArrowType;
  animated?: boolean;
  /** Communication protocol (e.g. "REST", "gRPC", "Kafka (async)", "WebSocket") */
  protocol?: string;
  /** Data types or schema names flowing over this edge (e.g. ["OrderDTO", "CustomerPII"]) */
  dataTypes?: string[];
}

export interface DiagramGroup {
  id: string;
  label: string;
  color?: NodeColor;
  /**
   * Absolute X coordinate of the group container's top-left corner (including padding).
   * Set on first drag; computed from children's bounding box when absent.
   */
  x?: number;
  /**
   * Absolute Y coordinate of the group container's top-left corner (including padding + label).
   * Set on first drag; computed from children's bounding box when absent.
   */
  y?: number;
  /** When true the group is collapsed into a compact header; child nodes are hidden. */
  collapsed?: boolean;
}

export interface DiagramMeta {
  version?: string;
  title: string;
  description?: string;
  created: string;
  modified: string;
  /** Last-used auto-layout direction. Persisted so the toolbar remembers the user's choice. */
  layoutDirection?: LayoutDirection;
  /**
   * C4 abstraction level — helps agents scope their reasoning.
   *  - context: System context (users + external systems)
   *  - container: Runtime deployable units within the system
   *  - component: Internal modules within a container
   */
  abstractionLevel?: 'context' | 'container' | 'component';
  /** Team(s) or person(s) responsible for this diagram */
  owners?: string[];
  /**
   * Domain-specific glossary.
   * Agents use this to interpret label names that may be ambiguous.
   * Example: { "fulfilment": "Process of preparing and shipping a placed order" }
   */
  glossary?: Record<string, string>;
}

/**
 * Auto-generated section consumed by AI coding agents (GitHub Copilot, Claude, etc.)
 * when the VS Code extension is NOT installed. Agents can read this from the raw
 * `.diagram` JSON file to understand the architecture depicted in the diagram.
 *
 * This section is regenerated automatically every time the diagram changes.
 * Do NOT edit it manually — your changes will be overwritten.
 */
export interface AgentContext {
  /** How to read this diagram (always "diagramflow-v1") */
  format: 'diagramflow-v1';
  /** ISO-8601 timestamp of when this section was last generated */
  generatedAt: string;
  /** Plain-English summary derived from nodes, edges and meta */
  summary: string;
  /**
   * Compact node list with semantic metadata.
   * All optional fields are omitted when empty to keep the block compact.
   */
  nodeIndex: Array<{
    id: string;
    label: string;
    /** C4-inspired component role */
    type?: NodeType;
    /** One-sentence description of what this component does */
    notes?: string;
    /** Group / domain this node belongs to */
    group?: string;
    /** Classification tags for agent reasoning (e.g. "deprecated", "external-facing") */
    tags?: string[];
    /** Source-code linkage, ownership, and ADR references */
    properties?: NodeProperties;
    /** Data sensitivity / trust boundary */
    securityClassification?: SecurityClassification;
    /** Environment scope */
    deploymentEnvironment?: DeploymentEnvironment;
  }>;
  /**
   * Compact edge list using human-readable labels (not IDs).
   * All optional fields are omitted when not set to keep the block compact.
   */
  edgeIndex: Array<{
    from: string;
    to: string;
    label?: string;
    style?: EdgeStyle;
    /** Communication protocol (e.g. "Kafka (async)", "REST") */
    protocol?: string;
    /** Data types / schema names transported over this edge */
    dataTypes?: string[];
  }>;
  /** Group membership map: groupLabel → nodeLabels[] */
  groupIndex: Array<{ group: string; members: string[] }>;
  /**
   * Domain glossary from meta.glossary.
   * Agents use this to interpret ambiguous domain terms in node labels.
   */
  glossary?: Record<string, string>;
  /**
   * Auto-generated agent hints — warnings, deprecation notices, or
   * architectural caveats the agent should consider before making changes.
   */
  insights?: string[];
  /** How to use the diagram tools when the extension is installed */
  usage: string;
}

export interface DiagramDocument {
  meta: DiagramMeta;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups?: DiagramGroup[];
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
  /** Auto-generated agent-readable context. See {@link AgentContext}. */
  agentContext?: AgentContext;
}

export const NODE_SHAPES: readonly NodeShape[] = [
  'rectangle',
  'rounded',
  'diamond',
  'cylinder',
  'note',
] as const;

export const NODE_TYPES: readonly NodeType[] = [
  'Person',
  'ExternalSystem',
  'Container',
  'Service',
  'Database',
  'MessageQueue',
  'Cache',
  'Function',
] as const;

export const SECURITY_CLASSIFICATIONS: readonly SecurityClassification[] = [
  'public',
  'internal',
  'pii-data-store',
  'security-boundary',
] as const;

export const DEPLOYMENT_ENVIRONMENTS: readonly DeploymentEnvironment[] = [
  'production',
  'staging',
  'development',
  'all',
] as const;

export const EDGE_STYLES: readonly EdgeStyle[] = [
  'solid',
  'dashed',
  'dotted',
] as const;

export const ARROW_TYPES: readonly ArrowType[] = [
  'normal',
  'arrow',
  'open',
  'none',
] as const;

export const NODE_COLORS: readonly NodeColor[] = [
  'default',
  'blue',
  'green',
  'red',
  'yellow',
  'purple',
  'gray',
] as const;

export const DEFAULT_NODE_WIDTH = 160;
export const DEFAULT_NODE_HEIGHT = 48;

/** Horizontal/vertical padding between group border and child nodes. */
export const GROUP_PADDING = 32;
/** Extra vertical space at the top of the group container reserved for the label. */
export const GROUP_LABEL_HEIGHT = 28;
/** Minimum width for an empty group container. */
export const GROUP_MIN_WIDTH = 220;
/** Minimum height for an empty group container. */
export const GROUP_MIN_HEIGHT = 120;
