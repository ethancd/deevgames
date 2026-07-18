from django.db import models

from . import _constants


class MerchSlot(models.Model):
    merch_slot_type = models.CharField(max_length=7, choices=_constants.MERCH_SLOT_TYPES)

    def get_rarity(self, item_type):
        if item_type in _constants.BASIC_ITEM_TYPES:
            return self.basic_rarity
        elif item_type in _constants.PREMIUM_ITEM_TYPES:
            return self.premium_rarity
        else:
            raise ValueError(f'item_type {item_type} not found in basic or premium item types')

    @property
    def potential_item_types(self):
        if self.merch_slot_type == _constants.MINOR:
            return _constants.BASIC_ITEM_TYPES
        elif self.merch_slot_type == _constants.SUPREME:
            return _constants.PREMIUM_ITEM_TYPES
        else:
            return _constants.BASIC_ITEM_TYPES + _constants.PREMIUM_ITEM_TYPES

    @property
    def basic_rarity(self):
        return _constants.BASIC_MERCH_TYPE_TO_RARITY_MAPPING[self.merch_slot_type]

    @property
    def premium_rarity(self):
        return _constants.PREMIUM_MERCH_TYPE_TO_RARITY_MAPPING[self.merch_slot_type]

    @classmethod
    def get_or_create_from_string(cls, string):
        # in our data intake, expect to have inputs like 'minor' or 'major'
        # so get_or_create a new instance from a string
        merch_type = string.upper()

        if merch_type not in dict(_constants.MERCH_SLOT_TYPES):
            raise ValueError(f'invalid merch type: {merch_type}')

        return cls.objects.get_or_create(merch_slot_type=merch_type)