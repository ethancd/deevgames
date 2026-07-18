from ..models import Action

class ActionValidator:
    def can_afford_action(self, wallet, requested_action):
        if requested_action.is_cost_in_money() and requested_action.action_type != Action.SELL:
            return wallet.money >= requested_action.cost_amount
        else:
            return True