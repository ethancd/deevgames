from django.db import models

from ._constants import DIRECTIONS, KOIN_SIGN, FISHING_DESCRIPTION, MINING_DESCRIPTION, FORAGING_DESCRIPTION, \
    EXIT_DESCRIPTION, ITEM_ENTITY, VILLAGER_ENTITY, PLACE_ENTITY, GIFT_ENTITY, MONEY_TYPE, TIME_TYPE


class Action(models.Model):
    TRAVEL = 'TRAVEL'
    TALK = 'TALK'
    GIVE = 'GIVE'
    WATER = 'WATER'
    PLANT = 'PLANT'
    HARVEST = 'HARVEST'
    BUY = 'BUY'
    SELL = 'SELL'
    STOW = 'STOW'
    RETRIEVE = 'RETRIEVE'
    GATHER = 'GATHER'
    SLEEP = 'SLEEP'

    ENTER = 'ENTER'
    EXIT = 'EXIT'

    FISHING = 'FISHING'
    MINING = 'MINING'
    FORAGING = 'FORAGING'

    ACTION_EMOJIS = {
        TRAVEL: {
            TRAVEL: '🚶',
            ENTER: '🏠',
            EXIT: '🚪',
        },
        TALK: '💬',
        GIVE: '🎁',
        WATER: '💧',
        PLANT: '🌰',
        HARVEST: '🌾',
        BUY: '🛒',
        SELL: '💰',
        STOW: '📦',
        RETRIEVE: '🎒',
        GATHER: {
            FISHING: '🎣',
            MINING: '⛏',
            FORAGING: '🌲',
        },
        SLEEP: '💤',
    }

    ACTION_TYPES = [
        (TRAVEL, 'Travel'),
        (TALK, 'Talk'),
        (GIVE, 'Give'),
        (PLANT, 'Plant'),
        (WATER, 'Water'),
        (HARVEST, 'Harvest'),
        (BUY, 'Buy'),
        (SELL, 'Sell'),
        (STOW, 'Stow'),
        (RETRIEVE, 'Retrieve'),
        (GATHER, 'Gather'),
        (SLEEP, 'Sleep'),
    ]

    MIN = 'MINUTE'
    HOUR = 'HOUR'
    KOIN = 'KOIN'

    HOUR_ABBR = 'hr'
    MIN_SIGN = '🕒'

    COST_UNITS = [
        (MIN, MIN_SIGN),
        (HOUR, HOUR_ABBR),
        (KOIN, KOIN_SIGN),
    ]

    TRIVIAL = 'TRIVIAL'
    TRIVIAL_PLUS = 'TRIVIAL_PLUS'
    TRIVIAL_PLUS_PLUS = 'TRIVIAL_PLUS_PLUS'
    SMALL_MINUS = 'SMALL_MINUS'
    SMALLISH = 'SMALLISH'
    SMALL = 'SMALL'
    SMALL_PLUS = 'SMALL_PLUS'
    SMALL_PLUS_PLUS = 'SMALL_PLUS_PLUS'
    MEDIUM_MINUS = 'MEDIUM_MINUS'
    MEDIUM = 'MEDIUM'
    MEDIUM_PLUS = 'MEDIUM_PLUS'
    LONG_MINUS = 'LONG_MINUS'
    LONG = 'LONG'

    MINUTES_TO_WAIT_CLASS = {
        5: TRIVIAL,
        10: TRIVIAL_PLUS,
        15: TRIVIAL_PLUS_PLUS,
        20: SMALL_MINUS,
        25: SMALLISH,
        30: SMALL,
        40: SMALL_PLUS,
        45: SMALL_PLUS_PLUS,
        50: MEDIUM_MINUS,
        60: MEDIUM,
        70: MEDIUM_PLUS,
        80: LONG_MINUS,
        90: LONG,
    }

    WAIT_CLASSES = [
        (TRIVIAL, 'trivial'),
        (TRIVIAL_PLUS, 'trivialPlus'),
        (TRIVIAL_PLUS_PLUS, 'trivialPlusPlus'),
        (SMALL_MINUS, 'smallMinus'),
        (SMALLISH, 'smallish'),
        (SMALL, 'small'),
        (SMALL_PLUS, 'smallPlus'),
        (SMALL_PLUS_PLUS, 'smallPlusPlus'),
        (MEDIUM_MINUS, 'mediumMinus'),
        (MEDIUM, 'medium'),
        (MEDIUM_PLUS, 'mediumPlus'),
        (LONG_MINUS, 'longMinus'),
        (LONG, 'long')
    ]

    TIME_UNITS = [MIN, HOUR]
    MONEY_UNITS = [KOIN]

    action_type = models.CharField(max_length=8, choices=ACTION_TYPES)
    description = models.CharField(max_length=255)

    cost_amount = models.IntegerField(null=True, blank=True)
    cost_unit = models.CharField(max_length=6, choices=COST_UNITS, null=True, blank=True)
    cost_wait_class = models.CharField(max_length=17, choices=WAIT_CLASSES, null=True, blank=True)

    target_item = models.ForeignKey('ItemToken', on_delete=models.CASCADE, null=True, blank=True)
    target_villager = models.ForeignKey('Villager', on_delete=models.CASCADE, null=True, blank=True)
    target_place = models.ForeignKey('Place', on_delete=models.CASCADE, null=True, blank=True)

    direction = models.CharField(max_length=5, choices=DIRECTIONS, null=True, blank=True)

    log_statement = models.CharField(
        max_length=255)  # this should really be generated from the action_type, direct objects, etc

    def __str__(self):
        return self.description

    def serialize(self):
        return {
            'description': self.description,
            'costAmount': self.cost_amount,
            'costType': self.cost_type,
            'waitClass': self.get_cost_wait_class_display(),
            'emoji': self.emoji,
            'entityType': self.entity_type,
            'entityId': self.entity_id,
            'giftReceiverId': self.gift_receiver_id,
            'uniqueDigest': self.unique_digest,
        }

    @property
    def emoji(self):
        if self.action_type == self.GATHER:
            gather_type = self.get_gather_type_of_action()
            return self.ACTION_EMOJIS[self.GATHER][gather_type]
        elif self.action_type == self.TRAVEL:
            travel_type = self.get_travel_type_of_action()
            return self.ACTION_EMOJIS[self.TRAVEL][travel_type]
        else:
            return self.ACTION_EMOJIS[self.action_type]

    def get_gather_type_of_action(self):
        GATHER_DESCRIPTION_MAP = {
            FISHING_DESCRIPTION: self.FISHING,
            MINING_DESCRIPTION: self.MINING,
            FORAGING_DESCRIPTION: self.FORAGING,
        }

        return GATHER_DESCRIPTION_MAP[self.description]

    def get_travel_type_of_action(self):
        if self.description == EXIT_DESCRIPTION:
            return self.EXIT
        elif 'Enter' in self.description:
            return self.ENTER
        else:
            return self.TRAVEL

    @property
    def display_cost(self):
        if not self.cost_amount or not self.cost_unit:
            return ''

        if self.is_cost_in_money():
            return self.get_cost_unit_display() + str(self.cost_amount)
        else:
            return str(self.cost_amount) + self.get_cost_unit_display()

    @property
    def unique_digest(self):
        pks = [f'{target.pk}' for target in [self.target_item, self.target_villager, self.target_place] if target]

        return f'{self.action_type}-{"-".join(pks)}'

    @property
    def entity_id(self):
        pks = [f'{target.pk}' for target in [self.target_item, self.target_villager, self.target_place] if target]

        if len(pks) == 0:
            return None
        if len(pks) == 1:
            return pks[0]
        if len(pks) > 1:
            # gift action. TBD what to do here, but we can return just item-id for now,
            # and add an extra villagers-id property or something later
            return pks[0]

    @property
    def entity_type(self):
        entity_types = []

        if self.target_item:
            entity_types.append(ITEM_ENTITY)
        if self.target_villager:
            entity_types.append(VILLAGER_ENTITY)
        if self.target_place:
            entity_types.append(PLACE_ENTITY)

        if len(entity_types) == 0:
            return None
        if len(entity_types) == 1:
            return entity_types[0]
        if len(entity_types) > 1:
            # again, gift action. TBD what to do here, maybe a bespoke entity type, hmm
            return GIFT_ENTITY

    @property
    def gift_receiver_id(self):
        if self.action_type != Action.GIVE:
            return
        else:
            return self.target_villager.pk

    @property
    def cost_type(self):
        if self.cost_unit in self.MONEY_UNITS:
            return MONEY_TYPE
        elif self.cost_unit in self.TIME_UNITS:
            return TIME_TYPE
        else:
            return None

    @property
    def target_count(self):
        return sum(1 for t in [self.target_item, self.target_villager, self.target_place] if t)

    def is_cost_in_money(self):
        return self.cost_unit in self.MONEY_UNITS
