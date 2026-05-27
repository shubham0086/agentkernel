import { describe, test, expect } from 'vitest';
import { GraphifyClient } from '../engines/03_retriever/graphify.js';
import fs from 'fs/promises';
import path from 'path';

describe('Graphify AST Scanner Engine 03 (ESM)', () => {
  test('should extract dependencies from JavaScript files correctly', async () => {
    const tmpdir = path.resolve(process.cwd(), 'temp-test-graphify');
    await fs.mkdir(tmpdir, { recursive: true });

    const fileA = path.join(tmpdir, 'moduleA.js');
    const fileB = path.join(tmpdir, 'moduleB.js');

    await fs.writeFile(fileA, "export const value = 42;", 'utf-8');
    await fs.writeFile(fileB, "import { value } from './moduleA.js';\nconsole.log(value);", 'utf-8');

    const client = new GraphifyClient(tmpdir);
    const graph = await client.buildGraph();

    expect(graph.nodes).toHaveProperty('moduleA.js');
    expect(graph.nodes).toHaveProperty('moduleB.js');

    const neighbors = await client.queryNeighbors('moduleA.js');
    expect(neighbors.dependents).toContain('moduleB.js');

    // Cleanup
    await fs.rm(tmpdir, { recursive: true, force: true });
  });
});
