from django.test import TestCase
# noinspection PyUnresolvedReferences
from mythgarden.game_logic import can_afford_action
# noinspection PyUnresolvedReferences
from mythgarden.models import Wallet, Action, Session


def create_session(skip_post_save_signal=True):
    return Session.objects.create(skip_post_save_signal=skip_post_save_signal)


class CanAffordActionTests(TestCase):
    def setUp(self) -> None:
        self.session = create_session(skip_post_save_signal=True)
        self.wallet = Wallet.objects.create(session=self.session)
        self.wallet.money = 0

        self.action = Action(action_type=Action.BUY, cost_unit=Action.KOIN, cost_amount=1, description='',
                             log_statement='')

    def test_can_afford_action_returns_bool(self):
        """
        can_afford_action returns bool
        """
        result = can_afford_action(self.wallet, self.action)

        self.assertIsInstance(result, bool)

    def test_can_afford_action_returns_true_if_action_cost_is_time_based(self):
        """
        can_afford_action returns True if action cost is time based
        """
        self.action.cost_unit = Action.MIN

        result = can_afford_action(self.wallet, self.action)

        self.assertTrue(result)

    def test_can_afford_action_returns_true_if_action_type_is_sell(self):
        """
        can_afford_action returns True if action type is sell
        """
        self.action.cost_unit = Action.KOIN
        self.action.action_type = Action.SELL

        result = can_afford_action(self.wallet, self.action)

        self.assertTrue(result)

    def test_can_afford_action_returns_true_if_wallet_money_is_greater_than_cost(self):
        """
        can_afford_action returns True if wallet has enough money
        """
        self.wallet.money = 10
        self.action.cost_unit = Action.KOIN
        self.action.cost_amount = 5

        result = can_afford_action(self.wallet, self.action)

        self.assertTrue(result)

    def test_can_afford_action_returns_false_if_wallet_money_is_less_than_cost(self):
        """
        can_afford_action returns False if wallet does not have enough money
        """
        self.wallet.money = 10
        self.action.cost_unit = Action.KOIN
        self.action.cost_amount = 15

        result = can_afford_action(self.wallet, self.action)

        self.assertFalse(result)
