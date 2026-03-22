export interface ChecklistElement {
  label: string;
  explored: boolean;
}

export interface Node {
  id: string;
  summary: string;
  checklist: ChecklistElement[];
}

export interface Edge {
  from: string;
  to: string;
  action: string;
}

export interface Graph {
  nodes: Node[];
  edges: Edge[];
}

export function createGraph(): Graph {
  return { nodes: [], edges: [] };
}

export function addNode(graph: Graph, summary: string): string {
  const id = `view_${String(graph.nodes.length)}`;
  graph.nodes.push({ id, summary, checklist: [] });
  return id;
}

export function addEdge(graph: Graph, from: string, to: string, action: string): void {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  if (!nodeIds.has(from)) throw new Error(`Unknown node: ${from}`);
  if (!nodeIds.has(to)) throw new Error(`Unknown node: ${to}`);
  graph.edges.push({ from, to, action });
}

export function addChecklistElements(graph: Graph, nodeId: string, labels: string[]): void {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`Unknown node: ${nodeId}`);
  for (const label of labels) {
    node.checklist.push({ label, explored: false });
  }
}

export function markExplored(graph: Graph, nodeId: string, elementLabel: string): void {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`Unknown node: ${nodeId}`);
  const entry = node.checklist.find((e) => e.label === elementLabel);
  if (!entry) throw new Error(`Unknown checklist element: "${elementLabel}" on node ${nodeId}`);
  entry.explored = true;
}

export function allExplored(graph: Graph): boolean {
  if (graph.nodes.length === 0) return false;
  return graph.nodes.every((n) => n.checklist.every((e) => e.explored));
}

export function serialize(graph: Graph): string {
  return JSON.stringify({ nodes: graph.nodes, edges: graph.edges }, null, 2);
}
