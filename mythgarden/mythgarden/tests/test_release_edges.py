"""Regression tests for release risks outside the happy-path week."""
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from django.db import close_old_connections, connection
from django.test import Client, TestCase, TransactionTestCase, override_settings

from mythgarden.game_logic import ActionExecutor, ActionGenerator, EventOperator
from mythgarden.models import Action, DialogueLine, Item, ItemToken, Mythling, Place, ScheduledEvent, Session, Villager, VillagerState
from mythgarden.models._constants import COMMON, FOREST, MAX_ITEMS, OVERSLEPT_TIME, RAINBOW, SUNSET
from mythgarden.view_helpers import load_session_with_related_data
from .release_client import GameClient


@override_settings(SECURE_SSL_REDIRECT=False, STORAGES={
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
})
class ReleaseEdgeTests(TestCase):
    fixtures = ['initial_data.json']

    def setUp(self):
        self.client = GameClient()
        self.client.get('/')
        self.key = self.client.session['session_key']

    def game(self):
        return load_session_with_related_data(self.key)

    def act(self, action_type):
        action = next(a for a in ActionGenerator().get_actions_for_session(self.game()) if a.action_type == action_type)
        response = self.client.post('/action', {'uniqueDigest': action.unique_digest}, content_type='application/json')
        self.assertEqual(response.status_code, 200, response.content[:250])
        self.assertNotIn('error', response.json(), response.json())
        return response.json()

    def test_duplicate_gather_request_spends_time_and_awards_item_only_once(self):
        game = self.game()
        game.location = Place.objects.get(place_type=FOREST)
        game.save()
        page = self.client.get('/')
        version = page.context['ctx'].get('stateVersion', 'before-version-protection')
        gather = next(a for a in ActionGenerator().get_actions_for_session(self.game()) if a.action_type == Action.GATHER)
        body = {'uniqueDigest': gather.unique_digest}
        first = self.client.post('/action', body, content_type='application/json', HTTP_X_GAME_VERSION=version)
        self.assertEqual(first.status_code, 200)
        time, items = self.game().clock.time, self.game().inventory.item_tokens.count()
        duplicate = self.client.post('/action', body, content_type='application/json', HTTP_X_GAME_VERSION=version)
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(self.game().clock.time, time)
        self.assertEqual(self.game().inventory.item_tokens.count(), items)
        self.assertIn('actions', duplicate.json())

    def test_sparse_gathering_pool_skips_missing_rarities(self):
        forest = Place.objects.get(place_type=FOREST)
        common = forest.item_pool.filter(rarity=COMMON).first()
        forest.item_pool.set([common])
        draw = ActionExecutor()._ActionExecutor__pull_item_from_pool
        # The first selected rarity is absent. This must retry, not crash.
        with patch('mythgarden.game_logic.action_executor.random.choices', side_effect=lambda population, **kw: [population[-1]]):
            self.assertEqual(draw(forest, 0), common)

    def test_midnight_events_run_once_in_chronological_order(self):
        ScheduledEvent.objects.all().delete()
        yesterday = ScheduledEvent.objects.create(day='MON', time=1439, event_type=ScheduledEvent.VILLAGER_APPEARS)
        midnight = ScheduledEvent.objects.create(is_daily=True, time=0, event_type=ScheduledEvent.VILLAGER_APPEARS)
        today = ScheduledEvent.objects.create(day='TUE', time=5, event_type=ScheduledEvent.VILLAGER_APPEARS)
        clock = self.game().clock
        clock.last_triggered_day, clock.last_triggered_time = 'MON', 1430
        clock.day, clock.time = 'TUE', 10
        operator = EventOperator()
        self.assertEqual([e.pk for e in operator.build_events_to_trigger_queue(clock)], [yesterday.pk, midnight.pk, today.pk])
        clock.mark_last_triggered_point_as_now()
        self.assertEqual(list(operator.build_events_to_trigger_queue(clock)), [])

    def test_profile_rejects_malformed_and_partial_updates(self):
        before = self.game().hero.name
        for body in ('{', 'null', '[]', '{}', '{"userData":null}', '{"userData":{"name":7}}', '{"userData":{"name":"a name longer than sixteen characters"}}', '{"userData":{"name":"Partial","portraitPath":"missing.png"}}'):
            with self.subTest(body=body):
                response = self.client.post('/user_data', body, content_type='application/json')
                self.assertEqual(response.status_code, 400)
                self.assertIn('error', response.json())
                self.assertEqual(self.game().hero.name, before)

    def test_reset_cannot_be_triggered_by_get_or_without_csrf(self):
        self.assertEqual(self.client.get('/kys').status_code, 405)
        browser = Client(enforce_csrf_checks=True)
        browser.get('/')
        self.assertEqual(browser.post('/kys').status_code, 403)

    def test_retry_of_last_sleep_cannot_advance_the_new_week(self):
        game = self.game()
        game.location = next(p for p in Place.objects.all() if p.is_farmhouse)
        game.save()
        game.clock.day = game.clock.last_triggered_day = 'SUN'
        game.clock.time = game.clock.last_triggered_time = SUNSET
        game.clock.save()
        old_version = self.client.state_version
        self.act(Action.SLEEP)
        fresh_version = self.client.state_version
        response = self.client.post('/action', {'uniqueDigest': 'SLEEP-'}, content_type='application/json', HTTP_X_GAME_VERSION=old_version)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['stateVersion'], fresh_version)
        self.assertEqual((self.game().clock.day, self.game().clock.time), ('MON', 360))
        self.assertFalse(self.game().has_taken_action)

    def test_immediate_settings_invalidate_actions_in_an_older_tab(self):
        old_version = self.client.state_version
        action = next(a for a in ActionGenerator().get_actions_for_session(self.game()) if a.action_type == Action.TRAVEL)
        self.client.post('/settings/update', {'draft_building_hours': True}, content_type='application/json')
        response = self.client.post('/action', {'uniqueDigest': action.unique_digest}, content_type='application/json', HTTP_X_GAME_VERSION=old_version)
        self.assertEqual(response.status_code, 409)
        self.assertFalse(self.game().has_taken_action)
        self.act(Action.TRAVEL)

    def test_storage_roundtrip_and_full_storage_rollback(self):
        game = self.game()
        game.location = next(p for p in Place.objects.all() if p.is_farmhouse)
        game.save()
        item = Item.objects.get(name='Parsnip Seed')
        token = ItemToken.objects.create(session=game, item=item)
        game.inventory.item_tokens.add(token)
        self.act(Action.STOW)
        self.assertTrue(self.game().location_state.item_tokens.filter(pk=token.pk).exists())
        self.act(Action.RETRIEVE)
        self.assertTrue(self.game().inventory.item_tokens.filter(pk=token.pk).exists())
        self.game().location_state.item_tokens.set([ItemToken.objects.create(session=game, item=item) for _ in range(MAX_ITEMS)])
        response = self.client.post('/action', {'uniqueDigest': f'STOW-{token.pk}'}, content_type='application/json')
        self.assertIn('error', response.json())
        self.assertTrue(self.game().inventory.item_tokens.filter(pk=token.pk).exists())
        self.assertEqual(self.game().location_state.item_tokens.count(), MAX_ITEMS)

    def test_passing_out_and_rainbow_bonus_end_at_the_right_morning(self):
        for rainbow in (False, True):
            with self.subTest(rainbow=rainbow):
                game = self.game()
                game.location = Place.objects.get(place_type=FOREST)
                game.save()
                game.clock.day = game.clock.last_triggered_day = 'MON'
                game.clock.time = game.clock.last_triggered_time = 1435
                game.clock.save()
                game.mythling_states.filter(mythling__mythling_type=RAINBOW).update(is_in_possession=rainbow)
                self.act(Action.GATHER)
                if rainbow:
                    self.assertTrue(self.game().clock.is_new_day)
                    self.assertLess(self.game().clock.time, 180)
                    # Walk until the extra hours expire; no clock jumps during
                    # this boundary crossing and no inventory overflow.
                    while self.game().clock.time < 180:
                        self.act(Action.TRAVEL)
                self.assertEqual(self.game().clock.day, 'TUE')
                self.assertEqual(self.game().clock.time, OVERSLEPT_TIME)
                self.assertFalse(self.game().clock.is_new_day)

    def test_shipped_dialogue_covers_every_character_and_affinity_tier(self):
        for villager in Villager.objects.all():
            for trigger, _ in DialogueLine.DIALOGUE_TRIGGERS:
                tiers = range(VillagerState.TOTAL_TIERS + 1) if trigger == DialogueLine.TALKED_TO else (None,)
                for tier in tiers:
                    with self.subTest(villager=villager.name, trigger=trigger, tier=tier):
                        self.assertTrue(villager.get_dialogue(trigger, tier).full_text.strip())


@override_settings(SECURE_SSL_REDIRECT=False, STORAGES={
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
})
class ConcurrentActionTests(TransactionTestCase):
    fixtures = ['initial_data.json']

    def test_simultaneous_requests_commit_only_one_action(self):
        if connection.vendor != 'postgresql':
            self.skipTest('Requires PostgreSQL row locks, as used on Render.')
        player = GameClient()
        player.get('/')
        key = player.session['session_key']
        game = load_session_with_related_data(key)
        game.location = Place.objects.get(place_type=FOREST)
        game.save()
        gather = next(a for a in ActionGenerator().get_actions_for_session(load_session_with_related_data(key)) if a.action_type == Action.GATHER)
        barrier = Barrier(2)

        def send():
            close_old_connections()
            browser = Client()
            browser.cookies = player.cookies.copy()
            try:
                barrier.wait(timeout=10)
                return browser.post('/action', {'uniqueDigest': gather.unique_digest}, content_type='application/json', HTTP_X_GAME_VERSION=player.state_version).status_code
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(lambda _: send(), range(2)))
        self.assertEqual(sorted(responses), [200, 409])
        game = load_session_with_related_data(key)
        self.assertEqual(game.inventory.item_tokens.count(), 1)
        self.assertEqual(game.clock.time, 360 + gather.cost_amount)
