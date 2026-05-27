import os
import tempfile
import pytest
from engines.retriever.graphify import GraphifyClient

def test_graphify_dependency_scanning():
    # Set up temp workspace with mock files
    with tempfile.TemporaryDirectory() as tmpdir:
        file_a = os.path.join(tmpdir, "module_a.py")
        file_b = os.path.join(tmpdir, "module_b.py")
        
        # module_b imports module_a
        with open(file_a, "w") as f:
            f.write("def hello(): return 'world'")
            
        with open(file_b, "w") as f:
            f.write("import module_a\n\ndef run(): module_a.hello()")
            
        client = GraphifyClient(project_root=tmpdir)
        graph = client.build_graph()
        
        # Verify node counts
        assert "module_a.py" in graph["nodes"]
        assert "module_b.py" in graph["nodes"]
        
        # Verify dependency edge
        edges = graph["edges"]
        assert any(e["from"] == "module_b.py" and e["to"] == "module_a" for e in edges)
        
        # Verify neighbor query
        neighbors = client.query_neighbors("module_a")
        assert "module_b.py" in neighbors["dependents"]
