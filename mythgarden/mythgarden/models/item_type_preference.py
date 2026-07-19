from django.db import models

from ._constants import ITEM_TYPES, CROP, FLOWER, BERRY, SEED, SPROUT, FISH, HERB, GIFT, VALENCES, LIKE, DISLIKE, \
    NEUTRAL, HATE, LOVE, MYTHEGG


class ItemTypePreference(models.Model):
    UNIVERSAL_PREFERENCES = {
        CROP: LIKE,
        FLOWER: LIKE,
        BERRY: LIKE,
        SEED: HATE,
        SPROUT: DISLIKE,
        FISH: DISLIKE,
        HERB: DISLIKE,
        GIFT: LOVE,
        MYTHEGG: LOVE
    }

    item_type = models.CharField(max_length=8, choices=ITEM_TYPES)
    valence = models.CharField(max_length=7, choices=VALENCES, default=NEUTRAL)

    def __str__(self):
        return f'preference: {self.get_valence_display()}s {self.get_item_type_display()}s'

    @classmethod
    def get_or_create_from_string(cls, string):
        # in our data intake, expect to have inputs like 'BERRY: LOVE'
        # so get_or_create a new instance from a string
        item_type, valence = string.split(': ')
        item_type = item_type.upper()
        valence = valence.upper()

        if item_type not in dict(ITEM_TYPES):
            raise ValueError(f'invalid item type: {item_type}')

        if valence not in dict(VALENCES):
            raise ValueError(f'invalid valence: {valence}')

        return cls.objects.get_or_create(item_type=item_type, valence=valence)
