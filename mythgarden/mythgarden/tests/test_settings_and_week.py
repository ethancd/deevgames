"""Release checks against the shipped world and real HTTP action endpoint.

Run separately from the legacy tests, which mutate Session class properties:
python manage.py test mythgarden.tests.test_settings_and_week --testrunner django.test.runner.DiscoverRunner
"""
import random
from collections import Counter, deque
from itertools import product
from unittest.mock import patch

from django.test import Client, TestCase, override_settings
from django.db import IntegrityError

from mythgarden.game_logic import ActionGenerator, EventOperator
from mythgarden.models import (
    Action, Bridge, Building, Item, ItemToken, Place, PopulateShopEvent, Session,
    Villager, VillagerAppearsEvent,
)
from mythgarden.models._constants import (
    DAYS_OF_WEEK, FARM, FOREST, GIFT, LOVE, MAX_ITEMS, SEED, SHOP, SUNSET,
)
from mythgarden.view_helpers import load_session_with_related_data


@override_settings(SECURE_SSL_REDIRECT=False, STORAGES={
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
})
class SettingsAndWeekTests(TestCase):
    fixtures = ['initial_data.json']

    def setUp(self):
        random.seed(20260912)
        self.assertEqual(self.client.get('/').status_code, 200)
        self.session_key = self.client.session['session_key']
        self.executed = Counter()

    def game(self):
        return load_session_with_related_data(self.session_key)

    def configure(self, **options):
        response = self.client.post('/settings/update', {f'draft_{k}': v for k, v in options.items()}, content_type='application/json')
        self.assertEqual(response.status_code, 200, response.content[:200])
        self.game().reset_session_state('Test run')

    def actions(self):
        return ActionGenerator().get_actions_for_session(self.game())

    def act(self, action):
        response = self.client.post('/action', {'uniqueDigest': action.unique_digest}, content_type='application/json')
        self.assertEqual(response.status_code, 200, response.content[:300])
        payload = response.json()
        self.assertNotIn('error', payload, (action.unique_digest, payload))
        self.assertIn('actions', payload)
        self.executed[action.action_type] += 1
        session = self.game()
        self.assertGreaterEqual(session.wallet.money, 0)
        self.assertLessEqual(session.inventory.item_tokens.count(), MAX_ITEMS)
        for place in session.place_states.all():
            self.assertLessEqual(place.item_tokens.count(), MAX_ITEMS, place.place.name)
        self.assertTrue(all(0 <= v.affinity <= 100 for v in session.villager_states.all()))
        return payload

    def travel(self, destination):
        """Walk the actual map; every move is an offered, validated HTTP action."""
        start = self.game().location.pk
        graph = {p.pk: [] for p in Place.objects.all()}
        for bridge in Bridge.objects.all():
            graph[bridge.place_1_id].append(bridge.place_2_id)
            graph[bridge.place_2_id].append(bridge.place_1_id)
        for building in Building.objects.all():
            graph[building.pk].append(building.surround_id)
            graph[building.surround_id].append(building.pk)
        queue = deque([(start, [])])
        visited = {start}
        while queue:
            place_id, path = queue.popleft()
            if place_id == destination.pk:
                for target in path:
                    action = next((a for a in self.actions() if a.action_type == Action.TRAVEL and a.target_place_id == target), None)
                    self.assertIsNotNone(action, f'No route into {target} at {self.game().clock.display}')
                    self.act(action)
                return
            for neighbor in graph[place_id]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append((neighbor, path + [neighbor]))
        self.fail(f'No map path to {destination.name}')

    def test_settings_are_per_player_and_apply_on_next_run(self):
        self.act(next(a for a in self.actions() if a.action_type == Action.TRAVEL))
        current = self.client.get('/settings').json()
        for key in ('villagers_move', 'building_hours', 'dynamic_shop'):
            self.assertFalse(current[key])
        result = self.client.post('/settings/update', {'draft_villagers_move': True, 'draft_building_hours': True, 'draft_dynamic_shop': True}, content_type='application/json').json()
        self.assertFalse(result['villagers_move'])
        self.assertEqual(result['draft_score_multiplier'], 2)
        other = Client()
        other.get('/')
        self.assertFalse(other.get('/settings').json()['draft_villagers_move'])
        hero_id = self.game().hero_id
        self.game().reset_session_state('Next week')
        self.assertEqual(self.game().hero_id, hero_id)
        self.assertTrue(self.client.get('/settings').json()['villagers_move'])
        self.assertEqual(self.client.get('/settings').json()['score_multiplier'], 2)
        self.assertTrue(self.client.get('/settings').json()['can_apply_immediately'])

    def test_settings_apply_immediately_before_first_action_even_after_reload(self):
        self.client.post('/user_data', {'userData': {'name': 'Preview Farmer'}}, content_type='application/json')
        self.client.get('/')
        self.assertTrue(self.client.get('/settings').json()['can_apply_immediately'])
        for enabled in (True, False):
            with self.subTest(enabled=enabled):
                result = self.client.post('/settings/update', {f'draft_{key}': enabled for key in ('villagers_move', 'building_hours', 'dynamic_shop')}, content_type='application/json').json()
                self.assertTrue(result['can_apply_immediately'])
                self.assertIn('actions', result['gameState'])
                for key in ('villagers_move', 'building_hours', 'dynamic_shop'):
                    self.assertEqual(result[key], enabled)
                self.assertEqual(result['score_multiplier'], 2 if enabled else 1)
                session = self.game()
                self.assertEqual(session.hero.name, 'Preview Farmer')
                self.assertEqual(session.clock.time, 360)
                self.assertEqual(session.villager_states.count(), Villager.objects.count())
                self.assertEqual(session.villager_states.get(villager__name='Trix').location_state is None, enabled)
                self.client.get('/')

    def test_zero_time_purchase_locks_current_week_settings(self):
        session = self.game()
        shop = Place.objects.get(place_type=SHOP)
        session.location = shop
        session.save()
        session.wallet.money = 1000
        session.wallet.save()
        EventOperator().populate_shop(PopulateShopEvent.objects.get(day='MON'), session, session.place_states.all())
        buy = next(a for a in self.actions() if a.action_type == Action.BUY)
        self.act(buy)
        self.assertEqual(self.game().clock.time, 360)
        result = self.client.post('/settings/update', {'draft_dynamic_shop': True}, content_type='application/json').json()
        self.assertFalse(result['can_apply_immediately'])
        self.assertFalse(result['dynamic_shop'])
        self.assertTrue(result['draft_dynamic_shop'])

    def test_invalid_actions_do_not_lock_settings(self):
        for body in ('{}', 'null', '[]', '{', '{"uniqueDigest":"unavailable"}'):
            response = self.client.post('/action', body, content_type='application/json')
            self.assertEqual(response.status_code, 200)
            self.assertIn('error', response.json())
            self.assertTrue(self.client.get('/settings').json()['can_apply_immediately'])

    def test_invalid_settings_are_rejected_without_partial_changes(self):
        for body in ('[]', 'null', '{', '{"draft_dynamic_shop":"false"}', '{"draft_villagers_move":true,"draft_dynamic_shop":1}', '{"villagers_move":true}', '{"typo":false}'):
            with self.subTest(body=body):
                response = self.client.post('/settings/update', body, content_type='application/json')
                self.assertEqual(response.status_code, 400)
                self.assertFalse(self.client.get('/settings').json()['draft_villagers_move'])

    def test_settings_require_csrf(self):
        browser = Client(enforce_csrf_checks=True)
        browser.get('/')
        self.assertEqual(browser.post('/settings/update', {}, content_type='application/json').status_code, 403)
        token = browser.cookies['csrftoken'].value
        self.assertEqual(browser.post('/settings/update', {'draft_dynamic_shop': True}, content_type='application/json', HTTP_X_CSRFTOKEN=token).status_code, 200)

    def test_every_villager_stays_visible_and_stationary_for_a_week(self):
        session = self.game()
        positions = {v.villager.name: v.location_state_id for v in session.villager_states.all()}
        self.assertTrue(all(positions.values()), positions)
        self.assertIn('Trix', positions)
        operator = EventOperator()
        for day, _ in DAYS_OF_WEEK:
            session.clock.day = day
            session.clock.last_triggered_day = day
            session.clock.last_triggered_time = 0
            session.clock.time = 1439
            operator.trigger_scheduled_events(session.clock, session)
            self.assertEqual(dict(session.villager_states.values_list('villager__name', 'location_state_id')), positions)

    def test_movement_can_be_enabled(self):
        self.configure(villagers_move=True)
        session = self.game()
        event = VillagerAppearsEvent.objects.filter(villager__name='Trix', day='MON', place__isnull=False).order_by('time').first()
        EventOperator().trigger_events([event], session)
        self.assertEqual(session.villager_states.get(villager__name='Trix').location_state.place_id, event.place_id)

    def test_building_hours_off_and_on_at_boundaries(self):
        for hours in (False, True):
            self.configure(building_hours=hours)
            session = self.game()
            for building in Building.objects.exclude(opening_time=None).exclude(closing_time=None):
                for time in (0, building.opening_time - 1, building.opening_time, building.closing_time - 1, building.closing_time, 1439):
                    session.clock.time = time
                    actions = ActionGenerator().gen_enter_actions([building], session.clock, session)
                    self.assertEqual(bool(actions), not hours or building.is_open(time), (building.name, hours, time))

    def test_all_setting_combinations_restock_through_the_week(self):
        for moving, hours, dynamic in product((False, True), repeat=3):
            with self.subTest(moving=moving, hours=hours, dynamic=dynamic):
                self.configure(villagers_move=moving, building_hours=hours, dynamic_shop=dynamic)
                session = self.game()
                for day, _ in DAYS_OF_WEEK:
                    event = PopulateShopEvent.objects.get(day=day)
                    EventOperator().populate_shop(event, session, session.place_states.all())
                    stock = session.get_place_state(event.shop).item_tokens.all()
                    self.assertLessEqual(stock.count(), MAX_ITEMS)
                    self.assertGreater(stock.count(), 0)
                    if not dynamic:
                        self.assertTrue(stock.filter(item__item_type=SEED).exists(), day)
                        self.assertTrue(stock.filter(item__item_type=GIFT).exists(), day)
                        self.assertFalse(stock.exclude(item__item_type__in=[SEED, GIFT]).exists())
                        for gift in stock.filter(item__item_type=GIFT):
                            self.assertTrue(all(v.gift_valence(gift) == LOVE for v in Villager.objects.all()))

    def test_fixed_shop_is_repeatable_and_never_draws_random_eggs(self):
        session = self.game()
        event = PopulateShopEvent.objects.get(day='THU')
        operator = EventOperator()
        with patch.object(operator.mythegg_finder, 'draw_for_shop_populate_mythegg', return_value=None) as draw:
            catalogs = []
            for seed in (1, 20, 300):
                random.seed(seed)
                operator.populate_shop(event, session, session.place_states.all())
                catalogs.append(list(session.get_place_state(event.shop).item_tokens.values_list('item__name', 'quantity')))
            self.assertEqual(catalogs[0], catalogs[1])
            self.assertEqual(catalogs[1], catalogs[2])
            draw.assert_not_called()

    def test_restock_does_not_share_tokens_with_inventory_or_yesterday(self):
        session = self.game()
        item = Item.objects.get(name='Parsnip Seed')
        owned = [ItemToken.objects.create(session=session, item=item, bought_from_store=True) for _ in range(MAX_ITEMS)]
        session.inventory.item_tokens.set(owned)
        event = PopulateShopEvent.objects.get(day='MON')
        operator = EventOperator()
        operator.populate_shop(event, session, session.place_states.all())
        yesterday = set(session.get_place_state(event.shop).item_tokens.values_list('pk', flat=True))
        operator.populate_shop(event, session, session.place_states.all())
        today = set(session.get_place_state(event.shop).item_tokens.values_list('pk', flat=True))
        self.assertTrue(today.isdisjoint(yesterday | {i.pk for i in owned}))
        self.assertEqual(session.inventory.item_tokens.count(), MAX_ITEMS)

    def test_full_inventory_purchase_rolls_back_without_charging(self):
        self.travel(Place.objects.get(place_type=SHOP))
        session = self.game()
        session.wallet.money = 100
        session.wallet.save()
        item = Item.objects.get(name='Parsnip Seed')
        session.inventory.item_tokens.set([ItemToken.objects.create(session=session, item=item) for _ in range(MAX_ITEMS)])
        token_count = session.item_tokens.count()
        buy = next(a for a in self.actions() if a.action_type == Action.BUY)
        response = self.client.post('/action', {'uniqueDigest': buy.unique_digest}, content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.assertIn('error', response.json())
        self.assertEqual(self.game().wallet.money, 100)
        self.assertEqual(self.game().item_tokens.count(), token_count)
        self.assertEqual(self.game().inventory.item_tokens.count(), MAX_ITEMS)

    def test_database_integrity_errors_return_a_readable_response(self):
        action = next(a for a in self.actions() if a.action_type == Action.TRAVEL)
        with patch('mythgarden.views.ActionExecutor.execute', side_effect=IntegrityError('Internal database detail')):
            response = self.client.post('/action', {'uniqueDigest': action.unique_digest}, content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.assertIn('Unable to save', response.json()['error'])
        self.assertNotIn('Internal database detail', response.json()['error'])
        self.assertEqual(self.game().clock.time, 360)
        self.assertFalse(self.game().has_taken_action)

    def test_complete_week_through_http_in_relaxed_and_challenge_modes(self):
        for challenge in (False, True):
            with self.subTest(challenge=challenge):
                # Each route starts as a new player, without speed boosts or
                # knowledge earned by the previous scenario.
                random.seed(20260912)
                self.client = Client()
                self.client.get('/')
                self.session_key = self.client.session['session_key']
                self.configure(villagers_move=challenge, building_hours=challenge, dynamic_shop=challenge, advanced_crops=challenge)
                self.executed.clear()
                hero_id = self.game().hero_id
                farm = Place.objects.get(place_type=FARM)
                forest = Place.objects.get(place_type=FOREST)
                shop = Place.objects.get(place_type=SHOP)
                town = shop.building.surround
                farmhouse = next(p for p in Place.objects.all() if p.is_farmhouse)
                for day_index, (day, _) in enumerate(DAYS_OF_WEEK):
                    self.assertEqual(self.game().clock.day, day)
                    self.assertEqual(self.client.get('/').status_code, 200)
                    self.travel(farm)
                    for action in self.actions():
                        if action.action_type in (Action.WATER, Action.HARVEST):
                            self.act(action)
                    self.travel(forest)
                    # Earn enough through normal play to exercise buying the
                    # authored gifts (40+ fleurs), as well as seeds.
                    for _ in range(3):
                        self.act(next(a for a in self.actions() if a.action_type == Action.GATHER))
                    self.travel(shop)
                    for action in self.actions():
                        if action.action_type == Action.SELL:
                            self.act(action)
                    if day_index < 5:
                        seeds = [a for a in self.actions() if a.action_type == Action.BUY and a.target_item.item_type == SEED and a.cost_amount <= self.game().wallet.money]
                        if seeds:
                            self.act(min(seeds, key=lambda a: a.cost_amount))
                    gifts = [a for a in self.actions() if a.action_type == Action.BUY and a.target_item.item_type == GIFT and a.cost_amount <= self.game().wallet.money]
                    if gifts:
                        self.act(min(gifts, key=lambda a: a.cost_amount))
                    gives = [a for a in self.actions() if a.action_type == Action.GIVE and a.target_item.item_type == GIFT]
                    if gives:
                        self.act(gives[0])
                    talks = [a for a in self.actions() if a.action_type == Action.TALK]
                    if talks:
                        self.act(talks[0])
                    self.travel(farm)
                    for action in self.actions():
                        if action.action_type == Action.PLANT:
                            self.act(action)
                    for action in self.actions():
                        if action.action_type == Action.WATER:
                            self.act(action)
                    while self.game().clock.time < SUNSET:
                        self.travel(town)
                        self.travel(farm)
                    self.travel(farmhouse)
                    self.act(next(a for a in self.actions() if a.action_type == Action.SLEEP))
                session = self.game()
                self.assertEqual(session.clock.day, 'MON')
                self.assertEqual(session.clock.time, 360)
                self.assertFalse(session.has_taken_action)
                self.assertEqual(session.hero_id, hero_id)
                self.assertGreater(session.hero.high_score, 0)
                self.assertEqual(session.wallet.money, 0)
                self.assertEqual(session.inventory.item_tokens.count(), 0)
                self.assertTrue(session.messages.filter(text__contains='You ended the week').exists())
                for action_type in (Action.BUY, Action.SELL, Action.PLANT, Action.WATER, Action.HARVEST, Action.GATHER, Action.TALK, Action.GIVE, Action.SLEEP, Action.TRAVEL):
                    self.assertGreater(self.executed[action_type], 0, action_type)
                self.assertEqual(self.executed[Action.SLEEP], 7)
