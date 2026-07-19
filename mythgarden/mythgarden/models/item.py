from django.db import models
from django.templatetags.static import static

from ._constants import ITEM_EMOJIS, COMMON, GIFT, ITEM_TYPES, RARITY_CHOICES, SEED, SPROUT, CROP, \
    CROP_PROFIT_MULTIPLIER, MYTHLING_TYPES, MYTHLING_GROWTH_STAGES, IMAGE_PREFIX, MYTHLING_PORTRAIT_DIR, \
    MYTHLING_TYPE_TO_DRAW_VARIABLE, GOLD_CROP_PREFIX, GOLD_CROP_PROFIT_MULTIPLIER, RARITY_TO_INDEX, RARITIES


class ItemManager(models.Manager):
    def get_by_natural_key(self, name):
        return self.get(name=name)


class Item(models.Model):
    name = models.CharField(max_length=255, unique=True)
    item_type = models.CharField(max_length=8, choices=ITEM_TYPES, default=GIFT)
    price = models.IntegerField(default=1)
    rarity = models.CharField(max_length=8, choices=RARITY_CHOICES, default=COMMON)

    growth_days = models.IntegerField(null=True, blank=True)  # only defined for plants (seeds/sprouts/crops) & mytheggs
    effort_time = models.IntegerField(null=True, blank=True)  # only defined for plants (seeds/sprouts/crops) & mytheggs

    objects = ItemManager()

    def __str__(self):
        return self.name

    def serialize(self):
        return {
            'name': self.name,
            'rarity': self.get_rarity_display(),
        }

    @property
    def emoji(self):
        return ITEM_EMOJIS[self.item_type]

    def get_next_growth_stage(self, days_growing, grow_golden_crops):
        """Get the next item that a seed/sprout grows into, taking into account how long this item takes to grow
        and how many days it's been in the ground"""
        
        next_type = self.get_next_type(days_growing)
        next_name = self.get_next_name(next_type, grow_golden_crops)
        next_price = self.get_next_price(next_type, grow_golden_crops)
        next_rarity = self.get_next_rarity(next_type, grow_golden_crops)

        instance, created = Item.objects.get_or_create(
                                name=next_name, item_type=next_type, price=next_price,
                                rarity=next_rarity, growth_days=self.growth_days, effort_time=self.effort_time
                            )

        return instance

    def get_next_type(self, days_growing):
        if days_growing >= self.growth_days:
            return CROP
        else:
            return SPROUT

    def get_next_name(self, next_type, grow_golden_crops):
        # could have some Item.name validation that ensures that the name ends with the item type for seed/sprout/crop
        # e.g. Parsnip Seed -> Parsnip Sprout -> Parsnip

        curr_type_name = dict(ITEM_TYPES)[self.item_type]
        next_type_name = dict(ITEM_TYPES)[next_type]
        
        if next_type == CROP:
            crop_name = self.name.replace(f' {curr_type_name}', '')
            if grow_golden_crops:
                return f'{GOLD_CROP_PREFIX} {crop_name.split()[-1]}'
            else:
                return crop_name
        else:
            return self.name.replace(curr_type_name, next_type_name)

    def get_next_price(self, next_type, grow_golden_crops):
        # seed -> sprout is mostly irrelevant, so goal is to make seed -> crop hit the CROP_PROFIT_MULTIPLIER
        # let's be ridiculous and say that seeds and sprouts are =, and then you multiply when you get to the crop

        if next_type == CROP:
            if grow_golden_crops:
                return self.price * GOLD_CROP_PROFIT_MULTIPLIER
            else:
                return self.price * CROP_PROFIT_MULTIPLIER
        else:
            return self.price

    def get_next_rarity(self, next_type, grow_golden_crops):
        if next_type == CROP and grow_golden_crops:
            # rarity += 1
            return RARITIES[RARITY_TO_INDEX[self.rarity] + 1]
        else:
            return self.rarity


class ItemToken(models.Model):
    session = models.ForeignKey('Session', on_delete=models.CASCADE, related_name='item_tokens')
    item = models.ForeignKey('Item', on_delete=models.CASCADE, related_name='tokens')
    bought_from_store = models.BooleanField(default=False)
    quantity = models.IntegerField(null=True, blank=True)

    has_been_watered = models.BooleanField(default=False)  # only defined for plants (seeds/sprouts/crops)
    days_growing = models.IntegerField(null=True, blank=True)  # only defined for plants (seeds/sprouts/crops)

    def __str__(self):
        return self.item.name + ' ' + self.session.abbr_key_tag()

    def serialize(self):
        return {
            'name': self.name,
            'rarity': self.item.get_rarity_display(),
            'emoji': self.emoji,
            'hasBeenWatered': self.has_been_watered,
            'id': self.id,
            'quantity': self.quantity,
            'price': self.get_display_price_if_known(),
            'mythlingType': self.get_mythling_type_if_applicable()
        }

    def make_copy(self):
        return ItemToken(session=self.session, item=self.item)

    @property
    def name(self):
        return self.item.name

    @property
    def item_type(self):
        return self.item.item_type

    @property
    def rarity(self):
        return self.item.rarity

    @property
    def price(self):
        return self.item.price

    def get_display_price_if_known(self):
        is_known = self.session.hero.knowledge.filter(
            itemknowledge__item_type=self.item_type, itemknowledge__rarity=self.rarity
        ).exists()

        if is_known:
            return self.price
        else:
            return None

    def get_mythling_type_if_applicable(self):
        try:
            return self.item.mythling.mythling_type
        except Mythling.DoesNotExist:
            return

    @property
    def emoji(self):
        return self.item.emoji

    class Meta:
        ordering = ['pk']


class Mythling(Item):
    favorite_soil = models.OneToOneField('Item', on_delete=models.CASCADE, related_name='favorite_mythegg')
    special_response_villager = models.OneToOneField('Villager', on_delete=models.CASCADE,
                                                     related_name='favorite_mythegg')

    source_location = models.OneToOneField('Place', on_delete=models.CASCADE, null=True, blank=True, related_name='mythegg')

    image_path = models.CharField(max_length=255, default='default.png', null=True, blank=True)

    mythling_type = models.CharField(max_length=7, choices=MYTHLING_TYPES)
    growth_stage = models.CharField(max_length=8, choices=MYTHLING_GROWTH_STAGES)

    acquisition_increase_step = models.FloatField(null=True, blank=True)

    @property
    def image_url(self):
        if not self.image_path:
            return None

        return static(f'{IMAGE_PREFIX}/{MYTHLING_PORTRAIT_DIR}/{self.image_path}')

    def save(self, *args, **kwargs):
        if not self.item_type:
            self.item_type = self.growth_stage

        return super().save(*args, **kwargs)


class MythlingState(models.Model):
    session = models.ForeignKey('Session', on_delete=models.CASCADE, related_name='mythling_states')
    mythling = models.ForeignKey('Mythling', on_delete=models.CASCADE, related_name='states')

    has_been_found = models.BooleanField(default=False)
    is_in_possession = models.BooleanField(default=False)
    deferred_acquire = models.BooleanField(default=False)

    def mark_found(self):
        self.has_been_found = True
        self.is_in_possession = True
        self.deferred_acquire = False

        return self

    def mark_deferred(self):
        self.deferred_acquire = True

        return self

    def mark_given_away(self):
        self.is_in_possession = False

        return self
