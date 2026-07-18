# noinspection PyUnresolvedReferences
from itertools import count
from sqlite3 import IntegrityError
from unittest.mock import MagicMock, patch

from django.test import TestCase
# noinspection PyUnresolvedReferences
from mythgarden.game_logic import ActionExecutor
# noinspection PyUnresolvedReferences
from mythgarden.models import Item, Place, Session, Wallet, Action, Villager, Building, Bridge, Clock, ItemToken, \
    VillagerState, DialogueLine
# noinspection PyUnresolvedReferences
from mythgarden.models._constants import EAST, GIFT, COMMON, UNCOMMON, RARE, EPIC, TOWN, FARM, HOME, RARITIES, \
    RARITY_WEIGHTS, WELCOME_MESSAGE


def create_item(name=None, item_type=GIFT, price=1, rarity=COMMON, counter=count()):
    if name is None:
        name = f'Mock Item #{next(counter)}'

    try:
        return Item.objects.create(name=name, item_type=item_type, price=price, rarity=rarity)
    except IntegrityError:
        print(f'Item with name {name} already exists. Oops!')


def create_place(name='Nowheresville', place_type=TOWN):
    return Place.objects.get_or_create(name=name, place_type=place_type)[0]


def create_building(name, place, place_type):
    return Building.objects.create(name=name, surround=place, place_type=place_type)


def create_session(skip_post_save_signal=True, location=None):
    return Session.objects.create(skip_post_save_signal=skip_post_save_signal, location=location)


def create_villager(name='Lea', home=None):
    return Villager.objects.create(name=name, home=home)


def create_villager_state(villager, session, location=None):
    return VillagerState.objects.create(villager=villager, session=session, location=location)


def create_dialogue(villager, full_text='Hello', trigger=DialogueLine.TALKED_TO, affinity_tier=None):
    return villager.dialogue_lines.create(full_text=full_text, trigger=trigger, affinity_tier=affinity_tier)


class ExecuteActionsTests(TestCase):
    def setUp(self) -> None:
        self.ae = ActionExecutor()
        self.session = MagicMock(spec=Session)

    def test_each_action_type_calls_correct_execute_action_method(self):
        """
        Each action type calls the correct execute_action method
        """
        for action_type, display_type in Action.ACTION_TYPES:
            with self.subTest(action_type=action_type, display_type=display_type):
                print(action_type, display_type)
                action = Action(action_type=action_type)
                ex = f'execute_{display_type.lower()}_action'

                self.assertTrue(hasattr(self.ae, ex))
                self.assertTrue(callable(getattr(self.ae, ex)))

                with patch.object(self.ae, ex) as mock:
                    mock.return_value = ({}, '')
                    self.ae.execute(action, self.session)
                    mock.assert_called_with(action, self.session)

    def test_throw_error_if_unknown_action_type(self):
        """
        Throw error if unknown action type
        """
        action = MagicMock(spec=Action)
        action.action_type = 'not an action type'

        with self.assertRaises(ValueError):
            self.ae.execute(action, self.session)

    def test_throw_error_if_passed_non_action(self):
        """
        Throw error if passed non-action
        """
        with self.assertRaises(TypeError):
            self.ae.execute('not an action', self.session)

    def test_throw_error_if_passed_non_session(self):
        """
        Throw error if passed non-session
        """
        action = MagicMock(spec=Action)

        with self.assertRaises(TypeError):
            self.ae.execute(action, 'not a session')


class ExecuteTravelActionTests(TestCase):
    def setUp(self) -> None:
        self.ae = ActionExecutor()
        self.farm = create_place(name='The Farm', place_type=FARM)
        self.session = create_session(skip_post_save_signal=False, location=self.farm)
        self.town = create_place(name='Town', place_type=TOWN)
        self.building = create_building(name='House', place_type=HOME, place=self.town)

        # overwrite Session's property shorthands
        Session.local_item_tokens = MagicMock(spec=ItemToken.objects)
        Session.local_item_tokens.all = MagicMock(return_value=['item_token_1', 'item_token_2'])
        Session.occupant_states = MagicMock(spec=VillagerState.objects)
        Session.occupant_states.all = MagicMock(return_value=['villager_state_1', 'villager_state_2'])

        self.clock = self.session.clock

        self.action = Action(
            description=f'Walk East',
            action_type=Action.TRAVEL,
            target_object=self.town,
            direction=EAST,
            cost_amount=60,
            cost_unit=Action.MIN,
            log_statement=f'You travelled East to Town.',
        )

    def test_saves_session_place_as_action_place(self):
        """
        execute_travel_action saves the session's location as the action's place
        """
        self.ae.execute_travel_action(self.action, self.session)

        self.session.refresh_from_db()

        self.assertEqual(self.session.location, self.action.target_object)

    def test_calls_clock_advance_with_action_cost(self):
        """
        execute_travel_action calls clock.advance with the action's cost
        """
        with patch.object(self.clock, 'advance') as mock:
            self.ae.execute_travel_action(self.action, self.session)
            mock.assert_called_with(self.action.cost_amount)

    def test_saves_clock_with_new_time(self):
        """
        execute_travel_action saves the clock with the new time
        """
        self.clock.time = 180
        self.clock.save()

        self.action.cost_amount = 60

        self.ae.execute_travel_action(self.action, self.session)

        self.clock.refresh_from_db()

        self.assertEqual(self.clock.time, 240)

    def test_returns_updated_models(self):
        """
        execute_travel_action returns the updated models and a log statement
        """
        result = self.ae.execute_travel_action(self.action, self.session)

        self.assertIsInstance(result, dict)

    def test_returns_correct_models(self):
        """
        execute_travel_action returns the correct updated models
        """
        result = self.ae.execute_travel_action(self.action, self.session)

        expected = {
            'place': self.action.target_object,
            'clock': self.clock,
            'buildings': [self.building],
            'local_item_tokens': ['item_token_1', 'item_token_2'],
            'villager_states': ['villager_state_1', 'villager_state_2'],
        }

        self.assertEqual(result, expected)


class ExecuteTalkActionTests(TestCase):
    def setUp(self) -> None:
        self.ae = ActionExecutor()
        self.town = create_place(name='The Town', place_type=TOWN)
        self.neighbor_house = create_building(name='Neighbor House', place_type=HOME, place=self.town)
        self.villager = create_villager(name='Sal', home=self.neighbor_house)
        self.session = create_session(skip_post_save_signal=False)
        self.villager_state = create_villager_state(self.villager, self.session, self.neighbor_house)
        self.session.location = self.neighbor_house
        self.clock = self.session.clock

        self.dialogue = create_dialogue(self.villager, 'Hello stranger!', DialogueLine.FIRST_MEETING)

        self.action = Action(
            description=f'Talk to Sal',
            action_type=Action.TALK,
            target_object=self.villager,
            cost_amount=45,
            cost_unit=Action.MIN,
            log_statement=f'You talked to Sal.',
        )

    def test_updates_affinity_for_villager(self):
        """
        execute_talk_action updates the affinity for the villager
        """
        self.villager.friendliness = 5

        self.ae.execute_talk_action(self.action, self.session)

        self.villager_state.refresh_from_db()

        self.assertEqual(self.villager_state.affinity, 5)

    def test_marks_villager_as_talked_to(self):
        """
        execute_talk_action marks the villager as talked to
        """
        self.villager_state.has_been_talked_to = False
        self.villager_state.has_ever_been_interacted_with = False
        self.villager_state.save()

        self.ae.execute_talk_action(self.action, self.session)

        self.villager_state.refresh_from_db()

        self.assertTrue(self.villager_state.has_been_talked_to)
        self.assertTrue(self.villager_state.has_ever_been_interacted_with)

    def test_hero_gains_hearts(self):
        """
        execute_talk_action gives the hero hearts when update_affinity returns more than 0
        """
        self.session.hero_state.hearts_earned = 0
        self.session.hero_state.save()

        with patch.object(self.ae, '_ActionExecutor__update_affinity', return_value=1) as mock:
            self.ae.execute_talk_action(self.action, self.session)

            self.session.hero_state.refresh_from_db()

            self.assertEqual(self.session.hero_state.hearts_earned, 1)

    def test_calls_clock_advance_with_action_cost(self):
        """
        execute_talk_action calls clock.advance with the action's cost
        """
        with patch.object(self.clock, 'advance') as mock:
            self.ae.execute_talk_action(self.action, self.session)
            mock.assert_called_with(self.action.cost_amount)

    def test_saves_clock_with_new_time(self):
        """
        execute_talk_action saves the clock with the new time
        """
        self.clock.time = 180
        self.clock.save()

        self.action.cost_amount = 60

        self.ae.execute_talk_action(self.action, self.session)

        self.clock.refresh_from_db()

        self.assertEqual(self.clock.time, 240)

    def test_returns_updated_models(self):
        """
        execute_talk_action returns the updated models
        """
        result = self.ae.execute_talk_action(self.action, self.session)

        self.assertIsInstance(result, dict)

    def test_returns_correct_models(self):
        """
        execute_talk_action returns the correct updated models
        """
        result = self.ae.execute_talk_action(self.action, self.session)

        expected = {
            'hero': self.session.hero_state,
            'clock': self.clock,
            'villager_states': [self.villager_state],
            'dialogue': self.dialogue,
        }

        self.assertEqual(result, expected)

    def test_creates_correct_messages_when_update_affinity_returns_hearts(self):
        """
        execute_talk_action creates correct messages when update_affinity returns hearts
        """
        with patch.object(self.ae, '_ActionExecutor__update_affinity', return_value=1) as mock:
            self.ae.execute_talk_action(self.action, self.session)

            messages = list(self.session.messages.all())

            self.assertEqual(messages[0].text, WELCOME_MESSAGE)
            self.assertEqual(messages[1].text, 'You talked to Sal.')
            self.assertEqual(messages[2].text, 'You and Sal have developed more of a bond! +❤️')


# for random.choices, return the first item in the list
# this will make pull_item_from_pool go through rarities deterministically:
# common -> uncommon -> rare -> epic
@patch('random.choices', side_effect=lambda c, *args, **kwargs: [c[0]])
class PullItemFromPoolTests(TestCase):
    def setUp(self) -> None:
        self.ae = ActionExecutor()
        self.pull_item_from_pool = self.ae._ActionExecutor__pull_item_from_pool
        self.session = MagicMock(spec=Session)
        self.location = create_place()

    def test_pull_item_from_pool_returns_an_item(self, mock_random_choices):
        """
        pull_item_from_pool returns an item
        """
        self.location.item_pool.set([create_item(), create_item()])

        item = self.pull_item_from_pool(self.location)

        self.assertIsInstance(item, Item)

    def test_pull_returns_item_of_correct_rarity_when_only_rarity_in_pool(self, mock_random_choices):
        """
        pull_item_from_pool returns the right rarity of item when only that rarity of item is in the pool
        """

        for rarity in RARITIES:
            with self.subTest(rarity=rarity):
                self.location.item_pool.set([
                    create_item(rarity=rarity),
                    create_item(rarity=rarity)
                ])

                item = self.pull_item_from_pool(self.location)

                self.assertEqual(item.rarity, rarity)

    def test_pull_returns_valid_item_when_multiple_rarities_in_pool(self, mock_random_choices):
        """
        pull_item_from_pool returns a valid item when multiple rarities of item are in the pool
        we've mocked random.choices to return first item in list, so expect a common item
        """
        self.location.item_pool.set([
            create_item(rarity=COMMON),
            create_item(rarity=UNCOMMON),
            create_item(rarity=RARE),
            create_item(rarity=EPIC)
        ])

        item = self.pull_item_from_pool(self.location)

        self.assertEqual(item.rarity, COMMON)

    def test_pull_calls_random_choices_with_correct_weights(self, mock_random_choices):
        """
        pull_item_from_pool calls random.choices with the correct weights
        """
        self.location.item_pool.set([create_item(), create_item()])

        self.pull_item_from_pool(self.location)

        mock_random_choices.assert_called_with(
            RARITIES,
            weights=[v for k, v in RARITY_WEIGHTS.items()],
            k=1
        )

    def test_pull_item_from_pool_raises_error_if_pool_is_empty(self, mock_random_choices):
        """
        pull_item_from_pool raises error if pool is empty
        """
        self.location.item_pool.set(Item.objects.none())

        with self.assertRaises(ValueError):
            self.pull_item_from_pool(self.location)
