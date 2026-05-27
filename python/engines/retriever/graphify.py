import os
import re
import ast
from pathlib import Path
from typing import Dict, List, Set, Any

class GraphifyClient:
    """
    Graphify layer from Sovereign Architecture.
    Provides structural code intelligence and dependency mapping to calculate blast radius.
    """
    def __init__(self, project_root: str):
        self.project_root = os.path.abspath(project_root)
        self.graph_cache = None

    def build_graph(self) -> Dict[str, Any]:
        """Generates or loads the structural dependency graph for the workspace."""
        if self.graph_cache is not None:
            return self.graph_cache

        graph = {"nodes": {}, "edges": []}
        all_files = self._walk_dir(self.project_root)

        for file_path in all_files:
            if not self._is_analyzable(file_path):
                continue
            
            rel_path = os.path.relpath(file_path, self.project_root).replace("\\", "/")
            try:
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                
                deps = self._extract_dependencies(content, rel_path, file_path)
                
                graph["nodes"][rel_path] = {
                    "type": os.path.splitext(rel_path)[1],
                    "dependencyCount": len(deps)
                }
                
                for dep in deps:
                    graph["edges"].append({"from": rel_path, "to": dep})
            except Exception:
                # Skip unreadable/corrupted files
                continue

        self.graph_cache = graph
        return graph

    def query_neighbors(self, target_path: str) -> Dict[str, Any]:
        """
        Queries Graphify for structural neighbors (blast radius).
        Returns dependents (files relying on target) and dependencies (files target relies on).
        """
        graph = self.build_graph()
        normalized_target = target_path.replace("\\", "/")
        
        dependents = set()
        dependencies = set()
        
        for edge in graph["edges"]:
            edge_from = edge["from"]
            edge_to = edge["to"]
            
            # Match if the target path is matching or is included
            if edge_to == normalized_target or normalized_target.endswith(edge_to) or edge_to.endswith(normalized_target):
                dependents.add(edge_from)
            if edge_from == normalized_target:
                dependencies.add(edge_to)

        return {
            "target": normalized_target,
            "dependents": list(dependents),
            "dependencies": list(dependencies)
        }

    def get_context_string(self, target_path: str) -> str:
        """Formats the Graphify output for LLM context injection."""
        try:
            neighbors = self.query_neighbors(target_path)
            if not neighbors["dependents"] and not neighbors["dependencies"]:
                return ""

            context = f"\n\n### GRAPHIFY STRUCTURAL CONTEXT FOR [{target_path}]\n"
            if neighbors["dependencies"]:
                context += f"- **Dependencies (What this file uses):** {', '.join(neighbors['dependencies'])}\n"
            if neighbors["dependents"]:
                context += f"- **Dependents (What relies on this file):** {', '.join(neighbors['dependents'])}\n"
            context += "\n*Rule: If you modify this file, be aware of the blast radius affecting its dependents.*\n"
            return context
        except Exception:
            return ""

    def _walk_dir(self, dir_path: str) -> List[str]:
        """Recursively walk directory, ignoring build, node_modules, and git directories."""
        skip_dirs = {
            "node_modules", ".git", "dist", "build", ".next", 
            "coverage", "venv", ".venv", "__pycache__", ".pytest_cache"
        }
        file_list = []
        for root, dirs, files in os.walk(dir_path):
            # Modify dirs in-place to skip unwanted subdirectories
            dirs[:] = [d for d in dirs if d not in skip_dirs]
            for file in files:
                file_list.append(os.path.join(root, file))
        return file_list

    def _is_analyzable(self, file_path: str) -> bool:
        """Determines if the file extension is supported for dependency analysis."""
        valid_exts = {".js", ".ts", ".jsx", ".tsx", ".py", ".go", ".mjs", ".cjs"}
        return os.path.splitext(file_path)[1] in valid_exts

    def _extract_dependencies(self, content: str, rel_path: str, abs_path: str) -> List[str]:
        """Extracts dependencies using AST (Python) or regular expressions (JS/TS/Go)."""
        ext = os.path.splitext(rel_path)[1]
        deps = []

        if ext == ".py":
            try:
                tree = ast.parse(content)
                for node in ast.walk(tree):
                    if isinstance(node, ast.Import):
                        for name in node.names:
                            deps.append(name.name)
                    elif isinstance(node, ast.ImportFrom):
                        if node.module:
                            # Handle relative imports
                            level = node.level
                            if level > 0:
                                # Relative import
                                path_parts = Path(rel_path).parts[:-level]
                                module_parts = node.module.split(".")
                                resolved = "/".join(path_parts + tuple(module_parts))
                                deps.append(resolved)
                            else:
                                deps.append(node.module)
            except SyntaxError:
                # Fallback to regex for malformed Python files
                imp_regex = r"^\s*(?:import|from)\s+([a-zA-Z0-9_\.]+)"
                for match in re.finditer(imp_regex, content, re.MULTILINE):
                    deps.append(match.group(1))
        else:
            # JS/TS/Go regex matchers
            req_regex = r"require\(['\"]([^'\"#\?]+)['\"]\)"
            imp_regex = r"import\s+.*?\s+from\s+['\"]([^'\"#\?]+)['\"]"
            go_regex = r"import\s+['\"]([^'\"]+)['\"]"
            
            for match in re.finditer(req_regex, content):
                deps.append(match.group(1))
            for match in re.finditer(imp_regex, content):
                deps.append(match.group(1))
            if ext == ".go":
                for match in re.finditer(go_regex, content):
                    deps.append(match.group(1))

        # Normalize relative imports/references
        resolved_deps = []
        for d in deps:
            if d.startswith("."):
                # Resolve relative path
                dir_name = os.path.dirname(rel_path)
                resolved = os.path.normpath(os.path.join(dir_name, d)).replace("\\", "/")
                resolved_deps.append(resolved)
            else:
                resolved_deps.append(d)

        return list(set(resolved_deps))
