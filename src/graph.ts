export interface ChecklistElement {
  id: string;
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
  if (from === to) throw new Error(`Self-loop not allowed: '${from}'`);
  if (!nodeIds.has(from)) throw new Error(`Unknown node: ${from}`);
  if (!nodeIds.has(to)) throw new Error(`Unknown node: ${to}`);
  if (graph.edges.some((e) => e.from === from && e.to === to))
    throw new Error(
      `Edge already exists from '${from}' to '${to}' — no need to record alternative paths between connected nodes`,
    );
  graph.edges.push({ from, to, action });
}

export function addChecklistElements(
  graph: Graph,
  nodeId: string,
  labels: string[],
): { id: string; label: string }[] {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`Unknown node: ${nodeId}`);
  const startIndex = graph.nodes.reduce((sum, n) => sum + n.checklist.length, 0);
  const result: { id: string; label: string }[] = [];
  for (let i = 0; i < labels.length; i++) {
    const id = `check_${String(startIndex + i)}`;
    node.checklist.push({ id, label: labels[i], explored: false });
    result.push({ id, label: labels[i] });
  }
  return result;
}

export function markExplored(graph: Graph, checklistElementId: string): void {
  for (const node of graph.nodes) {
    const entry = node.checklist.find((e) => e.id === checklistElementId);
    if (entry) {
      entry.explored = true;
      return;
    }
  }
  throw new Error(`Unknown checklist element: ${checklistElementId}`);
}

export function allExplored(graph: Graph): boolean {
  if (graph.nodes.length === 0) return false;
  return graph.nodes.every((n) => n.checklist.length > 0 && n.checklist.every((e) => e.explored));
}

export function printChecklist(graph: Graph): void {
  if (graph.nodes.length === 0) return;

  const allItems = graph.nodes.flatMap((n) => n.checklist);
  const explored = allItems.filter((e) => e.explored).length;
  console.log(`\nChecklist (${String(explored)}/${String(allItems.length)} explored):`);

  for (const node of graph.nodes) {
    if (node.checklist.length === 0) continue;
    const desc = node.summary.length > 60 ? node.summary.slice(0, 60) + "…" : node.summary;
    console.log(`  ${node.id} (${desc}):`);
    for (const item of node.checklist) {
      const prefix = item.explored ? "\x1b[2m  \u2713" : "  \u2717";
      const suffix = item.explored ? "\x1b[0m" : "";
      console.log(`${prefix} ${item.label}${suffix}`);
    }
  }
}

export function serialize(graph: Graph): string {
  return JSON.stringify({ nodes: graph.nodes, edges: graph.edges }, null, 2);
}
