from django.db import models

from . import Mythling, MythlingState
from .villager import Villager, VillagerState
from .hero import Hero
from .place import Place, PlaceState
from ..static_helpers import generate_uuid

from ._constants import WELCOME_MESSAGE, FIRST_DAY


class Session(models.Model):
    key = models.CharField(max_length=32, primary_key=True, default=generate_uuid)
    _location = models.ForeignKey(Place, on_delete=models.SET_NULL, null=True, default=Place.get_default_pk)
    hero = models.ForeignKey('Hero', on_delete=models.CASCADE, related_name='current_session', null=True, default=Hero.get_default_pk)
    current_dialogue = models.ForeignKey('DialogueLine', on_delete=models.SET_NULL, null=True, blank=True)

    is_first_session = models.BooleanField(default=False)
    skip_post_save_signal = models.BooleanField(default=False)
    initial_message_text = models.CharField(max_length=255, default=WELCOME_MESSAGE)
    game_over = models.BooleanField(default=False)
    # Buying/selling can take no time, so the clock cannot identify an untouched week.
    has_taken_action = models.BooleanField(default=False)

    fresh = models.JSONField(default=dict, blank=True)

    def mark_fresh(self, *args):
        for arg in args:
            self.fresh[arg] = True

    def is_fresh(self, key):
        return self.fresh.get(key)

    def clear_fresh(self):
        self.fresh = {}

    def get_fresh_keys(self):
        return [key for key, value in self.fresh.items() if value]

    @property
    def location(self):
        if not self._location:
            self._location = Place.objects.get(pk=Place.get_default_pk())
            print(self._location)

        return self._location

    @location.setter
    def location(self, value):
        self._location = value

    @property
    def location_state(self):
        # session.place_states.place is prefetched
        for place_state in self.place_states.all():
            if place_state.place.name == self.location.name:
                # don't worry, place names are unique.
                # just matching by name so we don't have to grab the place object for self.location if it's a building
                return place_state

    def get_place_state(self, place):
        if not place:
            return None

        return self.place_states.get(place=place)

    @property
    def occupant_states(self):
        return self.location_state.occupants.all()

    def get_villager_state(self, villager):
        # session.villager_states.villager is prefetched
        if not villager:
            return None

        for villager_state in self.villager_states.all():
            if villager_state.villager == villager:
                if self.is_fresh('villagerStates') or self.is_fresh('speaker'):
                    villager_state.refresh_from_db()

                return villager_state

    @property
    def local_item_tokens(self):
        return self.location_state.item_tokens.all()

    @property
    def high_score(self):
        return self.hero.high_score

    @property
    def boost_level(self):
        return self.hero.boost_level

    @property
    def hero_name(self):
        return self.hero.name

    def reset_session_state(self, end_of_game_message):
        key = self.key
        hero = self.hero

        delete_response = self.delete()
        print(delete_response)

        return Session.objects.create(key=key, hero=hero, initial_message_text=end_of_game_message)

    def populate_place_states(self):
        place_states = []

        for place in list(Place.objects.all()):
            place_states.append(PlaceState(session=self, place=place))

        PlaceState.objects.bulk_create(place_states)
        # Re-fetch to get objects with PKs (bulk_create doesn't return PKs on older SQLite)
        return list(PlaceState.objects.filter(session=self).select_related('place'))

    def populate_villager_states(self, place_states):
        villager_states = []
        place_to_state_dict = {state.place.pk: state for state in place_states}

        for villager in list(Villager.objects.all()):
            place_id = villager.home_id
            if place_id is None and not self.hero.settings.villagers_move:
                # Roaming villagers also need a permanent, reachable spot in
                # stationary mode. Use their first Monday/daily appearance.
                from .event import VillagerAppearsEvent
                appearance = VillagerAppearsEvent.objects.filter(
                    models.Q(day=FIRST_DAY) | models.Q(is_daily=True),
                    villager=villager, place__isnull=False,
                ).order_by('time', 'pk').first()
                place_id = appearance.place_id if appearance else self.location.pk

            location_state = place_to_state_dict.get(place_id)
            villager_state = VillagerState(session=self, villager=villager, location_state=location_state)

            villager_states.append(villager_state)

        return VillagerState.objects.bulk_create(villager_states)

    def populate_mythling_states(self):
        mythling_states = []

        for mythling in list(Mythling.objects.all()):
            mythling_states.append(MythlingState(session=self, mythling=mythling))

        return MythlingState.objects.bulk_create(mythling_states)

    def abbr_key_tag(self):
        return f'({self.key[:8]}...)'

    def __str__(self):
        return 'Session ' + self.abbr_key_tag()
