from itertools import count
from sqlite3 import IntegrityError
from unittest.mock import MagicMock, patch

from django.test import TestCase
# noinspection PyUnresolvedReferences
from mythgarden.game_logic import ActionGenerator
# noinspection PyUnresolvedReferences
from mythgarden.models import Item, Action, Villager, Place, Bridge, Building, Hero, Clock, Session, ItemToken, \
    VillagerState
# noinspection PyUnresolvedReferences
from mythgarden.models._constants import NORTH, SOUTH, EAST, WEST, GIFT, COMMON, SEED, SPROUT, CROP, TOWN, FARM, \
    MOUNTAIN, FOREST, BEACH, HOME, SHOP


def assertAnyActionsOfType(actions, action_type):
    """Asserts that at least one action in the list of actions is of the given type"""
    for action in actions:
        if action.action_type == action_type:
            return
    raise AssertionError(f"No actions of type {action_type} found in {actions}")


def create_item(name=None, item_type=GIFT, price=1, rarity=COMMON, counter=count()):
    if name is None:
        name = f'Mock Item #{next(counter)}'

    try:
        return Item.objects.create(name=name, item_type=item_type, price=price, rarity=rarity)
    except IntegrityError:
        print(f'Item with name {name} already exists. Oops!')


def create_item_token(item=None, session=None, **kwargs):
    if item is None:
        item = create_item(**kwargs)
    if session is None:
        session = create_session()
    return ItemToken.objects.create(item=item, session=session)


def create_villager(name='Lea', home=None):
    return Villager.objects.create(name=name, home=home)


def create_villager_state(villager=None, session=None, name='Lea'):
    if villager is None:
        villager = create_villager(name=name)
    if session is None:
        session = create_session()

    return VillagerState.objects.create(villager=villager, session=session, location=create_place())


def create_place(name='Nowheresville', place_type=TOWN):
    return Place.objects.get_or_create(name=name, place_type=place_type)[0]


def create_bridge(place_1, place_2, direction_1=WEST, direction_2=EAST):
    return Bridge.objects.create(place_1=place_1, place_2=place_2, direction_1=direction_1, direction_2=direction_2)


def create_building(name, place, place_type):
    return Building.objects.create(name=name, surround=place, place_type=place_type)


def create_hero(name='Stan'):
    return Hero.objects.create(name=name)


def create_session(skip_post_save_signal=True):
    return Session.objects.create(skip_post_save_signal=skip_post_save_signal)


def create_basic_action(cost_amount=60):
    return Action(
        description=f'Talk to someone',
        action_type=Action.TALK,
        cost_amount=cost_amount,
        cost_unit=Action.MIN,
        log_statement=f'You talked to someone.',
    )

class GenAvailableActionsTests(TestCase):
    def setUp(self) -> None:
        self.ag = ActionGenerator()

        self.ag.gen_farming_actions = MagicMock()
        self.farming_actions = ['plant', 'water', 'harvest']
        self.ag.gen_farming_actions.return_value = self.farming_actions

        self.ag.gen_shopping_actions = MagicMock()
        self.shopping_actions = ['buy', 'sell']
        self.ag.gen_shopping_actions.return_value = self.shopping_actions

        self.ag.gen_travel_actions = MagicMock()
        self.travel_actions = ['walk']
        self.ag.gen_travel_actions.return_value = self.travel_actions

        self.ag.gen_social_actions = MagicMock()
        self.social_actions = ['talk', 'give']
        self.ag.gen_social_actions.return_value = self.social_actions

        self.ag.gen_gather_actions = MagicMock()
        self.gather_actions = ['gather']
        self.ag.gen_gather_actions.return_value = self.gather_actions

        self.ag.gen_enter_actions = MagicMock()
        self.enter_actions = ['enter']
        self.ag.gen_enter_actions.return_value = self.enter_actions

        self.ag.gen_exit_action = MagicMock()
        self.exit_action = ['exit']
        self.ag.gen_exit_action.return_value = self.exit_action

        self.ag.gen_sleep_action = MagicMock()
        self.sleep_action = ['sleep']
        self.ag.gen_sleep_action.return_value = self.sleep_action

        self.town = create_place('The Town', TOWN)
        self.farm = create_place('The Farm', FARM)
        self.mountains = create_place('The Mountains', MOUNTAIN)
        self.beach = create_place('The Beach', BEACH)
        self.forest = create_place('The Forest', FOREST)
        self.farmhouse = create_building('The Farmhouse', self.farm, HOME)
        self.inventory = []
        self.contents = []
        self.villagers = []
        self.clock = MagicMock(spec=Clock)

    def gen_actions(self, place):
        return self.ag.gen_available_actions(place, self.inventory, self.contents, self.villagers, self.clock)

    def test_returns_list(self):
        """Returns a list"""
        actions = self.gen_actions(self.town)

        self.assertIsInstance(actions, list)

    def test_calls_gen_farming_actions_when_place_type_is_farm(self):
        """Calls gen_farming_actions when place_type is farm"""
        self.gen_actions(self.farm)

        self.ag.gen_farming_actions.assert_called_once_with(self.contents, self.inventory)

    def test_returns_farming_actions_when_place_type_is_farm(self):
        """Returns farming actions when place_type is farm"""
        actions = self.gen_actions(self.farm)

        for a in self.farming_actions:
            self.assertIn(a, actions)

    def test_does_not_call_gen_farming_actions_when_place_is_not_place_type_farm(self):
        """Does not call gen_farming_actions when place_type is not farm"""
        self.gen_actions(self.town)

        self.ag.gen_farming_actions.assert_not_called()

    def test_calls_gen_shopping_actions_when_place_is_a_shop_building(self):
        """Calls gen_shopping_actions when place is a building with place_type shop"""
        self.shop = create_building('Shop', self.town, SHOP)

        self.gen_actions(self.shop)

        self.ag.gen_shopping_actions.assert_called_once_with(self.contents, self.inventory)

    def test_returns_shopping_actions_when_place_is_a_shop_building(self):
        """Returns shopping actions when place has a shop landmark"""
        self.shop = create_building('Shop', self.town, SHOP)

        actions = self.gen_actions(self.shop)

        for a in self.shopping_actions:
            self.assertIn(a, actions)

    def test_does_not_call_gen_shopping_actions_when_place_is_not_a_building(self):
        """Does not call gen_shopping_actions when place is not a building"""
        self.gen_actions(self.farm)

        self.ag.gen_shopping_actions.assert_not_called()

    def test_does_not_call_gen_shopping_actions_when_place_is_a_building_but_not_shop(self):
        """Does not call gen_shopping_actions when place is a building but not a shop"""
        self.neighbor_house = create_building('Neighbor House', self.town, HOME)

        self.gen_actions(self.neighbor_house)

        self.ag.gen_shopping_actions.assert_not_called()

    def test_calls_gen_travel_actions_when_place_is_place_1_of_a_saved_bridge(self):
        """Calls gen_travel_actions when place is place_1 of a bridge"""
        bridges = [create_bridge(self.town, self.forest)]

        self.gen_actions(self.town)

        self.ag.gen_travel_actions.assert_called_once_with(self.town, bridges)

    def test_returns_travel_actions_when_place_is_place_1_of_a_saved_bridge(self):
        """Returns travel actions when place is place_1 of a bridge"""
        create_bridge(self.town, self.forest)

        actions = self.gen_actions(self.town)

        for a in self.travel_actions:
            self.assertIn(a, actions)

    def test_calls_gen_travel_actions_when_place_is_place_2_of_a_saved_bridge(self):
        """Calls gen_travel_actions when place is place_2 of a bridge"""
        bridges = [create_bridge(self.forest, self.town)]

        self.gen_actions(self.town)

        self.ag.gen_travel_actions.assert_called_once_with(self.town, bridges)

    def test_calls_gen_travel_actions_when_place_is_part_of_multiple_bridges(self):
        """Calls gen_travel_actions when place is part of multiple bridges"""
        bridges = [
            create_bridge(self.town, self.forest),
            create_bridge(self.mountains, self.town)
        ]

        self.gen_actions(self.town)

        self.ag.gen_travel_actions.assert_called_once_with(self.town, bridges)

    def test_does_not_call_gen_travel_actions_when_place_is_not_in_a_saved_bridge(self):
        """Does not call gen_travel_actions when place is not a bridge"""
        create_bridge(self.forest, self.mountains)

        self.gen_actions(self.town)

        self.ag.gen_travel_actions.assert_not_called()

    def test_calls_gen_social_actions_when_villagers_are_present(self):
        """Calls gen_social_actions when villagers are present"""
        self.villagers = [create_villager()]

        self.gen_actions(self.town)

        self.ag.gen_social_actions.assert_called_once_with(self.villagers, self.inventory)

    def test_returns_social_actions_when_villagers_are_present(self):
        """Returns social actions when villagers are present"""
        self.villagers = [create_villager()]

        actions = self.gen_actions(self.town)

        for a in self.social_actions:
            self.assertIn(a, actions)

    def test_does_not_call_gen_social_actions_when_no_villagers_are_present(self):
        """Does not call gen_social_actions when no villagers are present"""
        self.gen_actions(self.town)

        self.ag.gen_social_actions.assert_not_called()

    def test_calls_gen_gather_actions_when_place_is_a_wild_type(self):
        """Calls gen_gather_actions when place is a wild type (in WILD_TYPES)"""

        for place in [self.beach, self.forest, self.mountains]:
            with self.subTest(place=place):
                self.ag.gen_gather_actions = MagicMock()  # reset mock in each subtest
                self.gen_actions(place)
                self.ag.gen_gather_actions.assert_called_once_with(place)

    def test_returns_gather_actions_when_place_is_a_wild_type(self):
        """Returns gather actions when place is a wild type (in WILD_TYPES)"""
        for place in [self.beach, self.forest, self.mountains]:
            with self.subTest(place=place):
                actions = self.gen_actions(place)
                for a in self.gather_actions:
                    self.assertIn(a, actions)

    def test_does_not_call_gen_gather_actions_when_place_is_not_a_wild_type(self):
        """Does not call gen_gather_actions when place is not a wild type (not in WILD_TYPES)"""
        self.gen_actions(self.town)
        self.ag.gen_gather_actions.assert_not_called()

    def test_calls_gen_enter_actions_when_place_has_buildings(self):
        """Calls gen_enter_actions when place has buildings"""
        pub_building = create_building('the pub', self.town, SHOP)

        self.gen_actions(self.town)
        self.ag.gen_enter_actions.assert_called_once_with([pub_building], self.clock, None)

    def test_returns_enter_actions_when_place_has_buildings(self):
        """Returns enter actions when place has buildings"""
        create_building('the pub', self.town, SHOP)

        actions = self.gen_actions(self.town)
        for a in self.enter_actions:
            self.assertIn(a, actions)

    def test_does_not_call_gen_enter_actions_when_place_has_no_buildings(self):
        """Does not call gen_enter_actions when place has no buildings"""
        self.gen_actions(self.town)
        self.ag.gen_enter_actions.assert_not_called()

    def test_calls_gen_exit_action_when_place_is_a_building(self):
        """Calls gen_exit_action when place is a building"""
        pub_building = create_building('the pub', self.town, SHOP)

        self.gen_actions(pub_building)
        self.ag.gen_exit_action.assert_called_once_with(pub_building)

    def test_returns_exit_action_when_place_is_a_building(self):
        """Returns exit action when place is a building"""
        pub_building = create_building('the pub', self.town, SHOP)

        actions = self.gen_actions(pub_building)
        self.assertIn(self.exit_action, actions)

    def test_does_not_call_gen_exit_action_when_place_is_not_a_building(self):
        """Does not call gen_exit_action when place is not a building"""
        self.gen_actions(self.farm)
        self.ag.gen_exit_action.assert_not_called()

    def test_calls_gen_sleep_action_when_place_is_the_farmhouse(self):
        """Calls gen_sleep_action when place is the farmhouse"""
        self.gen_actions(self.farmhouse)
        self.ag.gen_sleep_action.assert_called_once_with(self.clock)

    def test_returns_sleep_action_when_place_is_the_farmhouse(self):
        """Returns sleep action when place is the farmhouse"""
        actions = self.gen_actions(self.farmhouse)
        self.assertIn(self.sleep_action, actions)

    def test_does_not_call_gen_sleep_action_when_place_is_not_on_the_farm(self):
        """Does not call gen_sleep_action when place is not on the farm"""
        pub_building = create_building('the pub', self.town, SHOP)

        self.gen_actions(pub_building)
        self.ag.gen_sleep_action.assert_not_called()

    def test_does_not_call_gen_sleep_action_when_place_is_not_a_building(self):
        """Does not call gen_sleep_action when place is not a building"""
        self.gen_actions(self.farm)
        self.ag.gen_sleep_action.assert_not_called()

    def test_returns_multiple_types_of_actions_when_multiple_types_are_available(self):
        """Returns multiple types of actions when multiple types are available"""
        create_bridge(self.farm, self.forest)
        self.villagers = [create_villager()]

        actions = self.gen_actions(self.farm)

        for lst in [self.farming_actions, self.travel_actions, self.social_actions]:
            for a in lst:
                self.assertIn(a, actions)


class GenFarmingActionsTests(TestCase):
    def setUp(self) -> None:
        self.ag = ActionGenerator()
        self.field_contents = []
        self.inventory = []

    def test_returns_a_list(self):
        """
        Returns a list
        """
        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)

        self.assertIsInstance(actions, list)

    def test_returns_empty_list_when_field_and_inventory_are_empty(self):
        """
        Returns an empty list when field and inventory are empty
        """
        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)

        self.assertEqual(actions, [])

    def test_returns_plant_actions_when_inventory_has_seeds(self):
        """
        Returns plant actions when inventory has seeds
        """
        self.inventory = [
            create_item_token(name='Parsnip', item_type=SEED),
            create_item_token(name='Strawberry', item_type=SEED),
        ]
        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)

        for i in range(len(actions)):
            self.assertEqual(actions[i].action_type, Action.PLANT)

    def test_returns_plant_actions_with_correct_description(self):
        """
        Returns a list with plant actions with the correct description
        """
        self.inventory = [create_item_token(name='Parsnip', item_type=SEED)]
        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)

        plant_action = [a for a in actions if a.action_type == Action.PLANT][0]

        self.assertEqual(plant_action.description, 'Plant Parsnip')

    def test_returns_plant_actions_with_correct_log_statement(self):
        """
        Returns a list with plant actions with the correct log_statement
        """
        self.inventory = [create_item_token(name='Parsnip', item_type=SEED)]

        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)
        plant_action = [a for a in actions if a.action_type == Action.PLANT][0]

        self.assertEqual(plant_action.log_statement, 'You planted some Parsnip in the field.')

    def test_returns_plant_actions_with_correct_target_object(self):
        """
        Returns a list with plant actions with the correct item as target_object
        """
        self.inventory = [create_item_token(name='Parsnip', item_type=SEED)]

        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)
        plant_action = [a for a in actions if a.action_type == Action.PLANT][0]

        self.assertEqual(plant_action.target_object, self.inventory[0])

    def test_returns_plant_actions_with_correct_cost_amount(self):
        """
        Returns a list with plant actions with the correct cost_amount
        """
        self.inventory = [create_item_token(name='Parsnip', item_type=SEED)]
        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)

        plant_action = [a for a in actions if a.action_type == Action.PLANT][0]

        self.assertEqual(plant_action.cost_amount, 15)

    def test_returns_plant_actions_with_correct_cost_unit(self):
        """
        Returns a list with plant actions with the correct cost_unit
        """
        self.inventory = [create_item_token(name='Parsnip', item_type=SEED)]
        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)

        plant_action = [a for a in actions if a.action_type == Action.PLANT][0]

        self.assertEqual(plant_action.cost_unit, Action.MIN)

    def test_returns_water_actions_when_field_has_sprouts(self):
        """
        Returns water actions when field has sprouts
        """
        self.field_contents = [
            create_item_token(name='Parsnip', item_type=SPROUT),
            create_item_token(name='Strawberry', item_type=SPROUT),
        ]
        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)

        for i in range(len(actions)):
            self.assertEqual(actions[i].action_type, Action.WATER)

    def test_returns_water_actions_with_correct_description(self):
        """
        Returns a list with water actions with the correct description
        """
        self.field_contents = [create_item_token(name='Parsnip', item_type=SPROUT)]
        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)

        water_action = [a for a in actions if a.action_type == Action.WATER][0]

        self.assertEqual(water_action.description, 'Water Parsnip')

    def test_returns_water_actions_with_correct_log_statement(self):
        """
        Returns a list with water actions with the correct log_statement
        """
        self.field_contents = [create_item_token(name='Parsnip', item_type=SPROUT)]
        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)

        water_action = [a for a in actions if a.action_type == Action.WATER][0]

        self.assertEqual(water_action.log_statement, 'You watered the Parsnip.')

    def test_returns_water_actions_with_correct_target_object(self):
        """
        Returns a list with water actions with the correct item as target_object
        """
        self.field_contents = [create_item_token(name='Parsnip', item_type=SPROUT)]
        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)

        water_action = [a for a in actions if a.action_type == Action.WATER][0]

        self.assertEqual(water_action.target_object, self.field_contents[0])

    def test_returns_water_actions_with_correct_cost_amount(self):
        """
        Returns a list with water actions with the correct cost_amount
        """
        self.field_contents = [create_item_token(name='Parsnip', item_type=SPROUT)]
        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)

        water_action = [a for a in actions if a.action_type == Action.WATER][0]

        self.assertEqual(water_action.cost_amount, 30)

    def test_returns_water_actions_with_correct_cost_unit(self):
        """
        Returns a list with water actions with the correct cost_unit
        """
        self.field_contents = [create_item_token(name='Parsnip', item_type=SPROUT)]
        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)

        water_action = [a for a in actions if a.action_type == Action.WATER][0]

        self.assertEqual(water_action.cost_unit, Action.MIN)

    def test_returns_harvest_actions_when_field_has_crops(self):
        """
        Returns harvest actions when field has crops
        """
        self.field_contents = [
            create_item_token(name='Parsnip', item_type=CROP),
            create_item_token(name='Strawberry', item_type=CROP),
        ]
        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)

        for i in range(len(actions)):
            self.assertEqual(actions[i].action_type, Action.HARVEST)

    def test_returns_harvest_actions_with_correct_description(self):
        """
        Returns a list with harvest actions with the correct description
        """
        self.field_contents = [create_item_token(name='Parsnip', item_type=CROP)]
        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)

        harvest_action = [a for a in actions if a.action_type == Action.HARVEST][0]

        self.assertEqual(harvest_action.description, 'Harvest Parsnip')

    def test_returns_harvest_actions_with_correct_log_statement(self):
        """
        Returns a list with harvest actions with the correct log_statement
        """
        self.field_contents = [create_item_token(name='Parsnip', item_type=CROP)]
        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)

        harvest_action = [a for a in actions if a.action_type == Action.HARVEST][0]

        self.assertEqual(harvest_action.log_statement, 'You harvested the Parsnip.')

    def test_returns_harvest_actions_with_correct_target_object(self):
        """
        Returns a list with harvest actions with the correct item as target_object
        """
        self.field_contents = [create_item_token(name='Parsnip', item_type=CROP)]
        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)

        harvest_action = [a for a in actions if a.action_type == Action.HARVEST][0]

        self.assertEqual(harvest_action.target_object, self.field_contents[0])

    def test_returns_harvest_actions_with_correct_cost_amount(self):
        """
        Returns a list with harvest actions with the correct cost_amount
        """
        self.field_contents = [create_item_token(name='Parsnip', item_type=CROP)]
        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)

        harvest_action = [a for a in actions if a.action_type == Action.HARVEST][0]

        self.assertEqual(harvest_action.cost_amount, 15)

    def test_returns_harvest_actions_with_correct_cost_unit(self):
        """
        Returns a list with harvest actions with the correct cost_unit
        """
        self.field_contents = [create_item_token(name='Parsnip', item_type=CROP)]
        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)

        harvest_action = [a for a in actions if a.action_type == Action.HARVEST][0]

        self.assertEqual(harvest_action.cost_unit, Action.MIN)

    def test_returns_plant_and_water_actions_when_there_are_seeds_and_sprouts(self):
        """
        Returns plant and water actions when there are seeds and sprouts
        """
        self.field_contents = [
            create_item_token(name='Parsnip Sprout', item_type=SPROUT),
            create_item_token(name='Strawberry Sprout', item_type=SPROUT),
        ]
        self.inventory = [
            create_item_token(name='Parsnip Seed', item_type=SEED),
            create_item_token(name='Strawberry Seed', item_type=SEED),
        ]
        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)

        assertAnyActionsOfType(actions, Action.PLANT)
        assertAnyActionsOfType(actions, Action.WATER)

        for i in range(len(actions)):
            self.assertIn(actions[i].action_type, [Action.PLANT, Action.WATER])

    def test_returns_water_and_harvest_actions_when_there_are_sprouts_and_crops(self):
        """
        Returns water and harvest actions when there are sprouts and crops
        """
        self.field_contents = [
            create_item_token(name='Parsnip', item_type=SPROUT),
            create_item_token(name='Strawberry', item_type=CROP),
        ]
        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)

        assertAnyActionsOfType(actions, Action.WATER)
        assertAnyActionsOfType(actions, Action.HARVEST)

        for i in range(len(actions)):
            self.assertIn(actions[i].action_type, [Action.WATER, Action.HARVEST])

    def test_returns_plant_and_harvest_actions_when_there_are_seeds_and_crops(self):
        """
        Returns plant and harvest actions when there are seeds and crops
        """
        self.field_contents = [
            create_item_token(name='Parsnip Crop', item_type=CROP),
            create_item_token(name='Strawberry Crop', item_type=CROP),
        ]
        self.inventory = [
            create_item_token(name='Parsnip Seed', item_type=SEED),
            create_item_token(name='Strawberry Seed', item_type=SEED),
        ]
        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)

        plant_actions = [a for a in actions if a.action_type == Action.PLANT]
        harvest_actions = [a for a in actions if a.action_type == Action.HARVEST]

        self.assertEqual(len(plant_actions), 2)
        self.assertEqual(len(harvest_actions), 2)

    def test_returns_plant_and_water_and_harvest_actions_when_there_are_seeds_sprouts_and_crops(self):
        """
        Returns plant, water and harvest actions when there are seeds, sprouts and crops
        """
        self.field_contents = [
            create_item_token(name='Parsnip Sprout', item_type=SPROUT),
            create_item_token(name='Strawberry Crop', item_type=CROP),
        ]
        self.inventory = [
            create_item_token(name='Parsnip Seed', item_type=SEED),
            create_item_token(name='Strawberry Seed', item_type=SEED),
        ]
        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)

        assertAnyActionsOfType(actions, Action.PLANT)
        assertAnyActionsOfType(actions, Action.WATER)
        assertAnyActionsOfType(actions, Action.HARVEST)

        for i in range(len(actions)):
            self.assertIn(actions[i].action_type, [Action.PLANT, Action.WATER, Action.HARVEST])

    def test_does_not_return_plant_actions_when_seeds_are_only_in_field_contents(self):
        """
        Does not return plant actions when seeds are only in field_contents and not in the inventory
        """
        self.field_contents = [
            create_item_token(name='Parsnip', item_type=SEED),
            create_item_token(name='Strawberry', item_type=SEED),
        ]
        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)

        plant_actions = [a for a in actions if a.action_type == Action.PLANT]

        self.assertEqual(len(plant_actions), 0)

    def test_does_not_return_water_actions_when_sprouts_are_only_in_inventory(self):
        """
        Does not return water actions when sprouts are only in inventory and not in the field contents
        """
        self.inventory = [
            create_item_token(name='Parsnip', item_type=SPROUT),
            create_item_token(name='Strawberry', item_type=SPROUT),
        ]
        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)

        water_actions = [a for a in actions if a.action_type == Action.WATER]

        self.assertEqual(len(water_actions), 0)

    def test_does_not_return_harvest_actions_when_crops_are_only_in_inventory(self):
        """
        Does not return harvest actions when crops are only in inventory and not in the field contents
        """
        self.inventory = [
            create_item_token(name='Parsnip', item_type=CROP),
            create_item_token(name='Strawberry', item_type=CROP),
        ]
        actions = self.ag.gen_farming_actions(self.field_contents, self.inventory)

        harvest_actions = [a for a in actions if a.action_type == Action.HARVEST]

        self.assertEqual(len(harvest_actions), 0)

    def test_throws_error_if_passed_non_items_in_field_contents(self):
        """
        Throws error if passed non-items in field_contents
        """
        self.field_contents = [
            create_item_token(name='Parsnip', item_type=SPROUT),
            'Strawberry',
        ]

        with self.assertRaises(TypeError):
            self.ag.gen_farming_actions(self.field_contents, self.inventory)

    def test_throws_error_if_passed_non_items_in_inventory(self):
        """
        Throws error if passed non-items in inventory
        """
        self.inventory = [
            create_item_token(name='Parsnip', item_type=SPROUT),
            'Strawberry',
        ]

        with self.assertRaises(TypeError):
            self.ag.gen_farming_actions(self.field_contents, self.inventory)


class GenShoppingActionsTests(TestCase):
    def setUp(self) -> None:
        self.ag = ActionGenerator()
        self.shop_contents = []
        self.inventory = []

    def test_returns_list(self):
        """
        Returns a list
        """
        actions = self.ag.gen_shopping_actions(self.shop_contents, self.inventory)

        self.assertIsInstance(actions, list)

    def test_returns_empty_list_if_no_shop_contents_and_no_inventory(self):
        """
        Returns an empty list if there are no contents and no inventory
        """
        actions = self.ag.gen_shopping_actions(self.shop_contents, self.inventory)

        self.assertEqual(actions, [])

    def test_returns_buy_actions_if_shop_contents_and_no_inventory(self):
        """
        Returns a list with only buy actions if there are shop_contents but no inventory
        """
        self.shop_contents = [create_item_token() for _ in range(3)]
        actions = self.ag.gen_shopping_actions(self.shop_contents, self.inventory)

        for i in range(len(actions)):
            self.assertEqual(actions[i].action_type, Action.BUY)

    def test_returns_sell_actions_if_inventory_and_no_shop_contents(self):
        """
        Returns a list with only sell actions if there is inventory but no shop_contents
        """
        self.inventory = [create_item_token() for _ in range(3)]
        actions = self.ag.gen_shopping_actions(self.shop_contents, self.inventory)

        for i in range(len(actions)):
            self.assertEqual(actions[i].action_type, Action.SELL)

    def test_returns_buy_and_sell_actions_if_shop_contents_and_inventory(self):
        """
        Returns a list with both buy and sell actions if there are shop_contents and inventory
        """
        self.shop_contents = [create_item_token() for _ in range(2)]
        self.inventory = [create_item_token() for _ in range(2)]
        actions = self.ag.gen_shopping_actions(self.shop_contents, self.inventory)

        assertAnyActionsOfType(actions, Action.BUY)
        assertAnyActionsOfType(actions, Action.SELL)

        for i in range(len(actions)):
            self.assertIn(actions[i].action_type, [Action.BUY, Action.SELL])

    def test_returns_buy_actions_with_correct_description(self):
        """
        Returns a list with buy actions with the correct description
        """
        self.shop_contents = [create_item_token(name='Rock')]
        actions = self.ag.gen_shopping_actions(self.shop_contents, self.inventory)

        self.assertEqual(actions[0].description, 'Buy Rock')

    def test_returns_buy_actions_with_correct_log_statement(self):
        """
        Returns a list with buy actions with the correct log_statement
        """
        self.shop_contents = [create_item_token(name='Rock', price=5)]
        actions = self.ag.gen_shopping_actions(self.shop_contents, self.inventory)

        self.assertEqual(actions[0].log_statement, 'You bought Rock for 5 koin.')

    def test_returns_buy_actions_with_correct_target_object(self):
        """
        Returns a list with buy actions with the correct target_object
        """
        self.shop_contents = [create_item_token()]
        actions = self.ag.gen_shopping_actions(self.shop_contents, self.inventory)

        self.assertEqual(actions[0].target_object, self.shop_contents[0])

    def test_returns_buy_actions_with_correct_price(self):
        """
        Returns a list with buy actions with the correct cost_amount
        """
        self.shop_contents = [create_item_token(price=5)]
        actions = self.ag.gen_shopping_actions(self.shop_contents, self.inventory)

        self.assertEqual(actions[0].cost_amount, 5)

    def test_returns_buy_actions_with_correct_cost_unit(self):
        """
        Returns a list with buy actions with the correct cost_unit
        """
        self.inventory = [create_item_token()]
        actions = self.ag.gen_shopping_actions(self.shop_contents, self.inventory)

        self.assertEqual(actions[0].cost_unit, Action.KOIN)

    def test_returns_sell_actions_with_correct_description(self):
        """
        Returns a list with sell actions with the correct description
        """
        self.inventory = [create_item_token(name='Rock')]
        actions = self.ag.gen_shopping_actions(self.shop_contents, self.inventory)

        self.assertEqual(actions[0].description, 'Sell Rock')

    def test_returns_sell_actions_with_correct_log_statement(self):
        """
        Returns a list with sell actions with the correct log_statement
        """
        self.inventory = [create_item_token(name='Rock', price=5)]
        actions = self.ag.gen_shopping_actions(self.shop_contents, self.inventory)

        self.assertEqual(actions[0].log_statement, 'You sold Rock for 5 koin.')

    def test_returns_sell_actions_with_correct_target_object(self):
        """
        Returns a list with sell actions with the correct target_object
        """
        self.inventory = [create_item_token()]
        actions = self.ag.gen_shopping_actions(self.shop_contents, self.inventory)

        self.assertEqual(actions[0].target_object, self.inventory[0])

    def test_returns_sell_actions_with_correct_price(self):
        """
        Returns a list with sell actions with the correct cost_amount,
        which is negative the item's price
        """
        self.inventory = [create_item_token(price=5)]
        actions = self.ag.gen_shopping_actions(self.shop_contents, self.inventory)

        self.assertEqual(actions[0].cost_amount, 5)

    def test_returns_sell_actions_with_correct_cost_unit(self):
        """
        Returns a list with sell actions with the correct cost_unit
        """
        self.inventory = [create_item_token()]
        actions = self.ag.gen_shopping_actions(self.shop_contents, self.inventory)

        self.assertEqual(actions[0].cost_unit, Action.KOIN)

    def test_throws_an_error_if_passed_shop_contents_with_non_items(self):
        """
        Throws an error if passed a shop_contents with non-Item objects
        """
        self.shop_contents = [create_item_token(), 'Rock']
        self.inventory = [create_item_token()]

        with self.assertRaises(TypeError):
            self.ag.gen_shopping_actions(self.shop_contents, self.inventory)

    def test_throws_an_error_if_passed_inventory_with_non_items(self):
        """
        Throws an error if passed an inventory with non-Item objects
        """
        self.shop_contents = [create_item_token()]
        self.inventory = [create_item_token(), 'Rock']

        with self.assertRaises(TypeError):
            self.ag.gen_shopping_actions(self.shop_contents, self.inventory)


class GenGatherActionsTests(TestCase):
    def setUp(self):
        self.ag = ActionGenerator()
        self.mountains = create_place('Mountains', MOUNTAIN)
        self.forest = create_place('Forest', FOREST)
        self.beach = create_place('Beach', BEACH)

    def test_returns_list(self):
        """
        Returns a list
        """
        actions = self.ag.gen_gather_actions(self.mountains)

        self.assertIsInstance(actions, list)

    def test_returns_action_of_gather_type_for_mountains(self):
        """
        Returns an action of gather type for mountains
        """
        actions = self.ag.gen_gather_actions(self.mountains)

        self.assertEqual(actions[0].action_type, Action.GATHER)

    @patch('mythgarden.game_logic.ActionGenerator.gen_mining_action')
    def test_calls_gen_mining_action_for_mountains(self, mock_gen_mining_action):
        """
        Calls gen_mining_action for mountains
        """
        self.ag.gen_gather_actions(self.mountains)

        mock_gen_mining_action.assert_called()

    def test_returns_action_with_correct_description_for_mountains(self):
        """
        Returns an action with the correct description for mountains
        """
        actions = self.ag.gen_gather_actions(self.mountains)

        self.assertEqual(actions[0].description, 'Dig for something interesting')

    def test_returns_action_with_correct_log_statement_for_mountains(self):
        """
        Returns an action with the correct log statement for mountains
        """
        actions = self.ag.gen_gather_actions(self.mountains)

        self.assertEqual(actions[0].log_statement, 'You dug up a {result}!')

    def test_returns_action_of_gather_type_for_forest(self):
        """
        Returns an action of gather type for forest
        """
        actions = self.ag.gen_gather_actions(self.forest)

        self.assertEqual(actions[0].action_type, Action.GATHER)

    @patch('mythgarden.game_logic.ActionGenerator.gen_foraging_action')
    def test_calls_gen_foraging_action_for_forest(self, mock_gen_foraging_action):
        """
        Calls gen_foraging_action for forest
        """
        self.ag.gen_gather_actions(self.forest)

        mock_gen_foraging_action.assert_called()

    def test_returns_action_with_correct_description_for_forest(self):
        """
        Returns an action with the correct description for forest
        """
        actions = self.ag.gen_gather_actions(self.forest)

        self.assertEqual(actions[0].description, 'Forage for plants')

    def test_returns_action_with_correct_log_statement_for_forest(self):
        """
        Returns an action with the correct log statement for forest
        """
        actions = self.ag.gen_gather_actions(self.forest)

        self.assertEqual(actions[0].log_statement, 'You found {result}!')

    def test_returns_action_of_gather_type_for_beach(self):
        """
        Returns an action of gather type for beach
        """
        actions = self.ag.gen_gather_actions(self.beach)

        self.assertEqual(actions[0].action_type, Action.GATHER)

    @patch('mythgarden.game_logic.ActionGenerator.gen_fishing_action')
    def test_calls_gen_fishing_action_for_beach(self, mock_gen_fishing_action):
        """
        Calls gen_fishing_action for beach
        """
        self.ag.gen_gather_actions(self.beach)

        mock_gen_fishing_action.assert_called()

    def test_returns_action_with_correct_description_for_beach(self):
        """
        Returns an action with the correct description for beach
        """
        actions = self.ag.gen_gather_actions(self.beach)

        self.assertEqual(actions[0].description, 'Go fishing')

    def test_returns_action_with_correct_log_statement_for_beach(self):
        """
        Returns an action with the correct log statement for beach
        """
        actions = self.ag.gen_gather_actions(self.beach)

        self.assertEqual(actions[0].log_statement, 'You caught a {result}!')


class GenEnterActionsTests(TestCase):
    def setUp(self):
        self.ag = ActionGenerator()
        self.clock = MagicMock(spec=Clock)
        self.clock.time = 600  # 10:00 AM - buildings should be open

        self.beach = create_place(name='The Beach')

        self.farm = create_place(name='The Farm')
        self.farmhouse = create_building(name='The Farmhouse', place=self.farm, place_type=HOME)
        self.farm_buildings = [self.farmhouse]

        self.town = create_place(name='The Town')
        self.store = create_building(name='The Store', place=self.town, place_type=SHOP)
        self.neighbor_house = create_building(name='Neighbor House', place=self.town, place_type=HOME)
        self.town_buildings = [self.store, self.neighbor_house]

    def test_returns_list(self):
        """
        Returns a list
        """
        actions = self.ag.gen_enter_actions(self.town_buildings, self.clock)

        self.assertIsInstance(actions, list)

    def test_throws_an_error_if_passed_a_non_building(self):
        """
        Throws an error if passed non-buildings
        """
        with self.assertRaises(TypeError):
            self.ag.gen_enter_actions(self.farm, self.clock)

    def test_throws_an_error_if_passed_non_buildings(self):
        """
        Throws an error if passed non-buildings
        """
        with self.assertRaises(TypeError):
            self.ag.gen_enter_actions([self.town, self.farm], self.clock)

    def test_returns_empty_list_if_no_buildings(self):
        """
        Returns an empty list if no buildings
        """
        actions = self.ag.gen_enter_actions([], self.clock)

        self.assertEqual(actions, [])

    def test_returns_one_enter_action_for_each_building(self):
        """
        Returns one enter action for each building
        """
        actions = self.ag.gen_enter_actions(self.town_buildings, self.clock)

        enter_actions = [a for a in actions if a.description.startswith('Enter')]

        self.assertEqual(len(enter_actions), 2)

    def test_returns_enter_actions_with_travel_type(self):
        """
        Returns an action with travel type (since entering a building is executed like a travel action)
        """
        actions = self.ag.gen_enter_actions(self.town_buildings, self.clock)

        self.assertEqual(actions[0].action_type, Action.TRAVEL)

    def test_returns_action_with_correct_description(self):
        """
        Returns an action with the correct description
        """
        actions = self.ag.gen_enter_actions(self.farm_buildings, self.clock)

        self.assertEqual(actions[0].description, 'Enter The Farmhouse')

    def test_returns_action_with_correct_log_statement(self):
        """
        Returns an action with the correct log statement
        """
        actions = self.ag.gen_enter_actions(self.farm_buildings, self.clock)

        self.assertEqual(actions[0].log_statement, 'You entered The Farmhouse.')

    def test_returns_action_with_correct_target(self):
        """
        Returns an action with the correct target
        """
        actions = self.ag.gen_enter_actions(self.farm_buildings, self.clock)

        self.assertEqual(actions[0].target_object, self.farmhouse)

    def test_returns_action_with_correct_cost_amount(self):
        """
        Returns an action with the correct cost amount
        """
        actions = self.ag.gen_enter_actions(self.farm_buildings, self.clock)

        self.assertEqual(actions[0].cost_amount, 5)


class GenExitActionTests(TestCase):
    # there's only ever one exit action, so there's no gen_exit_actions method
    def setUp(self):
        self.ag = ActionGenerator()

        self.farm = create_place(name='The Farm')
        self.farmhouse = create_building(name='The Farmhouse', place=self.farm, place_type=HOME)

    def test_returns_action(self):
        """
        Returns an action
        """
        action = self.ag.gen_exit_action(self.farmhouse)

        self.assertIsInstance(action, Action)

    def test_throws_error_if_passed_non_building(self):
        """
        Throws an error if passed non-building
        """
        with self.assertRaises(AttributeError):
            self.ag.gen_exit_action(self.farm)

    def test_throws_error_if_passed_place_object_of_a_building(self):
        """
        Throws an error if passed non-building
        """
        farmhouse_place = self.farmhouse.place_ptr
        print(farmhouse_place)

        with self.assertRaises(AttributeError):
            self.ag.gen_exit_action(farmhouse_place)

    def test_returns_a_travel_type_action(self):
        """
        Returns an action with the correct description
        """
        action = self.ag.gen_exit_action(self.farmhouse)

        self.assertEqual(action.action_type, Action.TRAVEL)

    def test_returns_action_with_correct_description(self):
        """
        Returns an action with the correct description
        """
        action = self.ag.gen_exit_action(self.farmhouse)

        self.assertEqual(action.description, 'Exit The Farmhouse')

    def test_returns_action_with_correct_log_statement(self):
        """
        Returns an action with the correct log statement
        """
        action = self.ag.gen_exit_action(self.farmhouse)

        self.assertEqual(action.log_statement, 'You exited The Farmhouse back out to The Farm.')

    def test_returns_action_with_correct_target(self):
        """
        Returns an action with the correct target
        """
        action = self.ag.gen_exit_action(self.farmhouse)

        self.assertEqual(action.target_object, self.farm)

    def test_returns_action_with_correct_cost_amount(self):
        """
        Returns an action with the correct cost amount
        """
        action = self.ag.gen_exit_action(self.farmhouse)

        self.assertEqual(action.cost_amount, 5)


class GenTravelActionsTests(TestCase):
    def setUp(self):
        self.ag = ActionGenerator()
        self.farm = create_place(name='The Farm')
        self.store = create_place(name='The Store')
        self.beach = create_place(name='The Beach')
        self.bridges = []

    def test_returns_list(self):
        """
        Returns a list
        """
        actions = self.ag.gen_travel_actions(self.farm, self.bridges)

        self.assertIsInstance(actions, list)

    def test_returns_empty_list_if_no_bridges(self):
        """
        Returns an empty list if there are no bridges
        """
        actions = self.ag.gen_travel_actions(self.farm, self.bridges)

        self.assertEqual(actions, [])

    def test_throws_an_error_if_place_is_missing(self):
        """
        Throws an error if place is missing
        """
        self.bridges = [create_bridge(self.farm, self.store)]

        with self.assertRaises(TypeError):
            self.ag.gen_travel_actions(None, self.bridges)

    def test_throws_an_error_if_bridges_has_non_bridges(self):
        """
        Throws an error if bridges has non-bridges
        """
        self.bridges = [create_bridge(self.farm, self.store), 'Bridge to The Beach']

        with self.assertRaises(TypeError):
            self.ag.gen_travel_actions(self.farm, self.bridges)

    def test_returns_one_travel_action_for_each_bridge(self):
        """
        Returns a travel action for each bridge
        """
        self.bridges = [
            create_bridge(self.farm, self.store),
            create_bridge(self.farm, self.beach, NORTH, SOUTH),
        ]
        actions = self.ag.gen_travel_actions(self.farm, self.bridges)

        travel_actions = [a for a in actions if a.action_type == Action.TRAVEL]

        self.assertEqual(len(travel_actions), 2)

    def test_returns_travel_actions_with_correct_description(self):
        """
        Returns travel actions with the correct description
        """
        self.bridges = [create_bridge(self.farm, self.store, WEST, EAST)]
        actions = self.ag.gen_travel_actions(self.farm, self.bridges)

        self.assertEqual(actions[0].description, 'Walk East')

    def test_returns_travel_actions_with_correct_log_statement(self):
        """
        Returns travel actions with the correct log statement
        """
        self.bridges = [create_bridge(self.farm, self.store, WEST, EAST)]
        actions = self.ag.gen_travel_actions(self.farm, self.bridges)

        self.assertEqual(actions[0].log_statement, 'You travelled East to The Store.')

    def test_returns_travel_actions_with_correct_direction(self):
        """
        Returns travel actions with the correct direction
        """
        self.bridges = [create_bridge(self.farm, self.store, WEST, EAST)]
        actions = self.ag.gen_travel_actions(self.farm, self.bridges)

        self.assertEqual(actions[0].direction, EAST)

    def test_returns_travel_actions_with_correct_destination(self):
        """
        Returns travel actions with the correct destination
        """
        self.bridges = [create_bridge(self.farm, self.store, WEST, EAST)]
        actions = self.ag.gen_travel_actions(self.farm, self.bridges)

        self.assertEqual(actions[0].target_object, self.store)

    def test_returns_travel_actions_with_correct_cost_amount(self):
        """
        Returns travel actions with the correct cost amount
        """
        self.bridges = [create_bridge(self.farm, self.store)]
        actions = self.ag.gen_travel_actions(self.farm, self.bridges)

        self.assertEqual(actions[0].cost_amount, 60)

    def test_returns_travel_actions_with_correct_cost_unit(self):
        """
        Returns travel actions with the correct cost unit
        """
        self.bridges = [create_bridge(self.farm, self.store)]
        actions = self.ag.gen_travel_actions(self.farm, self.bridges)

        self.assertEqual(actions[0].cost_unit, Action.MIN)

    def test_returns_travel_actions_with_correct_direction_when_place_is_place_2_on_the_bridge(self):
        """
        Returns travel actions with the correct direction
        when the current place is stored as place 2 on the bridge
        """
        self.bridges = [create_bridge(self.store, self.farm, EAST, WEST)]
        actions = self.ag.gen_travel_actions(self.farm, self.bridges)

        self.assertEqual(actions[0].direction, EAST)

    def test_returns_travel_actions_with_correct_description_when_place_is_place_2_on_the_bridge(self):
        """
        Returns travel actions with the correct description
        when the current place is stored as place 2 on the bridge
        """
        self.bridges = [create_bridge(self.store, self.farm, EAST, WEST)]
        actions = self.ag.gen_travel_actions(self.farm, self.bridges)

        self.assertEqual(actions[0].description, 'Walk East')

    def test_returns_travel_actions_with_correct_log_statement_when_place_is_place_2_on_the_bridge(self):
        """
        Returns travel actions with the correct log statement
        when the current place is stored as place 2 on the bridge
        """
        self.bridges = [create_bridge(self.store, self.farm, EAST, WEST)]
        actions = self.ag.gen_travel_actions(self.farm, self.bridges)

        self.assertEqual(actions[0].log_statement, 'You travelled East to The Store.')


class GenSocialActionsTests(TestCase):
    def setUp(self):
        self.ag = ActionGenerator()
        self.villager_states = []
        self.inventory = []

    def test_returns_list(self):
        """
        Returns a list
        """
        actions = self.ag.gen_social_actions(self.villager_states, self.inventory)

        self.assertIsInstance(actions, list)

    def test_returns_empty_list_if_no_villagers(self):
        """
        Returns an empty list if there are no villagers
        """
        self.inventory = [create_item_token()]
        actions = self.ag.gen_social_actions(self.villager_states, self.inventory)

        self.assertEqual(actions, [])

    def test_returns_talk_actions_if_villagers_and_no_inventory(self):
        """
        Returns a list with only talk actions if there are villagers but no inventory
        """
        self.villager_states = [create_villager_state(name='Lea'), create_villager_state(name='Graham')]
        actions = self.ag.gen_social_actions(self.villager_states, self.inventory)

        for i in range(len(actions)):
            self.assertEqual(actions[i].action_type, Action.TALK)

    def test_returns_talk_actions_and_gift_actions_if_villagers_and_inventory(self):
        """
        Returns a list with both talk and gift actions if there are villagers and inventory
        """
        self.villager_states = [create_villager_state(name='Lea'), create_villager_state(name='Graham')]
        self.inventory = [create_item_token()]
        actions = self.ag.gen_social_actions(self.villager_states, self.inventory)

        assertAnyActionsOfType(actions, Action.TALK)
        assertAnyActionsOfType(actions, Action.GIVE)

        for i in range(len(actions)):
            self.assertIn(actions[i].action_type, [Action.TALK, Action.GIVE])

    def test_returns_one_talk_action_per_villager(self):
        """
        Returns one talk action per villager
        """
        self.villager_states = [
            create_villager_state(name='Lea'),
            create_villager_state(name='Graham'),
            create_villager_state(name='Suki')
        ]
        actions = self.ag.gen_social_actions(self.villager_states, self.inventory)

        talk_actions = [a for a in actions if a.action_type == Action.TALK]

        self.assertEqual(len(talk_actions), 3)

    def test_returns_m_times_n_gift_actions(self):
        """
        Returns m times n gift actions, where m is the number of villagers and n is the number of items
        """
        self.villager_states = [
            create_villager_state(name='Lea'),
            create_villager_state(name='Graham'),
            create_villager_state(name='Suki')
        ]
        self.inventory = [create_item_token(), create_item_token()]
        actions = self.ag.gen_social_actions(self.villager_states, self.inventory)

        gift_actions = [a for a in actions if a.action_type == Action.GIVE]

        self.assertEqual(len(gift_actions), 6)

    def test_returns_talk_actions_with_correct_description(self):
        """
        Returns a list with talk actions with the correct description
        """
        self.villager_states = [create_villager_state(name='Lea')]
        actions = self.ag.gen_social_actions(self.villager_states, self.inventory)

        self.assertEqual(actions[0].description, 'Talk to Lea')

    def test_returns_talk_actions_with_correct_log_statement(self):
        """
        Returns a list with talk actions with the correct log_statement
        """
        self.villager_states = [create_villager_state(name='Lea')]
        actions = self.ag.gen_social_actions(self.villager_states, self.inventory)

        self.assertEqual(actions[0].log_statement, 'You talked to Lea.')

    def test_returns_talk_actions_with_correct_target_object(self):
        """
        Returns a list with talk actions with the correct villager as target_object
        """
        self.villager_states = [create_villager_state()]
        actions = self.ag.gen_social_actions(self.villager_states, self.inventory)

        self.assertEqual(actions[0].target_object, self.villager_states[0].villager)

    def test_returns_talk_actions_with_correct_cost_amount(self):
        """
        Returns a list with talk actions with the correct cost_amount
        """
        self.villager_states = [create_villager_state()]
        actions = self.ag.gen_social_actions(self.villager_states, self.inventory)

        self.assertEqual(actions[0].cost_amount, 30)

    def test_returns_talk_actions_with_correct_cost_unit(self):
        """
        Returns a list with talk actions with the correct cost_unit
        """
        self.villager_states = [create_villager_state()]
        actions = self.ag.gen_social_actions(self.villager_states, self.inventory)

        self.assertEqual(actions[0].cost_unit, Action.MIN)

    def test_returns_gift_actions_with_correct_description(self):
        """
        Returns a list with gift actions with the correct description
        """
        self.villager_states = [create_villager_state(name='Lea')]
        self.inventory = [create_item_token(create_item(name='Rock'))]
        actions = self.ag.gen_social_actions(self.villager_states, self.inventory)

        gift_action = [a for a in actions if a.action_type == Action.GIVE][0]

        self.assertEqual(gift_action.description, 'Give Rock to Lea')

    def test_returns_gift_actions_with_correct_log_statement(self):
        """
        Returns a list with gift actions with the correct log_statement
        """
        self.villager_states = [create_villager_state(name='Lea')]
        self.inventory = [create_item_token(create_item(name='Rock'))]
        actions = self.ag.gen_social_actions(self.villager_states, self.inventory)

        gift_action = [a for a in actions if a.action_type == Action.GIVE][0]

        self.assertEqual(gift_action.log_statement,
                         'You gave {item_name} to {villager_name}. Looks like they {valence_text}')

    def test_returns_gift_actions_with_correct_target_object(self):
        """
        Returns a list with gift actions with the correct villager as target_object
        """
        self.villager_states = [create_villager_state()]
        self.inventory = [create_item_token()]
        actions = self.ag.gen_social_actions(self.villager_states, self.inventory)

        gift_action = [a for a in actions if a.action_type == Action.GIVE][0]

        self.assertEqual(gift_action.target_object, self.villager_states[0].villager)

    def test_returns_gift_actions_with_correct_secondary_target_object(self):
        """
        Returns a list with gift actions with the correct item as secondary_target_object
        """
        self.villager_states = [create_villager_state()]
        self.inventory = [create_item_token()]
        actions = self.ag.gen_social_actions(self.villager_states, self.inventory)

        gift_action = [a for a in actions if a.action_type == Action.GIVE][0]

        self.assertEqual(gift_action.secondary_target_object, self.inventory[0])

    def test_returns_gift_actions_with_correct_cost_amount(self):
        """
        Returns a list with gift actions with the correct cost_amount
        """
        self.villager_states = [create_villager_state()]
        self.inventory = [create_item_token()]
        actions = self.ag.gen_social_actions(self.villager_states, self.inventory)

        gift_action = [a for a in actions if a.action_type == Action.GIVE][0]

        self.assertEqual(gift_action.cost_amount, 5)

    def test_returns_gift_actions_with_correct_cost_unit(self):
        """
        Returns a list with gift actions with the correct cost_unit
        """
        self.villager_states = [create_villager_state()]
        self.inventory = [create_item_token()]
        actions = self.ag.gen_social_actions(self.villager_states, self.inventory)

        gift_action = [a for a in actions if a.action_type == Action.GIVE][0]

        self.assertEqual(gift_action.cost_unit, Action.MIN)

    def test_throws_an_error_if_passed_non_villagers(self):
        """
        Throws an error if passed non-villagers
        """
        self.villager_states = [create_item_token()]
        self.inventory = [create_item_token()]

        with self.assertRaises(TypeError):
            self.ag.gen_social_actions(self.villager_states, self.inventory)

    def test_throws_an_error_if_passed_non_items(self):
        """
        Throws an error if passed non-items
        """
        self.villager_states = [create_villager_state()]
        self.inventory = ['Rock']

        with self.assertRaises(TypeError):
            self.ag.gen_social_actions(self.villager_states, self.inventory)


class GenSleepActionTests(TestCase):
    def setUp(self):
        self.ag = ActionGenerator()
        self.clock = Clock(session=create_session(skip_post_save_signal=True))

    def test_returns_sleep_action(self):
        """
        Returns a sleep action
        """
        action = self.ag.gen_sleep_action(self.clock)

        self.assertEqual(action.action_type, Action.SLEEP)

    def test_returns_sleep_action_with_correct_description(self):
        """
        Returns a sleep action with the correct description
        """
        action = self.ag.gen_sleep_action(self.clock)

        self.assertEqual(action.description, 'Go to sleep')

    def test_returns_sleep_action_with_correct_log_statement(self):
        """
        Returns a sleep action with the correct log_statement
        """
        action = self.ag.gen_sleep_action(self.clock)

        self.assertEqual(action.log_statement, 'You tuck yourself into bed. Sweet dreams!')

    def test_returns_sleep_action_with_correct_cost_amount(self):
        """
        Returns a sleep action with the correct cost_amount
        """
        # minutes_to_midnight is a @property, so we don't use patch.object, just reassign
        Clock.minutes_to_midnight = 180

        action = self.ag.gen_sleep_action(self.clock)

        self.assertEqual(action.cost_amount, 180)

    def test_returns_sleep_action_with_correct_cost_unit(self):
        """
        Returns a sleep action with the correct cost_unit
        """
        action = self.ag.gen_sleep_action(self.clock)

        self.assertEqual(action.cost_unit, Action.MIN)


class ApplySpeedBoostTests(TestCase):
    def setUp(self):
        self.ag = ActionGenerator()
        self.make_actions = lambda: [
            create_basic_action(90),
            create_basic_action(60),
            create_basic_action(30),
            create_basic_action(5),
        ]

        self.expected_rows = {
            0: [90, 60, 30, 5],
            1: [87, 58, 29, 4],
            2: [84, 56, 28, 4],
            3: [81, 54, 27, 4],
            4: [78, 52, 26, 4],
            5: [75, 50, 25, 4],
            6: [72, 48, 24, 4],
            7: [69, 46, 23, 3],
            8: [66, 44, 22, 3],
            9: [63, 42, 21, 3],
            10: [60, 40, 20, 3],
            11: [57, 38, 19, 3],
            12: [54, 36, 18, 3],
            13: [51, 34, 17, 2],
            14: [48, 32, 16, 2],
            15: [45, 30, 15, 2],
            16: [42, 28, 14, 2],
            17: [39, 26, 13, 2],
            18: [36, 24, 12, 2],
            19: [33, 22, 11, 1],
            20: [30, 20, 10, 1],
            21: [27, 18, 9, 1],
            22: [24, 16, 8, 1],
            23: [21, 14, 7, 1],
            24: [18, 12, 6, 1],
            25: [15, 10, 5, 0],
            26: [15, 10, 5, 0],
            27: [15, 10, 5, 0],
            28: [15, 10, 5, 0],
            29: [15, 10, 5, 0],
            30: [15, 10, 5, 0],
        }

    def test_gives_correct_boost_at_level_0(self):
        actions = self.ag.apply_speed_boost(self.make_actions(), 0)

        cost_amounts = [action.cost_amount for action in actions]

        self.assertEqual(cost_amounts, self.expected_rows[0])

    def test_gives_correct_boost_at_level_1(self):
        actions = self.ag.apply_speed_boost(self.make_actions(), 1)

        cost_amounts = [action.cost_amount for action in actions]

        self.assertEqual(cost_amounts, self.expected_rows[1])

    def test_gives_correct_boost_at_level_25(self):
        actions = self.ag.apply_speed_boost(self.make_actions(), 25)

        cost_amounts = [action.cost_amount for action in actions]

        self.assertEqual(cost_amounts, self.expected_rows[25])

    def test_gives_correct_boost_at_level_30(self):
        actions = self.ag.apply_speed_boost(self.make_actions(), 30)

        cost_amounts = [action.cost_amount for action in actions]

        self.assertEqual(cost_amounts, self.expected_rows[30])

    def test_gives_correct_boost_at_all_levels(self):
        for boost_level in range(30):
            with self.subTest(boost_level=boost_level):
                print(boost_level)
                actions = self.ag.apply_speed_boost(self.make_actions(), boost_level)

                cost_amounts = [action.cost_amount for action in actions]

                self.assertEqual(cost_amounts, self.expected_rows[boost_level])
