import json
import random

from .mythegg_finder import MytheggFinder
from .mythegg_powers import MytheggPowers
from ..models import ScheduledEvent, VillagerState, PlaceState, Item, MerchSlot, ItemToken
from ..models._constants import SHOP, FARM, SEED, SPROUT, CROP, DAWN, DAY_TO_INDEX, KYS_MESSAGE, FIRST_DAY, MAX_ITEMS, \
    RAINBOW_BONUS_TIME


class EventOperator:
    def __init__(self):
        self.mythegg_finder = MytheggFinder()
        self.mythegg_powers = MytheggPowers()

    def react_to_time_passing(self, clock, session):
        # check for game over and short circuit if so
        if self.__is_game_over(clock):
            session.game_over = True
            session.save()
            return

        # run scheduled events (from yesterday & today)
        self.trigger_scheduled_events(clock, session)

        # if start of a new day, run hard-coded events, have the hero go to sleep, then run events
        if clock.is_new_day:
            # unless you have the rainbow egg!
            if self.mythegg_powers.rainbow_active(session) \
                and clock.time < RAINBOW_BONUS_TIME \
                    and not session.hero_state.is_in_bed:

                return

            self.reset_for_new_day(session)
            self.sleep_through_the_night(clock, session)  # advances the clock, sets is_new_day to False

            self.react_to_time_passing(clock, session)  # run this function again!

    def trigger_scheduled_events(self, clock, session):
        """Trigger events which are set to go off between last_triggered_day/last_triggered_time and clock.day/clock.time.
        Then set last_triggered_* to now :)"""
        events_to_trigger_queue = self.build_events_to_trigger_queue(clock)

        self.trigger_events(list(events_to_trigger_queue), session)

        clock.mark_last_triggered_point_as_now().save()

    def build_events_to_trigger_queue(self, clock):
        """Build an ordered queue of events to trigger with the following properties:
        -- has not yet occurred AND
        -- is_daily OR is set to occur on the given day
        -- is ordered by time ascending, then is_daily=true, then is_daily=false
        (by having is_daily=True first, we can "overwrite" a daily event with a more specific one-day event at the same time)
        """

        yesterday_events_to_trigger = self.get_yesterday_events_to_trigger(clock)
        today_events_to_trigger = self.get_today_events_to_trigger(clock)

        events_to_trigger_queue = yesterday_events_to_trigger | today_events_to_trigger

        events_to_trigger_queue = events_to_trigger_queue.order_by('time', '-is_daily', 'pk')  # orders by time, then is_daily=True, then is_daily=False

        events_to_trigger_queue = events_to_trigger_queue.select_related('villagerappearsevent__villager', 'villagerappearsevent__place')

        return events_to_trigger_queue

    def get_yesterday_events_to_trigger(self, clock):
        # If we haven't triggered any events yet today, then we want to trigger any lingering events from yesterday.
        # That means any event where the day is right (daily or yesterday) and the time is > last_triggered_time

        if clock.last_triggered_day == clock.day:
            return ScheduledEvent.objects.none()

        events_of_valid_day = ScheduledEvent.objects.filter(day=clock.last_triggered_day) | \
                              ScheduledEvent.objects.filter(is_daily=True)

        events_of_valid_day_and_time = events_of_valid_day.filter(time__gt=clock.last_triggered_time)

        return events_of_valid_day_and_time

    def get_today_events_to_trigger(self, clock):
        # We want to trigger any events where the day is right (daily or today)
        # and the time is BOTH > last_triggered_time and <= now.

        events_of_valid_day = ScheduledEvent.objects.filter(day=clock.day) | \
                              ScheduledEvent.objects.filter(is_daily=True)

        events_of_valid_day_and_time = events_of_valid_day.filter(time__gt=clock.last_triggered_time, time__lte=clock.time)

        return events_of_valid_day_and_time

    def trigger_events(self, events, session):
        villager_states = VillagerState.objects.select_related('villager').filter(session=session)
        place_states = PlaceState.objects.select_related('place').filter(session=session)

        villager_results = {}

        for event in events:
            result = self.trigger_event(event, session, villager_states, place_states)
            if isinstance(result, VillagerState):
                villager_results[result.villager.name] = result  # needed for when one villager has multiple events in a time span -- only want to save the last location_state

        if len(villager_results) > 0:
            VillagerState.objects.bulk_update(villager_results.values(), ['location_state'])
            session.mark_fresh('villagerStates')

    def trigger_event(self, event, session, villager_states, place_states):
        """Triggers the given event based on the event_type"""
        settings = session.hero.settings if hasattr(session.hero, 'settings') else None

        if event.event_type == ScheduledEvent.SHOP_POPULATES:
            return self.populate_shop(event.populateshopevent, session, place_states)  # django forces PopulateShopEvent into populateshopevent

        if event.event_type == ScheduledEvent.VILLAGER_APPEARS:
            # Skip villager movement events if villagers_move is disabled, except for Trix
            villager_name = event.villagerappearsevent.villager.name
            if settings and not settings.villagers_move and villager_name != 'Trix':
                return
            return self.villager_appears(event.villagerappearsevent, villager_states, place_states)

    def populate_shop(self, event, session, place_states):
        """Fill the shop inventory for the day, which includes:
        -unlimited stock of a seed
        -limited gift (determined by items and gift quantity)
        -random merchandise (determined by merch_slots)"""

        item_tokens = []
        blocked_item_types = []
        settings = session.hero.settings if hasattr(session.hero, 'settings') else None
        use_basic_crops = settings and not settings.advanced_crops
        use_dynamic_shop = not settings or settings.dynamic_shop  # Default to dynamic if no settings

        # Mapping from advanced seeds to basic seeds
        SEED_MAPPING = {
            'Weedbulb Seed': 'Parsnip Seed',
            'Cool Lettuce Seed': 'Potato Seed',
            'Spice Carrot Seed': 'Rhubarb Seed',
            'Earth Yam Seed': 'Cauliflower Seed',
            'Lightning Artichoke Seed': 'Melon Seed',
            'Hallowed Pumpkin Seed': 'Pumpkin Seed',
            'Mythfruit Seed': 'Mythfruit Seed',
        }

        content_configs = json.loads(event.content_config_list)

        for content_config in content_configs:
            item_name = content_config.get('item_name', None)
            quantity = content_config.get('quantity', None)
            merch_type = content_config.get('merch_type', None)

            if item_name:
                # Replace advanced seeds with basic seeds if using basic crops mode
                if use_basic_crops and item_name in SEED_MAPPING:
                    item_name = SEED_MAPPING[item_name]

                item = Item.objects.get_by_natural_key(item_name)
            elif merch_type:
                # For fixed shop mode, skip random merchandise items entirely
                if not use_dynamic_shop:
                    continue

                merch_slot = MerchSlot(merch_slot_type=merch_type)
                item = self.__pick_item_given_merch_slot(merch_slot, blocked_item_types, use_basic_crops, use_dynamic_shop, event.day)
                blocked_item_types.append(item.item_type)
            else:
                raise ValueError('Content config should have item_name or merch_type')

            item_token = ItemToken(session=session, item=item, quantity=quantity)
            item_tokens.append(item_token)

        # draw for shop populate
        mythegg, mythling_state = self.mythegg_finder.draw_for_shop_populate_mythegg(session) or (None, None)

        if mythegg:
            mythling_state.mark_deferred()
            mythegg_token = ItemToken(session=session, item=mythegg, quantity=1)

            if len(item_tokens) == MAX_ITEMS:
                # replace the first non-seed item
                seed_count = len([item_token for item_token in item_tokens if item_token.item_type == SEED])
                item_tokens[seed_count] = mythegg_token
            else:
                item_tokens.insert(0, mythegg_token)

        # Get item PKs before bulk_create for re-fetching
        item_pks = [token.item_id for token in item_tokens]
        ItemToken.objects.bulk_create(item_tokens)
        # Re-fetch to get objects with PKs (bulk_create doesn't return PKs on older SQLite)
        created_tokens = ItemToken.objects.filter(session=session, item_id__in=item_pks)

        place_state = place_states.filter(place=event.shop).first()
        # Clear existing items before adding new ones to avoid MAX_ITEMS validation error
        place_state.item_tokens.clear()
        place_state.item_tokens.set(created_tokens)

        if session.location.place_type == SHOP:
            session.mark_fresh('localItemTokens')

    def __pick_item_given_merch_slot(self, merch_slot, blocked_item_types, use_basic_crops=False, use_dynamic_shop=True, day_of_week=None):
        allowed_item_types = list(set(merch_slot.potential_item_types) - set(blocked_item_types))

        # For fixed shop, use day-seeded random; for dynamic shop, use true random
        if use_dynamic_shop:
            item_type = random.choice(allowed_item_types)
        else:
            # Use day of week to seed the random generator for consistent results
            day_seed = DAY_TO_INDEX.get(day_of_week, 0) if day_of_week else 0
            rng = random.Random(day_seed + hash(merch_slot.merch_slot_type))
            item_type = rng.choice(allowed_item_types)

        rarity = merch_slot.get_rarity(item_type)

        # If picking a seed and using basic crops mode, filter to basic seeds
        if item_type == SEED and use_basic_crops:
            basic_seed_names = [
                'Parsnip Seed', 'Potato Seed', 'Rhubarb Seed', 'Cauliflower Seed',
                'Melon Seed', 'Pumpkin Seed', 'Mythfruit Seed'
            ]
            items = list(Item.objects.filter(name__in=basic_seed_names, rarity=rarity).order_by('name'))
        else:
            items = list(Item.objects.filter(item_type=item_type, rarity=rarity).order_by('name'))

        # For fixed shop, use day-seeded random; for dynamic shop, use random ordering
        if use_dynamic_shop:
            item = random.choice(items) if items else None
        else:
            # Use day of week to seed for consistent item selection
            day_seed = DAY_TO_INDEX.get(day_of_week, 0) if day_of_week else 0
            rng = random.Random(day_seed + hash(f"{item_type}_{rarity}"))
            item = rng.choice(items) if items else None

        return item

    def villager_appears(self, event, villager_states, place_states):
        villager_state = villager_states.filter(villager=event.villager).first()
        place_state = place_states.filter(place=event.place).first()

        villager_state.location_state = place_state

        return villager_state

    def reset_for_new_day(self, session):
        self.reset_villager_states(session.villager_states.all(), session)
        self.grow_crops(session.place_states.all(), session)
        self.conjure_mythegg_if_needed(session)

    def reset_villager_states(self, villager_states, session):
        villager_states.update(has_been_talked_to=False, has_been_given_gift=False)
        session.mark_fresh('villagerStates')

    def grow_crops(self, place_states, session):
        """Find all seeds/sprouts in the farm and "grow" them if they've been watered –
        ie replace them with a new item token at the next growth stage."""

        farm_state = next((state for state in place_states if state.place.place_type == FARM))
        if session.is_fresh('localItemTokens'):
            farm_state.refresh_from_db()

        item_tokens = farm_state.item_tokens.all()
        new_contents = []
        golden_mythegg_active = self.mythegg_powers.golden_active(session)
        settings = session.hero.settings if hasattr(session.hero, 'settings') else None
        use_basic_crops = settings and not settings.advanced_crops

        for token in item_tokens:
            if token.item_type not in [SEED, SPROUT] or not token.has_been_watered:
                new_contents.append(token)
                continue

            if use_basic_crops:
                # Basic crops mode: simple 2-day growth (SEED -> SPROUT -> CROP)
                new_item = self.__get_next_growth_stage_basic(token, golden_mythegg_active)
            else:
                # Advanced crops mode: variable growth times based on item properties
                new_item = token.item.get_next_growth_stage(token.days_growing, golden_mythegg_active)

            new_item_token = ItemToken.objects.create(
                session=session, item=new_item, days_growing=token.days_growing + 1
            )
            new_contents.append(new_item_token)

        farm_state.item_tokens.set(new_contents)

        if session.location.place_type == FARM:
            session.mark_fresh('localItemTokens')

    def __get_next_growth_stage_basic(self, token, grow_golden_crops):
        """Basic crops mode: all crops follow simple SEED -> SPROUT (day 1) -> CROP (day 2) pattern"""
        # Determine next type based on current type
        if token.item_type == SEED:
            next_type = SPROUT
        else:  # SPROUT
            next_type = CROP

        # Use the item's existing logic for name, price, and rarity
        next_name = token.item.get_next_name(next_type, grow_golden_crops)
        next_price = token.item.get_next_price(next_type, grow_golden_crops)
        next_rarity = token.item.get_next_rarity(next_type, grow_golden_crops)

        instance, created = Item.objects.get_or_create(
            name=next_name, item_type=next_type, price=next_price,
            rarity=next_rarity, growth_days=token.item.growth_days, effort_time=token.item.effort_time
        )

        return instance

    def conjure_mythegg_if_needed(self, session):
        mythegg, mythling_state = self.mythegg_finder.draw_for_new_day_mythegg(session) or (None, None)

        if not mythegg:
            return

        farmhouse_state = next((state for state in session.place_states.all() if state.place.is_farmhouse))

        if farmhouse_state.is_full:
            mythling_state.mark_deferred().save()
        else:
            self.mythegg_finder.award_mythegg(session, farmhouse_state, mythegg, mythling_state)
            self.mythegg_finder.create_overnight_mythegg_message(session)
            session.mark_fresh('localItemTokens')

    def sleep_through_the_night(self, clock, session):
        """Advances the clock to dawn or midday, depending on whether the hero is in bed or not,
        and returns a message"""
        hero_state = session.hero_state

        if clock.time > DAWN:
            raise Exception(f'Time on the new day should be before dawn, not {clock.time}')

        if hero_state.is_in_bed or session.location.is_farmhouse:
            hero_state.is_in_bed = False
            hero_state.save()

            clock.advance(clock.minutes_to_dawn)
            sleep_message = "You got a good night's sleep and wake up at dawn."
            is_error = False
        else:
            clock.advance(clock.minutes_to_overslept_time)
            sleep_message = "⚠️ You passed out at midnight and overslept! You're just now waking up."
            is_error = True

        clock.is_new_day = False
        clock.save()

        session.messages.create(text=sleep_message, is_error=is_error)

        session.mark_fresh('clock', 'messages')

    def trigger_game_over(self, session):
        hero_state = session.hero_state
        hero = session.hero

        is_new_high_score = hero.set_high_score(hero_state.score)

        if is_new_high_score:
            hero.boost_level += 1
            hero.luck_level = 0
        else:
            hero.luck_level += 7

        hero.save()

        end_of_game_message = self.get_end_of_game_message(hero_state, is_new_high_score)

        return session.reset_session_state(end_of_game_message)

    def trigger_kys(self, session):
        days_completed = DAY_TO_INDEX[session.clock.day]
        session.hero.luck_level += days_completed
        session.hero.save()

        session.reset_session_state(KYS_MESSAGE)

    def get_end_of_game_message(self, hero_state, is_new_high_score):
        start = f'You ended the week with {hero_state.koin_earned} ⚜️ and ' \
                f'{hero_state.hearts_earned} ❤️ for a score of {hero_state.score}.'

        if is_new_high_score:
            middle = f"🎉 That's a new high score! Feeling your movements quicken slightly with the shifting of time,"

        else:
            middle = f"That doesn't beat your high score – but a whisper on the breeze tells you "\
                    "your luck is about to change. Feeling lucky,"

        end = "you enter the time loop to begin the week again."

        return f'{start} {middle} {end}'

    def __is_game_over(self, clock):
        return clock.is_new_day and clock.day == FIRST_DAY
