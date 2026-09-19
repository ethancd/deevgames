"""Planner coverage and failure-mode checks; no game/media/deploy work is run."""
import copy
import importlib.util
import unittest
from unittest.mock import patch
from pathlib import Path

spec = importlib.util.spec_from_file_location('dag', Path(__file__).with_name('muju-content-dag.py'))
dag = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dag)


class ContentDagTests(unittest.TestCase):
    def setUp(self):
        self.graph = dag.json.loads(dag.MANIFEST.read_text())
        self.by_id, self.ordered = dag.validate(self.graph)

    def result(self, **kwargs):
        return dag.plan(self.graph, self.by_id, self.ordered, **kwargs)

    def test_piece_change_reaches_all_required_surfaces_and_orders_them(self):
        rows = self.result(kinds=['piece-stats'])['nodes']
        ids = [row['id'] for row in rows]
        required = {'rules-docs', 'browser-ui', 'persistence', 'ai-search', 'wasm-tactics',
                    'mcp-tools', 'agent-guides', 'balance-analysis', 'academy-data',
                    'academy-lessons', 'academy-audio', 'academy-video', 'static-deploy',
                    'server-deploy', 'academy-deploy', 'release-verification'}
        self.assertTrue(required <= set(ids), required - set(ids))
        for row in rows:
            for parent in row['depends_on']:
                if parent in ids:
                    self.assertLess(ids.index(parent), ids.index(row['id']))

    def test_multiple_seeds_union_without_duplicate_work(self):
        expected = {row['id'] for kind in ['ai', 'academy'] for row in self.result(kinds=[kind])['nodes']}
        rows = self.result(kinds=['ai', 'academy'])['nodes']
        self.assertEqual(expected, {row['id'] for row in rows})
        self.assertEqual(len(rows), len(expected))

    def test_mcp_change_does_not_invent_academy_rebuild(self):
        ids = {row['id'] for row in self.result(kinds=['mcp'])['nodes']}
        self.assertIn('server-deploy', ids)
        self.assertIn('static-deploy', ids)  # Public skill copies are on both hosts.
        self.assertNotIn('academy-video', ids)

    def test_nested_episode_and_new_game_file_mapping(self):
        result = self.result(files=['muju/academy/production/R11/src/new-card.tsx',
                                    'muju/src/game/new-mechanic.ts'])
        self.assertEqual(result['unmapped_paths'], [])
        self.assertIn('academy-lessons', {row['id'] for row in result['nodes']})
        self.assertIn('transitions', {row['id'] for row in result['nodes']})

    def test_historical_outputs_are_preserved_but_current_report_is_active(self):
        result = self.result(files=['muju/academy/archive/v6-production/R11/src/video.tsx',
                                    'muju/lab/results/old-study/report.json',
                                    'muju/lab/results/current-static/current.json'])
        self.assertEqual(len(result['historical_paths']), 2)
        self.assertEqual(result['unmapped_paths'], [])
        self.assertIn('balance-analysis', {row['id'] for row in result['nodes']})

    def test_rules_change_requires_hard_engine_parity_and_strength_evidence(self):
        ids = [row['id'] for row in self.result(kinds=['rules'])['nodes']]
        for node_id in ['hard-ai', 'ai-strength']:
            self.assertIn(node_id, ids)
            self.assertLess(ids.index('transitions'), ids.index(node_id))
            self.assertLess(ids.index(node_id), ids.index('game-validation'))
        self.assertLess(ids.index('hard-ai'), ids.index('ai-strength'))
        self.assertIn('ai-strength', {row['id'] for row in self.result(kinds=['piece-stats'])['nodes']})

    def test_variant_spec_hard_engine_and_strength_lab_are_mapped(self):
        result = self.result(files=['muju/docs/PHASING-2026-09-16.md',
                                    'muju/src/ai/hard/core/state.ts',
                                    'muju/lab/hard-ai/ladder/run.ts',
                                    'muju/tests/ai/hard/perft.test.ts',
                                    'muju/docs/hard-ai/RELEASE-2026-09-18.md',
                                    'muju/docs/hard-ai/e4/P7-HOME-VERDICT-DESIGN.md'])
        self.assertEqual(result['unmapped_paths'], [])
        self.assertEqual(result['historical_paths'], ['muju/docs/hard-ai/e4/P7-HOME-VERDICT-DESIGN.md'])
        reasons = {row['id']: row['reasons'] for row in result['nodes']}
        self.assertIn('file: muju/docs/PHASING-2026-09-16.md', reasons['rules-docs'])
        self.assertIn('file: muju/src/ai/hard/core/state.ts', reasons['hard-ai'])
        self.assertIn('file: muju/lab/hard-ai/ladder/run.ts', reasons['ai-strength'])
        self.assertIn('file: muju/docs/hard-ai/RELEASE-2026-09-18.md', reasons['ai-strength'])

    def test_unmapped_file_is_reported(self):
        result = self.result(files=['muju/new-public-channel/content.json'])
        self.assertEqual(result['unmapped_paths'], ['muju/new-public-channel/content.json'])

    def test_unknown_seed_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Unknown kind'):
            self.result(kinds=['typo'])
        with self.assertRaisesRegex(ValueError, 'Unknown node'):
            self.result(node_ids=['typo'])

    def test_cycles_and_missing_dependencies_are_rejected(self):
        graph = copy.deepcopy(self.graph)
        graph['nodes'][0]['depends_on'] = ['release-verification']
        with self.assertRaisesRegex(ValueError, 'cycle'):
            dag.validate(graph)
        graph['nodes'][0]['depends_on'] = ['missing-node']
        with self.assertRaisesRegex(ValueError, 'unknown dependency'):
            dag.validate(graph)

    def test_missing_local_surface_is_rejected(self):
        graph = copy.deepcopy(self.graph)
        graph['nodes'][0]['paths'] = ['muju/nonexistent-dag-test-file']
        with self.assertRaisesRegex(ValueError, 'missing path'):
            dag.validate(graph)

    def test_path_normalization_and_traversal(self):
        self.assertEqual(dag.normalize_path(str(dag.ROOT / 'muju/SPEC.md')), 'muju/SPEC.md')
        with self.assertRaises(ValueError):
            dag.normalize_path('../another-repo/muju/SPEC.md')
        self.assertFalse(dag.matches('muju/src/gameplay/file.ts', 'muju/src/game/'))

    # Academy text and source are tracked; only rendered media is local-only.
    # Path patterns lose a trailing slash when joined to the repository root.
    ACADEMY_MEDIA_MARKERS = ('/public/audio', '/public/music', '/public/art/*.png', '/output', '/qa')

    def hide(self, predicate):
        real_iglob = dag.glob.iglob
        return patch.object(dag.glob, 'iglob',
                            side_effect=lambda pattern: (iter(()) if predicate(pattern)
                                                         else real_iglob(pattern)))

    def test_local_only_media_does_not_prevent_planning_but_blocks_execution(self):
        def is_academy_media(pattern):
            return ('/muju/academy/' in pattern
                    and any(marker in pattern for marker in self.ACADEMY_MEDIA_MARKERS))

        with self.hide(is_academy_media):
            dag.validate(self.graph)  # Absent media alone must not invalidate the graph.
            result = self.result(kinds=['piece-stats'])
            for node_id in ('academy-audio', 'academy-video'):
                node = next(row for row in result['nodes'] if row['id'] == node_id)
                self.assertEqual(node['status'], 'blocked')
                self.assertTrue(node['missing_paths'])
                self.assertTrue(node['source_requirements'])
                for source in node['source_requirements']:
                    self.assertIn('archived outside git', source['reason'])
                    self.assertIn('~/Archives/muju-media-2026-09-18/academy', source['source_hint'])
            self.assertIn('BLOCKED', dag.markdown(result))
            with self.assertRaisesRegex(ValueError, 'missing path'):
                dag.validate(self.graph, require_local=True)

    def test_missing_academy_text_source_is_not_excused_as_local_only(self):
        tracked = 'muju/academy/production/R??/src/'
        with self.hide(lambda pattern: pattern.endswith('/' + tracked.rstrip('/'))):
            with self.assertRaises(ValueError) as caught:
                dag.validate(self.graph)
        self.assertIn(f'missing path/pattern {tracked}', str(caught.exception))
        for text_path in (tracked, 'muju/academy/BIBLE.md', 'muju/academy/production/R??/episode.json'):
            self.assertIsNone(dag.local_source(self.graph, text_path))
        for media_path in ('muju/academy/production/R??/output/',
                           'muju/academy/production/R??/public/audio/',
                           'muju/academy/production/R??/qa/'):
            self.assertIsNotNone(dag.local_source(self.graph, media_path))


if __name__ == '__main__':
    unittest.main()
