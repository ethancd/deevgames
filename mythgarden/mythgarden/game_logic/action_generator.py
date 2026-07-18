import math
from fractions import Fraction

from ..models import Bridge, Building, ItemToken, Place, VillagerState, Action
from ..models._constants import FARM, SHOP, WILD_TYPES, SUNSET, DAWN, SEED, SPROUT, CROP, FOREST, MOUNTAIN, BEACH, \
    TALK_MINUTES_PER_FRIENDLINESS, EXIT_DESCRIPTION, FISHING_DESCRIPTION, MINING_DESCRIPTION, FORAGING_DESCRIPTION, \
    BOOST_DENOMINATOR, MAX_BOOST_LEVEL, TIME_TYPE, MYTHEGG
from ..static_helpers import guard_types, guard_type


class ActionGenerator:
    def get_actions_for_session(self, session):
        place = session.location
        inventory = list(session.inventory.item_tokens.all())
        contents = list(session.local_item_tokens.all())
        villager_states = list(session.occupant_states.all())
        clock = session.clock
        boost_level = session.hero.boost_level

        actions = self.gen_available_actions(place, inventory, contents, villager_states, clock, boost_level, session)

        return actions

    def gen_available_actions(self, place, inventory, contents, villager_states, clock, boost_level, session=None):
        """Returns a list of available actions for the hero in the current session, taking into account:
        - the current inventory
        - the location's current present items/occupants (contents and villagers)
        - the place's static features (buildings and bridges)"""

        available_actions = []

        buildings = list(place.buildings.all())
        bridges = list(Bridge.objects.filter(place_1=place) | Bridge.objects.filter(place_2=place))

        try:
            building = place.building
            if building.surround is not None:
                available_actions += [self.gen_exit_action(building)]
        except Building.DoesNotExist:
            pass

        if len(bridges) > 0:
            available_actions += self.gen_travel_actions(place, bridges)

        if len(buildings) > 0:
            available_actions += self.gen_enter_actions(buildings, clock, session)

        if place.place_type == FARM:
            available_actions += self.gen_farming_actions(contents, inventory)

        if place.place_type == SHOP:
            available_actions += self.gen_shopping_actions(contents, inventory)

        if place.place_type in WILD_TYPES:
            available_actions += self.gen_gather_actions(place)

        if len(villager_states) > 0:
            available_actions += self.gen_social_actions(villager_states, inventory)

        if place.is_farmhouse:
            available_actions += self.gen_storage_actions(contents, inventory)

            if clock.time >= SUNSET or clock.time < DAWN:
                available_actions += [self.gen_sleep_action()]

        actions = self.apply_speed_boost(available_actions, boost_level)

        return actions

    def gen_farming_actions(self, field_contents, inventory):
        """Returns a list of farming actions: what seeds can be planted from the inventory,
        and what crops can be watered or harvested from the field contents"""

        guard_types(field_contents, ItemToken)
        guard_types(inventory, ItemToken)

        actions = []

        seeds = [i for i in inventory if i.item_type == SEED]
        for seed in seeds:
            actions.append(self.gen_plant_action(seed))

        growing_plants = [i for i in field_contents if i.item_type in [SEED, SPROUT]]
        for plant in growing_plants:
            if not plant.has_been_watered:
                actions.append(self.gen_water_action(plant))

        crops = [i for i in field_contents if i.item_type == CROP]

        for crop in crops:
            actions.append(self.gen_harvest_action(crop))

        return actions

    def gen_shopping_actions(self, shop_contents, inventory):
        """Returns a list of shopping actions: what items can be sold from inventory,
        and what items can be bought from the shop contents"""
        guard_types(shop_contents, ItemToken)
        guard_types(inventory, ItemToken)

        actions = []

        for item_token in shop_contents:
            actions.append(self.gen_buy_action(item_token))

        for item_token in inventory:
            if item_token.item_type == MYTHEGG:
                continue

            actions.append(self.gen_sell_action(item_token))

        return actions

    def gen_gather_actions(self, place):
        """Returns a list of gathering actions tied to the current place type"""
        guard_type(place, Place)

        actions = []

        if place.place_type == FOREST:
            actions.append(self.gen_foraging_action())
        elif place.place_type == MOUNTAIN:
            actions.append(self.gen_mining_action())
        elif place.place_type == BEACH:
            actions.append(self.gen_fishing_action())

        return actions

    def gen_enter_actions(self, buildings, clock, session=None):
        """Returns a list of enter actions: what buildings can be entered, based on the time of day"""
        guard_types(buildings, Building)

        actions = []

        # Check if building hours setting is disabled
        settings = None
        if session and hasattr(session.hero, 'settings'):
            settings = session.hero.settings

        for building in buildings:
            # If building_hours is disabled, all buildings are always open
            if settings and not settings.building_hours:
                actions.append(self.gen_enter_action(building))
            elif building.is_open(clock.time):
                actions.append(self.gen_enter_action(building))

        return actions

    def gen_travel_actions(self, place, bridges):
        """Returns a list of travel actions: what directions you can walk to cross a bridge another place"""
        guard_type(place, Place)
        guard_types(bridges, Bridge)

        actions = []

        for bridge in bridges:
            if bridge.place_1 == place:
                destination = bridge.place_2
                direction = bridge.direction_2
                display_direction = bridge.get_direction_2_display()
            else:
                destination = bridge.place_1
                direction = bridge.direction_1
                display_direction = bridge.get_direction_1_display()

            actions.append(self.gen_travel_action(destination, direction, display_direction))

        return actions

    def gen_social_actions(self, villager_states, inventory):
        """Returns a list of social actions: which villagers can be talked to,
        and what items can be given to them as gifts"""
        guard_types(villager_states, VillagerState)
        guard_types(inventory, ItemToken)

        talk_actions = []
        gift_actions = []

        for villager_state in villager_states:
            villager = villager_state.villager
            if not villager_state.has_been_talked_to:
                talk_actions.append(self.gen_talk_action(villager))

            if not villager_state.has_been_given_gift:
                for item_token in inventory:
                    gift_actions.append(self.gen_give_action(item_token, villager))

        return talk_actions + gift_actions

    def gen_storage_actions(self, storage_contents, inventory):
        """Returns a list of storage actions: what items can be moved from inventory to storage,
        and what items can be taken from the storage into inventory"""
        guard_types(storage_contents, ItemToken)
        guard_types(inventory, ItemToken)

        actions = []

        for item_token in inventory:
            actions.append(self.gen_stow_action(item_token))

        for item_token in storage_contents:
            actions.append(self.gen_retrieve_action(item_token))

        return actions

    def gen_give_action(self, item_token, villager):
        """Returns an action that gives passed item to passed villager"""
        cost_amount = 5
        return Action(
            description=f'Gift {item_token.name} to {villager.name}',
            action_type=Action.GIVE,
            target_villager=villager,
            target_item=item_token,
            cost_amount=cost_amount,
            cost_unit=Action.MIN,
            cost_wait_class=Action.MINUTES_TO_WAIT_CLASS[cost_amount],
            log_statement='You gave {item_name} to {villager_name}. Looks like they {valence_text}',
        )

    def gen_talk_action(self, villager):
        """Returns an action that talks to given villager"""
        cost_amount = villager.friendliness * TALK_MINUTES_PER_FRIENDLINESS
        return Action(
            description=f'Talk to {villager.name}',
            action_type=Action.TALK,
            target_villager=villager,
            cost_amount=cost_amount,
            cost_unit=Action.MIN,
            cost_wait_class=Action.MINUTES_TO_WAIT_CLASS[cost_amount],
            log_statement=f'You talked to {villager.name}.',
        )

    def gen_sell_action(self, item_token):
        """Returns an action that sells given item"""
        return Action(
            description=f'Sell {item_token.name}',
            action_type=Action.SELL,
            target_item=item_token,
            cost_amount=item_token.price,
            cost_unit=Action.KOIN,
            log_statement='You sold {name} for {price} fleurs.',
        )

    def gen_buy_action(self, item_token):
        """Returns an action that buys given item"""
        return Action(
            description=f'Buy {item_token.name}',
            action_type=Action.BUY,
            target_item=item_token,
            cost_amount=item_token.price,
            cost_unit=Action.KOIN,
            log_statement=f'You bought {item_token.name} for {item_token.price} fleurs.',
        )

    def gen_stow_action(self, item_token):
        """Returns an action that puts given item into storage"""
        return Action(
            description=f'Stow {item_token.name}',
            action_type=Action.STOW,
            target_item=item_token,
            log_statement=f'You put {item_token.name} in your chest.',
        )

    def gen_retrieve_action(self, item_token):
        """Returns an action that takes given item out of storage"""
        return Action(
            description=f'Retrieve {item_token.name}',
            action_type=Action.RETRIEVE,
            target_item=item_token,
            log_statement=f'You took {item_token.name} out of your chest.',
        )

    def gen_enter_action(self, building):
        """Returns an action that enters given building"""
        cost_amount = 5
        return Action(
            description=f'Enter {building.name}',
            action_type=Action.TRAVEL,
            target_place=building,
            cost_amount=cost_amount,
            cost_unit=Action.MIN,
            cost_wait_class=Action.MINUTES_TO_WAIT_CLASS[cost_amount],
            log_statement=f'You entered {building.name}.',
        )

    def gen_exit_action(self, building):
        """Returns an action that exits the current place"""
        cost_amount = 5
        return Action(
            description=EXIT_DESCRIPTION,
            action_type=Action.TRAVEL,
            target_place=building.surround,
            cost_amount=cost_amount,
            cost_unit=Action.MIN,
            cost_wait_class=Action.MINUTES_TO_WAIT_CLASS[cost_amount],
            log_statement=f'You exited {building.name}.',
        )

    def gen_plant_action(self, seed_token):
        """Returns an action that plants given seed"""
        cost_amount = seed_token.item.effort_time

        return Action(
            description=f'Plant {seed_token.name}',
            action_type=Action.PLANT,
            target_item=seed_token,
            cost_amount=cost_amount,
            cost_unit=Action.MIN,
            cost_wait_class=Action.MINUTES_TO_WAIT_CLASS[cost_amount],
            log_statement=f'You planted some {seed_token.name} in the field.',
        )

    def gen_water_action(self, plant_token):
        """Returns an action that waters given seed/sprout"""
        cost_amount = plant_token.item.effort_time

        return Action(
            description=f'Water {plant_token.name}',
            action_type=Action.WATER,
            target_item=plant_token,
            cost_amount=cost_amount,
            cost_unit=Action.MIN,
            cost_wait_class=Action.MINUTES_TO_WAIT_CLASS[cost_amount],
            log_statement=f'You watered the {plant_token.name}.',
        )

    def gen_harvest_action(self, crop_token):
        """Returns an action that harvests given crop"""
        cost_amount = crop_token.item.effort_time

        return Action(
            description=f'Harvest {crop_token.name}',
            action_type=Action.HARVEST,
            target_item=crop_token,
            cost_amount=cost_amount,
            cost_unit=Action.MIN,
            cost_wait_class=Action.MINUTES_TO_WAIT_CLASS[cost_amount],
            log_statement=f'You harvested the {crop_token.name}.',
        )

    def gen_travel_action(self, destination, direction, display_direction):
        """Returns an action that travels to given destination in given direction"""
        cost_amount = 60
        return Action(
            description=f'Go {display_direction}',
            action_type=Action.TRAVEL,
            target_place=destination,
            direction=direction,
            cost_amount=cost_amount,
            cost_unit=Action.MIN,
            cost_wait_class=Action.MINUTES_TO_WAIT_CLASS[cost_amount],
            log_statement=f'You travelled to {destination.name}.',
        )

    def gen_fishing_action(self):
        """Returns an action that catches a fish"""
        cost_amount = 60
        return Action(
            description=FISHING_DESCRIPTION,
            action_type=Action.GATHER,
            cost_amount=cost_amount,
            cost_unit=Action.MIN,
            cost_wait_class=Action.MINUTES_TO_WAIT_CLASS[cost_amount],
            log_statement='You caught a {result}!',
        )

    def gen_mining_action(self):
        """Returns an action that digs for minerals, gems, fossils, etc"""
        cost_amount = 90
        return Action(
            description=MINING_DESCRIPTION,
            action_type=Action.GATHER,
            cost_amount=cost_amount,
            cost_unit=Action.MIN,
            cost_wait_class=Action.MINUTES_TO_WAIT_CLASS[cost_amount],
            log_statement='You dug up a {result}!',
        )

    def gen_foraging_action(self):
        """Returns an action that forages for herbs, plants, etc"""
        cost_amount = 30
        return Action(
            description=FORAGING_DESCRIPTION,
            action_type=Action.GATHER,
            cost_amount=cost_amount,
            cost_unit=Action.MIN,
            cost_wait_class=Action.MINUTES_TO_WAIT_CLASS[cost_amount],
            log_statement='You found {result}!',
        )

    def gen_sleep_action(self):
        """Returns an action for the hero to go to sleep till the next day"""
        return Action(
            description='Sleep',
            action_type=Action.SLEEP,
            log_statement='You tuck yourself into bed. Sweet dreams!',
        )

    def apply_speed_boost(self, actions, boost_level):
        """Reduce the cost_amount of time-based actions proportional to the given speed_boost"""
        if not boost_level or boost_level == 0:
            return actions

        boost_numerator = BOOST_DENOMINATOR - min(boost_level, MAX_BOOST_LEVEL)

        boost_fraction = Fraction(boost_numerator, BOOST_DENOMINATOR)

        for action in actions:
            if action.cost_type == TIME_TYPE and action.cost_amount is not None:
                action.cost_amount = math.floor(action.cost_amount * boost_fraction)

        return actions
