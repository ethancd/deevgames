import random

from ..models import ItemToken, MythlingState, Mythling, Achievement
from ..models._constants import MYTHLING_TYPE_TO_DRAW_VARIABLE, MAX_LUCK_LEVEL, LUCK_DENOMINATOR, SPARKLY, RAINBOW, \
    GOLDEN, FIND_MYTHEGG


class MytheggFinder:
    def draw_for_hearts_gained_mythegg(self, session, villager_state, hearts_gained):
        if hearts_gained <= 0:
            return

        luck_percent = min(session.hero.luck_level, MAX_LUCK_LEVEL) / LUCK_DENOMINATOR
        mythegg_to_draw_for = Mythling.objects.get(mythling_type=SPARKLY)

        draw_count = 0
        i = 0
        while i < hearts_gained:
            draw_count += (villager_state.affinity_tier - i)
            i += 1
            # so if you gain 1 heart and get up to tier 3, you get 3 draws
            # if you gain 2 hearts and get up to tier 4, you get 4 + 3 draws

        return self.draw_for_mythegg(session, mythegg_to_draw_for, luck_percent, draw_count)

    def draw_for_new_day_mythegg(self, session):
        if session.hero_state.mytheggs_found < 5:
            return

        mythegg_to_draw_for = Mythling.objects.get(mythling_type=RAINBOW)
        return self.draw_for_mythegg(session, mythegg_to_draw_for, is_guaranteed=True)

    def draw_for_shop_populate_mythegg(self, session):
        luck_percent = min(session.hero.luck_level, MAX_LUCK_LEVEL) / LUCK_DENOMINATOR
        mythegg_to_draw_for = Mythling.objects.get(mythling_type=GOLDEN)

        return self.draw_for_mythegg(session, mythegg_to_draw_for, luck_percent)

    def draw_for_mythegg(self, session, mythegg, luck_percent=0, draw_count=1, is_guaranteed=False):
        if not session.hero.knowledge.filter(mytheggknowledge__mythegg=mythegg).exists():
            return

        mythling_state, created = MythlingState.objects.get_or_create(session=session, mythling=mythegg)
        if mythling_state.has_been_found:
            return
        if mythling_state.deferred_acquire or is_guaranteed:
            return mythegg, mythling_state

        draw_chance = self.get_mythegg_draw_chance(mythegg, session.hero_state, luck_percent)

        i = 0
        while i < draw_count:
            if random.random() < draw_chance:
                return mythegg, mythling_state
            i += 1

    def get_mythegg_draw_chance(self, mythegg, hero_state, luck_percent):
        base_value_attr = MYTHLING_TYPE_TO_DRAW_VARIABLE[mythegg.mythling_type]

        if hasattr(hero_state, base_value_attr):
            base_value = getattr(hero_state, base_value_attr)
        else:
            raise ValueError(f'Expected hero_state to have {base_value_attr} attr for mythegg draw')

        draw_chance = base_value * mythegg.acquisition_increase_step * (1 + luck_percent)

        return draw_chance

    def award_mythegg(self, session, item_destination, mythegg, mythling_state):
        item_destination.item_tokens.add(ItemToken.objects.create(session=session, item=mythegg))

        self.__mark_mythegg_awarded(session, mythegg, mythling_state)

    def award_mythegg_token(self, session, item_destination, mythegg_token):
        item_destination.item_tokens.add(mythegg_token)

        mythling_state, created = MythlingState.objects.get_or_create(session=session, mythling=mythegg_token.item)
        self.__mark_mythegg_awarded(session, mythegg_token.item.mythling, mythling_state)

    def __mark_mythegg_awarded(self, session, mythegg, mythling_state):
        session.mark_fresh('hero', 'inventory')

        session.hero_state.mytheggs_found += 1
        session.hero_state.save()

        mythling_state.mark_found().save()

        self.__check_find_mythegg_achievements(session, mythegg, mythling_state)

    def __check_find_mythegg_achievements(self, session, mythegg, mythling_state):
        newly_notched_count = Achievement.check_triggered_achievements(
            FIND_MYTHEGG, session,
            mythegg=mythegg, mythling_state=mythling_state, hero_state=session.hero_state, clock=session.clock
        )

        if newly_notched_count > 0:
            session.mark_fresh('achievements')

    def create_overnight_mythegg_message(self, session):
        if session.location.is_farmhouse:
            session.messages.create(text="During the night, you dream of strange sounds and stranger colors. When you wake up, you find a mythegg waiting for you!")
        else:
            session.messages.create(text="You get the strangest feeling... like there's something magical waiting for you at home.")

    def mark_mythegg_token_given_away(self, session, mythegg_token):
        mythling_state, created = MythlingState.objects.get_or_create(session=session, mythling=mythegg_token.item)
        mythling_state.mark_given_away().save()
