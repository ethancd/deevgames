import random

from .mythegg_finder import MytheggFinder
from .mythegg_powers import MytheggPowers
from ..models import Action, Session, ItemToken, DialogueLine, Achievement
from ..models._constants import SEED, MAX_ITEMS, MAX_LUCK_LEVEL, LUCK_DENOMINATOR, RARITIES, COMMON, UNCOMMON, RARE, \
    EPIC, \
    MYTHIC, RARITY_WEIGHTS, LOVE, LIKE, NEUTRAL, \
    DISLIKE, HATE, TALK_TO_VILLAGERS, SCORE_POINTS, GAIN_HEARTS, EARN_MONEY, HARVEST, GATHER, GAIN_ACHIEVEMENT, MYTHEGG, \
    SPOOPY_LUCK_BONUS, CORAL_PRICE_MULTIPLIER, FORAGING_ITEM_TYPES, MOUNTAIN, FISH, SPARKLY_FRIENDLINESS
from ..static_helpers import guard_type


class ActionExecutor:
    def __init__(self):
        self.mythegg_finder = MytheggFinder()
        self.mythegg_powers = MytheggPowers()

    def execute(self, action, session):
        """Executes the given action, modifying relevant models in the session, and returns updated
        (selecting the correct method based on the action type using a bit of meta programming, as a treat)"""
        guard_type(action, Action)
        guard_type(session, Session)

        ex = f'execute_{action.get_action_type_display().lower()}_action'

        if hasattr(self, ex) and callable(getattr(self, ex)):
            getattr(self, ex)(action, session)
        else:
            raise ValueError(f'Unknown action type: {action.get_action_type_display().lower()}')

    def execute_travel_action(self, action, session):
        """Executes a travel action, which updates the current location and ticks the clock"""

        session.location = action.target_place
        session.save()

        log_statement = self.__add_emoji(action, action.log_statement)
        session.messages.create(text=log_statement)

        session.clock.advance(action.cost_amount).save()

        session.mark_fresh('buildings', 'clock', 'localItemTokens', 'messages', 'place', 'villagerStates')

    def execute_talk_action(self, action, session):
        """Executes a talk action, which displays some dialogue, adds to the villager's affinity, and ticks the clock"""

        # grab villager & villager_state
        villager = action.target_villager
        villager_state = session.get_villager_state(villager)

        # get and set dialogue
        self.__set_dialogue_for_talk_action(session, villager_state, villager)

        # calculate and add affinity
        friendliness = villager.friendliness

        if self.mythegg_powers.sparkly_active(session):
            friendliness = SPARKLY_FRIENDLINESS

        affinity_amount = self.__calc_talk_affinity_change(villager_state.talked_to_count, friendliness)
        hearts_gained = self.__update_affinity(villager_state, affinity_amount, session.hero_state)

        # update villager_state and save
        villager_state.mark_as_talked_to().save()

        # draw for mythegg
        mythegg, mythling_state = self.mythegg_finder.draw_for_hearts_gained_mythegg(session, villager_state, hearts_gained) or (None, None)

        if mythegg:
            if session.inventory.is_full:
                mythling_state.mark_deferred().save()
            else:
                self.mythegg_finder.award_mythegg(session, session.inventory, mythegg, mythling_state)
                self.__set_mythegg_dialogue(session, villager)

        # create messages
        log_statement = self.__add_emoji(action, action.log_statement)
        session.messages.create(text=log_statement)
        affinity_message = self.__make_affinity_message_if_any(hearts_gained, villager)
        if affinity_message:
            session.messages.create(text=affinity_message)

        # check for achievements
        self.__check_talk_to_villagers_achievements(session, villager_state)
        if hearts_gained > 0:
            self.__check_gain_hearts_achievements(session, villager_state)
            self.__check_score_points_achievements(session)

        # update clock and save
        session.clock.advance(action.cost_amount).save()

        session.mark_fresh('clock', 'dialogue', 'hero', 'messages', 'speaker', 'villagerStates')

    def execute_give_action(self, action, session):
        """Executes a give action, which removes an item from the hero's inventory
        and adds to the villager's affinity"""

        # grab villager, villager_state, and gift
        villager = action.target_villager
        villager_state = session.get_villager_state(villager)
        gift = action.target_item

        # remove gift from inventory
        session.inventory.item_tokens.remove(gift)
        if gift.item_type == MYTHEGG:
            self.mythegg_finder.mark_mythegg_token_given_away(session, gift)

        # calculate reaction
        valence = villager.gift_valence(gift)

        if self.mythegg_powers.verdant_active(session) and gift.item_type in FORAGING_ITEM_TYPES:
            valence = LOVE

        # get and set dialogue
        self.__set_dialogue_for_gift_action(session, villager, valence)

        # calculate and add affinity
        affinity_amount = self.__calc_gift_affinity_change(valence, gift.rarity)
        hearts_gained = self.__update_affinity(villager_state, affinity_amount, session.hero_state)

        # update villager_state and save
        villager_state.mark_as_given_gift().save()

        # draw for mythegg
        mythegg, mythling_state = self.mythegg_finder.draw_for_hearts_gained_mythegg(session, villager_state, hearts_gained) or (None, None)

        if mythegg:
            self.mythegg_finder.award_mythegg(session, session.inventory, mythegg, mythling_state)
            self.__set_mythegg_dialogue(session, villager)

        # create messages
        valence_text = self.__get_valence_text(valence)
        formatted_log_statement = action.log_statement.format(
            item_name=gift.name, villager_name=villager.name, valence_text=valence_text
        )
        log_statement = self.__add_emoji(action, formatted_log_statement)
        session.messages.create(text=log_statement)
        affinity_message = self.__make_affinity_message_if_any(hearts_gained, villager)
        if affinity_message:
            session.messages.create(text=affinity_message)

        # check for achievements
        if hearts_gained > 0:
            self.__check_gain_hearts_achievements(session, villager_state)
            self.__check_score_points_achievements(session)

        # update clock and save
        session.clock.advance(action.cost_amount).save()

        session.mark_fresh('clock', 'dialogue', 'hero', 'inventory', 'messages', 'speaker', 'villagerStates')

    def execute_sell_action(self, action, session):
        """Executes a sell action, which removes an item from the hero's inventory
        and adds the price in koin to the hero's wallet"""

        item = action.target_item
        price = action.cost_amount

        if self.mythegg_powers.coral_active(session) and item.item_type == FISH:
            price *= CORAL_PRICE_MULTIPLIER

        session.inventory.item_tokens.remove(item)
        session.wallet.money += price
        session.wallet.save()

        log_statement = self.__add_emoji(action, action.log_statement.format(name=item.name, price=price))
        session.messages.create(text=log_statement)

        #  if the item should get repopulated into the store, do that
        if item.bought_from_store and item.item_type != SEED:
            matching_item_in_store = session.local_item_tokens.filter(item=item.item)
            store_has_open_slot = session.local_item_tokens.count() < MAX_ITEMS

            if matching_item_in_store.exists():
                matching_item = matching_item_in_store.first()
                matching_item.quantity += 1
                matching_item.save()
            elif store_has_open_slot:
                item.quantity = 1
                item.save()
                session.location_state.item_tokens.add(item)

        # if the item isn't being "returned", then increment hero's koin earned
        if not item.bought_from_store:
            session.hero_state.increment_koin_earned(action.cost_amount, item.item_type)
            session.hero_state.save()

            self.__check_earn_money_achievements(session)
            self.__check_score_points_achievements(session)

        session.mark_fresh('hero', 'inventory', 'localItemTokens', 'messages', 'wallet')

    def execute_buy_action(self, action, session):
        """Executes a buy action, which adds an item_token to the hero's inventory that's a copy of one in the shop,
        and deducts the price in koin from the hero's wallet"""

        item = action.target_item

        new_item = item.make_copy()
        new_item.bought_from_store = True
        new_item.quantity = None
        new_item.save()

        if new_item.item_type == MYTHEGG:
            self.mythegg_finder.award_mythegg_token(session, session.inventory, new_item)
        else:
            session.inventory.item_tokens.add(new_item)

        if item.quantity:
            item.quantity -= 1

            if item.quantity == 0:
                session.location_state.item_tokens.remove(item)
            else:
                item.save()

        session.wallet.money -= action.cost_amount

        log_statement = self.__add_emoji(action, action.log_statement)
        session.messages.create(text=log_statement)

        session.wallet.save()

        session.mark_fresh('inventory', 'localItemTokens', 'messages', 'wallet')

    def execute_stow_action(self, action, session):
        """Executes a stow action, which removes an item from the hero's inventory
        and adds it into location storage"""

        item = action.target_item

        session.inventory.item_tokens.remove(item)
        session.location_state.item_tokens.add(item)

        log_statement = self.__add_emoji(action, action.log_statement)
        session.messages.create(text=log_statement)

        session.mark_fresh('inventory', 'localItemTokens', 'messages')

    def execute_retrieve_action(self, action, session):
        """Executes a retrieve action, which adds an item into the hero's inventory
        and removes it from location storage"""

        item = action.target_item

        session.location_state.item_tokens.remove(item)
        session.inventory.item_tokens.add(item)

        log_statement = self.__add_emoji(action, action.log_statement)
        session.messages.create(text=log_statement)

        session.mark_fresh('inventory', 'localItemTokens', 'messages')

    def execute_plant_action(self, action, session):
        """Executes a plant action, which moves a seed from the hero's inventory into the session contents"""

        session.inventory.item_tokens.remove(action.target_item)
        action.target_item.days_growing = 1
        action.target_item.save()
        session.location_state.item_tokens.add(action.target_item)

        log_statement = self.__add_emoji(action, action.log_statement)
        session.messages.create(text=log_statement)

        session.clock.advance(action.cost_amount).save()

        session.mark_fresh('clock', 'inventory', 'localItemTokens', 'messages')

    def execute_water_action(self, action, session):
        """Executes a water action, which sets the item_token's has_been_watered attribute to True"""

        item_token = action.target_item
        item_token.has_been_watered = True
        item_token.save()

        log_statement = self.__add_emoji(action, action.log_statement)
        session.messages.create(text=log_statement)

        session.clock.advance(action.cost_amount).save()

        session.mark_fresh('clock', 'localItemTokens', 'messages')

    def execute_harvest_action(self, action, session):
        """Executes a harvest action, which moves a crop from the session contents into the hero's inventory"""

        session.inventory.item_tokens.add(action.target_item)
        session.location_state.item_tokens.remove(action.target_item)

        log_statement = self.__add_emoji(action, action.log_statement)
        session.messages.create(text=log_statement)

        session.hero_state.farming_intake += action.target_item.price
        session.hero_state.save()

        session.clock.advance(action.cost_amount).save()

        self.__check_harvest_achievements(session)

        session.mark_fresh('clock', 'inventory', 'localItemTokens', 'messages')

    def execute_gather_action(self, action, session):
        """Executes a gather action, which finds a random item in the current location's item pool
        and adds a copy to the hero's inventory"""

        luck_level = session.hero.luck_level

        if self.mythegg_powers.spoopy_active(session) and session.location.place_type == MOUNTAIN:
            luck_level += SPOOPY_LUCK_BONUS

        luck_percent = min(luck_level, MAX_LUCK_LEVEL) / LUCK_DENOMINATOR

        mythegg, mythling_state = self.mythegg_finder.draw_for_mythegg(session, session.location.mythegg, luck_percent) or (None, None)

        if mythegg:
            item = mythegg
            self.mythegg_finder.award_mythegg(session, session.inventory, mythegg, mythling_state)

        else:
            item = self.__pull_item_from_pool(session.location, luck_percent)
            session.inventory.item_tokens.add(ItemToken.objects.create(session=session, item=item))

        log_statement = self.__add_emoji(action, action.log_statement.format(result=item.name))
        session.messages.create(text=log_statement)

        session.hero_state.increment_gathering_intake(item)
        session.hero_state.save()

        session.clock.advance(action.cost_amount).save()

        self.__check_gather_achievements(session)

        session.mark_fresh('clock', 'inventory', 'messages')

    def execute_sleep_action(self, action, session):
        """Executes a sleep action, which advances the clock to midnight"""

        session.hero_state.is_in_bed = True

        log_statement = self.__add_emoji(action, action.log_statement)
        session.messages.create(text=log_statement)

        session.clock.advance_to_end_of_day().save()

        session.hero_state.save()

        session.mark_fresh('clock', 'messages')

    # private methods
    def __add_emoji(self, action, log_statement):
        return f'{action.emoji} {log_statement}'

    def __pull_item_from_pool(self, location, luck_percent):
        """Returns a random item from the given location's item pool, weighted by rarity.
        Modulate rarity percentages based on hero luck level"""

        # Pick a rarity, find an item of that rarity;
        # if none found, try again with another rarity;
        # if no items at all, error out
        rarities = [r for r in RARITIES]

        while len(rarities) > 0:
            weights = [self.__get_luck_modified_weight(r, luck_percent) for r in rarities]
            rarity = random.choices(rarities, weights=weights, k=1)[0]

            items_at_rarity = location.item_pool.filter(rarity=rarity)

            # find the item types among items at this rarity, then pick a random type to filter on
            available_types = list(items_at_rarity.values_list("item_type", flat=True).distinct())

            item_type = random.choice(available_types)

            choices = items_at_rarity.filter(item_type=item_type)

            if choices.count() > 0:
                item = choices.order_by('?').first()
                return item
            else:
                # 'No items found in location with that rarity, so we try other rarities.
                rarities.remove(rarity)
                continue

        raise ValueError(f'No items found in location {location.name} of any rarity')

    def __get_luck_modified_weight(self, rarity, luck_percent):
        LUCK_GROWTH_BY_RARITY = {
            COMMON: -1,
            UNCOMMON: 4 / 7,
            RARE: 2 / 7,
            EPIC: 1 / 7,
            MYTHIC: 0,
        }

        luck_factor = LUCK_GROWTH_BY_RARITY[rarity]

        base_weight = RARITY_WEIGHTS[rarity]
        modified_weight = base_weight + luck_percent * luck_factor

        return modified_weight

    def __set_dialogue_for_talk_action(self, session, villager_state, villager):
        if villager_state.has_ever_been_interacted_with:
            trigger = DialogueLine.TALKED_TO
            affinity_tier = villager_state.affinity_tier
        else:
            trigger = DialogueLine.FIRST_MEETING
            affinity_tier = None

        dialogue = villager.get_dialogue(trigger, affinity_tier)

        session.current_dialogue = dialogue
        session.save()

    def __set_dialogue_for_gift_action(self, session, villager, valence):
        """Returns a trigger object for a gift action based on the valence of their reaction"""

        VALENCE_TO_DIALOGUE_TRIGGER_MAP = {
            LOVE: DialogueLine.LOVED_GIFT,
            LIKE: DialogueLine.LIKED_GIFT,
            NEUTRAL: DialogueLine.NEUTRAL_GIFT,
            DISLIKE: DialogueLine.DISLIKED_GIFT,
            HATE: DialogueLine.HATED_GIFT,
        }

        trigger = VALENCE_TO_DIALOGUE_TRIGGER_MAP[valence]
        dialogue = villager.get_dialogue(trigger)

        session.current_dialogue = dialogue
        session.save()

    def __set_mythegg_dialogue(self, session, villager):
        trigger = DialogueLine.GRANTING_MYTHEGG
        dialogue = villager.get_dialogue(trigger)

        session.current_dialogue = dialogue
        session.save()

    def __calc_talk_affinity_change(self, talked_to_count, friendliness):
        """Calculates the change in affinity for a talk action based on how many times you've talked to the villager
        and their base friendliness"""

        return talked_to_count + friendliness

    def __calc_gift_affinity_change(self, valence, rarity):
        """Calculates the change in affinity for a gift based on valence of villager's reaction,
        item's rarity, villager's friendliness"""

        VALENCE_VALUE_MAP = {
            LOVE: 10,
            LIKE: 5,
            NEUTRAL: 2.5,
            DISLIKE: 0,
            HATE: -2.5,
        }

        RARITY_MULTIPLIER_MAP = {
            COMMON: 1,
            UNCOMMON: 2,
            RARE: 3,
            EPIC: 4,
            MYTHIC: 5
        }

        base_value = VALENCE_VALUE_MAP[valence]
        multiplier = RARITY_MULTIPLIER_MAP[rarity]

        return int(base_value * multiplier)

    def __update_affinity(self, villager_state, amount, hero_state):
        """Updates the villager's villager_state affinity and returns the number of "hearts" gained (affinity tier diff)"""

        old_tier = villager_state.affinity_tier
        villager_state.add_affinity(amount).save()
        new_tier = villager_state.affinity_tier

        hearts_gained = new_tier - old_tier

        hero_state.increment_hearts_earned(hearts_gained, new_tier).save()

        return hearts_gained

    def __make_affinity_message_if_any(self, hearts_gained, villager):
        if hearts_gained > 0:
            hearts = ''.join(['❤️' for _ in range(hearts_gained)])
            return f" +{hearts} You and {villager.name} have developed more of a bond!"
        else:
            return None

    def __get_valence_text(self, valence):
        if valence == LOVE:
            return 'love it!'
        elif valence == LIKE:
            return 'like it!'
        elif valence == NEUTRAL:
            return 'feel okay about it.'
        elif valence == DISLIKE:
            return 'aren\'t a fan of it.'
        elif valence == HATE:
            return 'wish you hadn\'t!'
        else:
            raise ValueError(f'Invalid valence {valence}')

    def __check_talk_to_villagers_achievements(self, session, villager_state):
        newly_notched_count = Achievement.check_triggered_achievements(
            TALK_TO_VILLAGERS, session, villager_state=villager_state
        )

        if newly_notched_count > 0:
            self.__check_gain_achievement_achievements(session)
            session.mark_fresh('achievements')

    def __check_score_points_achievements(self, session):
        newly_notched_count = Achievement.check_triggered_achievements(
            SCORE_POINTS, session, hero_state=session.hero_state
        )

        if newly_notched_count > 0:
            session.mark_fresh('achievements')

    def __check_gain_hearts_achievements(self, session, villager_state):
        newly_notched_count = Achievement.check_triggered_achievements(
            GAIN_HEARTS, session, villager_state=villager_state,
            villager_states=session.villager_states.all(), clock=session.clock
        )

        if newly_notched_count > 0:
            self.__check_gain_achievement_achievements(session)
            session.mark_fresh('achievements')

    def __check_earn_money_achievements(self, session):
        newly_notched_count = Achievement.check_triggered_achievements(
            EARN_MONEY, session, hero_state=session.hero_state, clock=session.clock
        )

        if newly_notched_count > 0:
            session.mark_fresh('achievements')

    def __check_harvest_achievements(self, session):
        newly_notched_count = Achievement.check_triggered_achievements(
            HARVEST, session, hero_state=session.hero_state
        )

        if newly_notched_count > 0:
            session.mark_fresh('achievements')

    def __check_gather_achievements(self, session):
        newly_notched_count = Achievement.check_triggered_achievements(
            GATHER, session, hero_state=session.hero_state
        )

        if newly_notched_count > 0:
            session.mark_fresh('achievements')

    def __check_gain_achievement_achievements(self, session):
        Achievement.check_triggered_achievements(
            GAIN_ACHIEVEMENT, session, hero=session.hero
        )
