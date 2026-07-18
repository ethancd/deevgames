from django.db import models
from django.templatetags.static import static
from django.core.validators import MinValueValidator, MaxValueValidator

from ._constants import PLACE_TYPES, FARM, TOWN, MOUNTAIN, FOREST, BEACH, HOME, MINUTES_IN_A_DAY, \
    IMAGE_PREFIX, PLACE_IMAGE_DIR, SHOP, ACTIVITY_ICON_PATHS, WILD_TYPES, ITEM_POOL_TYPE_MAP, MAX_ITEMS
from .action import Action
from .clock import Clock
from .item import Item


class PlaceManager(models.Manager):
    def get_by_natural_key(self, name):
        return self.get(name=name)


class Place(models.Model):
    name = models.CharField(max_length=255, unique=True)
    image_path = models.CharField(max_length=255, default='farm-kz.jpeg')

    place_type = models.CharField(max_length=8, choices=PLACE_TYPES, default=TOWN)
    has_inventory = models.BooleanField(default=False)

    item_pool = models.ManyToManyField('Item', blank=True, related_name='pool_locations')

    objects = PlaceManager()

    @classmethod
    def get_default_pk(cls):
        place, created = cls.objects.get_or_create(name='The Farm', place_type=FARM, has_inventory=True)
        return place.pk

    @classmethod
    def get_default_shop_pk(cls):
        place, created = cls.objects.get_or_create(name='mom and pop shop', place_type=SHOP, has_inventory=True)
        return place.pk

    def __str__(self):
        return self.name

    def serialize(self):
        return {
            'name': self.name,
            'imageUrl': self.image_url,
            'id': self.id,
            'hasInventory': self.has_inventory,
            'arrows': self.get_arrows(),
            'activities': self.get_activities()
        }

    def get_arrows(self):
        arrows = []

        for bridge in self.bridges_as_1.all():
            new_arrow = {'direction': bridge.direction_2, 'id': bridge.place_2.id}
            arrows.append(new_arrow)

        for bridge in self.bridges_as_2.all():
            new_arrow = {'direction': bridge.direction_1, 'id': bridge.place_1.id}
            arrows.append(new_arrow)

        return arrows

    def get_activities(self):
        activities = []

        if self.place_type in WILD_TYPES:

            if self.place_type == FOREST:
                image_path = ACTIVITY_ICON_PATHS['BASKET']
            if self.place_type == MOUNTAIN:
                image_path = ACTIVITY_ICON_PATHS['PICKAXE']
            if self.place_type == BEACH:
                image_path = ACTIVITY_ICON_PATHS['FISHING_ROD']

            activities.append({'actionType': Action.GATHER, 'imageUrl': static(f'{IMAGE_PREFIX}/{image_path}')})

        try:
            building = self.building
            if building.surround is not None:
                image_path = ACTIVITY_ICON_PATHS['DOOR']

                activities.append({
                    'actionType': Action.TRAVEL,
                    'id': building.surround.id,
                    'imageUrl': static(f'{IMAGE_PREFIX}/{image_path}')
                })
        except Building.DoesNotExist:
            pass

        if self.is_farmhouse:
            image_path = ACTIVITY_ICON_PATHS['BED']
            activities.append({'actionType': Action.SLEEP, 'imageUrl': static(f'{IMAGE_PREFIX}/{image_path}')})

        return activities


    @property
    def image_url(self):
        if not self.image_path:
            return None

        return static(f'{IMAGE_PREFIX}/{PLACE_IMAGE_DIR}/{self.image_path}')

    def save(self, *args, **kwargs):
        if self._state.adding:
            # save place state first so we can have id and assign item_pool
            super().save(*args, **kwargs)
            self.populate_item_pool()
        else:
            super().save(*args, **kwargs)

    @property
    def is_farmhouse(self):
        try:
            is_building_on_farm = self.building.surround.pk == Place.get_default_pk()
            return is_building_on_farm and self.place_type == HOME
        except Building.DoesNotExist:
            return False

    def populate_item_pool(self):
        """ Populates the item pool by filtering on item types based on this place type. """
        item_types = ITEM_POOL_TYPE_MAP.get(self.place_type)
        if item_types is None:
            return

        all_items_of_correct_types = Item.objects.filter(item_type__in=item_types)
        self.item_pool.set(all_items_of_correct_types)


class Building(Place):
    surround = models.ForeignKey(Place, on_delete=models.CASCADE, related_name='buildings')

    over = models.IntegerField(validators=[MinValueValidator(1), MaxValueValidator(3)], default=2)
    down = models.IntegerField(validators=[MinValueValidator(1), MaxValueValidator(3)], default=2)

    opening_time = models.IntegerField(null=True, blank=True, validators=[MinValueValidator(0), MaxValueValidator(MINUTES_IN_A_DAY - 1)])
    closing_time = models.IntegerField(null=True, blank=True, validators=[MinValueValidator(0), MaxValueValidator(MINUTES_IN_A_DAY - 1)])


    def __str__(self):
        return super().__str__()

    def serialize(self):
        building_data = {
            'coords': self.coordinates,
            'openingTime': self.opening_time,
            'closingTime': self.closing_time,
            'openingTimeDisplay': self.get_time_display(self.opening_time),
            'closingTimeDisplay': self.get_time_display(self.closing_time)
        }
        combined_data = building_data | super().serialize()

        return combined_data

    @property
    def coordinates(self):
        return {
            'over': self.over,
            'down': self.down
        }

    def is_open(self, time):
        if not self.opening_time or not self.closing_time:
            return True
        else:
            return self.opening_time <= time < self.closing_time

    def get_time_display(self, time):
        if not time:
            return ""

        return Clock.convert_time_to_display(time)

    class Meta:
        ordering = ['name']


class PlaceState(models.Model):
    session = models.ForeignKey('Session', on_delete=models.CASCADE, related_name='place_states')
    place = models.ForeignKey(Place, on_delete=models.CASCADE, related_name='states')

    item_tokens = models.ManyToManyField('ItemToken', blank=True)
    # would be nice to have a validator that said "if placeState.place.has_inventory == False, then item_tokens has to be empty" basically

    @property
    def is_full(self):
        return self.item_tokens.count() >= MAX_ITEMS

    def __str__(self):
        return f'{self.place} state ' + self.session.abbr_key_tag()
