#!/usr/bin/env python3
"""Read-only Muju impact planner. Paths are relative to the repository root."""
import argparse
import fnmatch
import glob
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'muju/content-dag.json'


def local_source(graph, path):
    return next((source for source in graph.get('local_only_paths', [])
                 if path.startswith(source['prefix'])), None)


def missing_paths(node, root=ROOT):
    return [pattern for pattern in node['paths']
            if next(glob.iglob(str(root / pattern)), None) is None]


def validate(graph, root=ROOT, require_local=False):
    if graph.get('schema_version') != 1:
        raise ValueError('Unsupported schema_version')
    nodes = graph['nodes']
    ids = [node['id'] for node in nodes]
    if len(set(ids)) != len(ids):
        raise ValueError('Duplicate node IDs')
    by_id = {node['id']: node for node in nodes}
    for node in nodes:
        if not re.fullmatch(r'[a-z][a-z0-9-]*', node['id']):
            raise ValueError(f'Invalid node ID: {node["id"]}')
        for field in ('title', 'update', 'verify'):
            if not node.get(field):
                raise ValueError(f'{node["id"]}: missing {field}')
        for dependency in node['depends_on']:
            if dependency not in by_id:
                raise ValueError(f'{node["id"]}: unknown dependency {dependency}')
        for pattern in node['paths']:
            if Path(pattern).is_absolute() or '..' in Path(pattern).parts:
                raise ValueError(f'{node["id"]}: path must stay inside repository: {pattern}')
            if (next(glob.iglob(str(root / pattern)), None) is None
                    and (require_local or not local_source(graph, pattern))):
                raise ValueError(f'{node["id"]}: missing path/pattern {pattern}')
        for command in node.get('commands', []):
            cwd = (root / command['cwd']).resolve()
            if not cwd.is_relative_to(root.resolve()) or not cwd.is_dir():
                raise ValueError(f'{node["id"]}: invalid command cwd')
    for kind, seeds in graph['kinds'].items():
        if not seeds or any(seed not in by_id for seed in seeds):
            raise ValueError(f'{kind}: empty or unknown seed node')
    ordered, visiting, visited = [], set(), set()

    def visit(node_id):
        if node_id in visiting:
            raise ValueError(f'Dependency cycle at {node_id}')
        if node_id in visited:
            return
        visiting.add(node_id)
        for dependency in by_id[node_id]['depends_on']:
            visit(dependency)
        visiting.remove(node_id)
        visited.add(node_id)
        ordered.append(node_id)

    for node_id in ids:
        visit(node_id)
    return by_id, ordered


def matches(path, pattern):
    # Match an exact/glob file, or any descendant of an exact/glob directory.
    # Ancestors allow R??/src/ to match R11/src/video.tsx without broad crawling.
    pattern = pattern.rstrip('/')
    return any(fnmatch.fnmatchcase(candidate, pattern)
               for candidate in [path, *(str(p) for p in Path(path).parents)])


def normalize_path(value):
    value = value.removeprefix('./')
    path = Path(value)
    if path.is_absolute():
        try:
            value = path.relative_to(ROOT).as_posix()
        except ValueError as error:
            raise ValueError(f'Outside repository: {value}') from error
    if '..' in Path(value).parts:
        raise ValueError(f'Use a repository-relative path without ..: {value}')
    return value.rstrip('/')


def plan(graph, by_id, ordered, kinds=(), node_ids=(), files=()):
    reasons = {}

    def seed(node_id, reason):
        reasons.setdefault(node_id, []).append(reason)

    for kind in kinds:
        if kind not in graph['kinds']:
            raise ValueError(f'Unknown kind {kind}; choose {", ".join(graph["kinds"])}')
        for node_id in graph['kinds'][kind]:
            seed(node_id, f'change kind: {kind}')
    for node_id in node_ids:
        if node_id not in by_id:
            raise ValueError(f'Unknown node {node_id}')
        seed(node_id, 'explicit node')
    historical, unmapped = [], []
    for value in files:
        path = normalize_path(value)
        if (any(matches(path, p) for p in graph.get('historical', []))
                and not any(matches(path, p) for p in graph.get('historical_exceptions', []))):
            historical.append(path)
            continue
        found = False
        for node in graph['nodes']:
            if any(matches(path, pattern) for pattern in node['paths']):
                seed(node['id'], f'file: {path}')
                found = True
        if not found:
            unmapped.append(path)
    selected = set(reasons)
    # A topological pass computes the complete downstream closure.
    for node_id in ordered:
        parents = [p for p in by_id[node_id]['depends_on'] if p in selected]
        if parents:
            selected.add(node_id)
            reasons.setdefault(node_id, []).extend(f'upstream changed: {p}' for p in parents)
    return {
        'schema_version': 1,
        'notice': 'Review plan only: no edits, tests, media generation or deployments have run. '
                  'Unselected prerequisites must be current but need no automatic rebuild. '
                  'Unmapped paths require manual investigation; this graph is not a semantic proof.',
        'historical_paths': historical,
        'unmapped_paths': unmapped,
        'nodes': [{**by_id[node_id],
                   'status': 'blocked' if missing_paths(by_id[node_id]) else 'pending',
                   'missing_paths': missing_paths(by_id[node_id]),
                   'source_requirements': [source for source in graph.get('local_only_paths', [])
                                           if any(p.startswith(source['prefix']) for p in missing_paths(by_id[node_id]))],
                   'reasons': reasons[node_id],
                   'unchanged_prerequisites': [p for p in by_id[node_id]['depends_on'] if p not in selected]}
                  for node_id in ordered if node_id in selected],
    }


def mermaid(nodes):
    ids = {node['id'] for node in nodes}
    lines = ['flowchart TD']
    for node in nodes:
        # JSON string quoting is also valid Mermaid label quoting here.
        label = json.dumps(node['title'], ensure_ascii=False)
        lines.append(f'  {node["id"].replace("-", "_")}[{label}]')
    for node in nodes:
        for parent in node['depends_on']:
            if parent in ids:
                lines.append(f'  {parent.replace("-", "_")} --> {node["id"].replace("-", "_")}')
    return '\n'.join(lines)


def markdown(result):
    lines = ['# Muju change impact plan', '', result['notice'], '']
    if result['unmapped_paths']:
        lines += ['UNMAPPED — investigate and extend the graph before claiming complete coverage:',
                  *[f'- `{p}`' for p in result['unmapped_paths']], '']
    if result['historical_paths']:
        lines += ['Historical paths — preserve original evidence; explicitly select a node if creating a new study:',
                  *[f'- `{p}`' for p in result['historical_paths']], '']
    for index, node in enumerate(result['nodes'], 1):
        lines += [f'## {index}. [ ] {node["id"]} — {node["title"]}', '',
                  'Reason: ' + '; '.join(node['reasons']), '',
                  'Paths: ' + (', '.join(f'`{p}`' for p in node['paths']) or 'external release surface'), '']
        if node['unchanged_prerequisites']:
            lines += ['Read/confirm current prerequisites: ' + ', '.join(node['unchanged_prerequisites']), '']
        lines += [f'- Update: {value}' for value in node['update']]
        lines += [f'- Verify: {value}' for value in node['verify']]
        for command in node.get('commands', []):
            lines.append(f'- Command (cwd `{command["cwd"]}`): `{command["run"]}` — {command["effect"]}')
        lines += [f'- External: {value}' for value in node.get('external', [])]
        if node['missing_paths']:
            lines += ['', 'BLOCKED — obtain missing production inputs:',
                      *[f'- `{p}`' for p in node['missing_paths']]]
            for source in node['source_requirements']:
                lines += [source['reason'], source['source_hint']]
        lines += ['', f'Disposition: {node["status"]}. Evidence: —', '']
    if not result['nodes']:
        lines += ['No mapped active nodes selected. This is not a claim that no work is needed.', '']
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    checker = commands.add_parser('check', help='Validate graph and tracked paths; report unavailable production inputs')
    checker.add_argument('--require-local', action='store_true', help='Also fail if declared local-only production inputs are missing')
    commands.add_parser('diagram', help='Print the complete graph as Mermaid')
    planner = commands.add_parser('plan', help='Print downstream work in dependency order; performs no actions')
    planner.add_argument('--kind', action='append', default=[], help='Repeatable change kind; see content-dag.json')
    planner.add_argument('--node', action='append', default=[], help='Repeatable explicit seed node')
    planner.add_argument('--files', nargs='+', default=[], help='Changed paths relative to repository root, even from another cwd')
    planner.add_argument('--format', choices=['markdown', 'json', 'mermaid'], default='markdown')
    args = parser.parse_args()
    try:
        graph = json.loads(MANIFEST.read_text())
        by_id, ordered = validate(graph, require_local=getattr(args, 'require_local', False))
        if args.command == 'check':
            missing = sorted({p for node in graph['nodes'] for p in missing_paths(node)})
            print(f'Valid DAG: {len(by_id)} nodes, {sum(len(n["depends_on"]) for n in graph["nodes"])} edges; required repository paths exist.')
            if missing:
                print(f'{len(missing)} declared local-only production paths unavailable; affected plan nodes are blocked until inputs are obtained.')
                for source in graph.get('local_only_paths', []):
                    if any(p.startswith(source['prefix']) for p in missing):
                        print(source['reason'] + ' Source: ' + source['source_hint'])
        elif args.command == 'diagram':
            print(mermaid([by_id[node_id] for node_id in ordered]))
        else:
            if not (args.kind or args.node or args.files):
                parser.error('plan requires --kind, --node or --files')
            result = plan(graph, by_id, ordered, args.kind, args.node, args.files)
            if args.format == 'json':
                print(json.dumps(result, indent=2, ensure_ascii=False))
            elif args.format == 'mermaid':
                print(mermaid(result['nodes']))
            else:
                print(markdown(result))
            # Unknown paths must never silently produce a successful coverage plan.
            if result['unmapped_paths']:
                print('Unmapped paths require investigation: ' + ', '.join(result['unmapped_paths']), file=sys.stderr)
                return 2
    except (ValueError, KeyError, OSError) as error:
        print(f'Muju DAG error: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
