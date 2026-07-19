from django.db import models

from ._constants import DEFAULT_PORTRAIT, LUCK_DENOMINATOR, CROP, MINING_ITEM_TYPES, FISHING_ITEM_TYPES, \
    FORAGING_ITEM_TYPES
from .farmer_portrait import FarmerPortrait


class Hero(models.Model):
    name = models.CharField(max_length=16, default='New Farmer')
    portrait = models.ForeignKey(FarmerPortrait, on_delete=models.SET_DEFAULT, default=FarmerPortrait.get_default_pk)
    achievements = models.ManyToManyField('Achievement', blank=True)
    knowledge = models.ManyToManyField('Knowledge', blank=True)

    high_score = models.IntegerField(default=0)
    boost_level = models.IntegerField(default=0)
    luck_level = models.IntegerField(default=0)

    @classmethod
    def get_default_pk(cls):
        new_hero = cls.objects.create()
        return new_hero.pk

    def set_high_score(self, new_score):
        if new_score > self.high_score:
            self.high_score = new_score
            self.save()
            return True
        else:
            return False

    @property
    def is_default_name(self):
        return self.name == 'New Farmer'

    @property
    def is_default_portrait(self):
        if not self.portrait:
            return False

        return self.portrait.image_path == DEFAULT_PORTRAIT

    @property
    def image_url(self):
        if not self.portrait:
            return None

        return self.portrait.image_url

    @property
    def luck_percent(self):
        if self.luck_level == 0:
            return ''

        luck_float = self.luck_level / LUCK_DENOMINATOR

        if self.luck_level % 2 == 0:
            return '{:.0%}'.format(luck_float)
        else:
            return '{:.1%}'.format(luck_float)


class HeroState(models.Model):
    session = models.OneToOneField('Session', on_delete=models.CASCADE, primary_key=True, related_name='hero_state')
    hero = models.ForeignKey('Hero', on_delete=models.CASCADE, default=Hero.get_default_pk, null=True)

    koin_earned = models.IntegerField(default=0)
    hearts_earned = models.IntegerField(default=0)
    is_in_bed = models.BooleanField(default=False)

    farming_koin_earned = models.IntegerField(default=0)
    mining_koin_earned = models.IntegerField(default=0)
    fishing_koin_earned = models.IntegerField(default=0)
    foraging_koin_earned = models.IntegerField(default=0)

    farming_intake = models.IntegerField(default=0)
    mining_intake = models.IntegerField(default=0)
    fishing_intake = models.IntegerField(default=0)
    foraging_intake = models.IntegerField(default=0)

    mining_attempts = models.IntegerField(default=0)
    fishing_attempts = models.IntegerField(default=0)
    foraging_attempts = models.IntegerField(default=0)

    depth_weighted_hearts_earned = models.IntegerField(default=0)
    mytheggs_found = models.IntegerField(default=0)


    def increment_koin_earned(self, amount, item_type):
        self.koin_earned += amount

        if item_type == CROP:
            self.farming_koin_earned += amount
        if item_type in MINING_ITEM_TYPES:
            self.mining_koin_earned += amount
        if item_type in FISHING_ITEM_TYPES:
            self.fishing_koin_earned += amount
        if item_type in FORAGING_ITEM_TYPES:
            self.foraging_koin_earned += amount

    def increment_gathering_intake(self, item):
        if item.item_type in MINING_ITEM_TYPES:
            self.mining_intake += item.price
            self.mining_attempts += 1
        if item.item_type in FISHING_ITEM_TYPES:
            self.fishing_intake += item.price
            self.fishing_attempts += 1
        if item.item_type in FORAGING_ITEM_TYPES:
            self.foraging_intake += item.price
            self.foraging_attempts += 1

    def increment_hearts_earned(self, hearts_gained, affinity_tier):
        self.hearts_earned += hearts_gained

        i = 0
        while i < hearts_gained:
            self.depth_weighted_hearts_earned += (affinity_tier - i)
            i += 1

        return self

    def __str__(self):
        return 'Hero ' + self.session.abbr_key_tag()

    def serialize(self):
        return {
            'score': self.score,
            'highScore': self.hero.high_score,
            'koinEarned': self.koin_earned,
            'heartsEarned': self.hearts_earned,
            'mytheggsFound': self.mytheggs_found,
            'name': self.hero.name,
            'isDefaultName': self.hero.is_default_name,
            'isDefaultPortrait': self.hero.is_default_portrait,
            'imageUrl': self.hero.image_url,
            'boostLevel': self.hero.boost_level,
            'luckPercent': self.hero.luck_percent,
        }

    @property
    def score(self):
        base_score = round(self.koin_earned * self.hearts_earned * 10 * (1 + self.mytheggs_found / 10))

        # Apply settings multiplier if settings exist
        if hasattr(self.hero, 'settings'):
            return round(base_score * self.hero.settings.score_multiplier)

        return base_score
