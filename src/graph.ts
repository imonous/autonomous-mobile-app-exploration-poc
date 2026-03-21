export interface Node {
  id: string;
  summary: string;
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
  const id = `screen_${String(graph.nodes.length)}`;
  graph.nodes.push({ id, summary });
  return id;
}

export function addEdge(graph: Graph, from: string, to: string, action: string): void {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  if (!nodeIds.has(from)) throw new Error(`Unknown node: ${from}`);
  if (!nodeIds.has(to)) throw new Error(`Unknown node: ${to}`);
  graph.edges.push({ from, to, action });
}

export function serialize(graph: Graph): string {
  return JSON.stringify({ nodes: graph.nodes, edges: graph.edges }, null, 2);
}
