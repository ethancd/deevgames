from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models

from ._constants import DAYS_OF_WEEK, MINUTES_IN_A_DAY, DAWN

from .place import Place


class ScheduledEvent(models.Model):
    SHOP_POPULATES = 'SHOP_POPULATES'
    VILLAGER_APPEARS = 'VILLAGER_APPEARS'

    EVENT_TYPES = [
        (SHOP_POPULATES, 'Shop populates'),
        (VILLAGER_APPEARS, 'Villager appears'),
    ]

    day = models.CharField(max_length=9, choices=DAYS_OF_WEEK, null=True, blank=True)
    is_daily = models.BooleanField(default=False)
    time = models.IntegerField(default=DAWN,
                               validators=[MinValueValidator(0), MaxValueValidator(MINUTES_IN_A_DAY - 1)])

    event_type = models.CharField(max_length=16, choices=EVENT_TYPES)

    def __str__(self):
        return f'Scheduled Event: {self.get_event_type_display()} at {self.time} on {self.day}'


class PopulateShopEvent(ScheduledEvent):
    shop = models.ForeignKey('Place', on_delete=models.CASCADE, default=Place.get_default_shop_pk)
    content_config_list = models.JSONField(default=list)

    def save(self, *args, **kwargs):
        if not self.event_type:
            self.event_type = ScheduledEvent.SHOP_POPULATES

        return super().save(*args, **kwargs)


class VillagerAppearsEvent(ScheduledEvent):
    place = models.ForeignKey('Place', on_delete=models.CASCADE, null=True, blank=True)
    villager = models.ForeignKey('Villager', on_delete=models.CASCADE)

    def save(self, *args, **kwargs):
        print(self.event_type)
        if not self.event_type:
            self.event_type = ScheduledEvent.VILLAGER_APPEARS

        return super().save(*args, **kwargs)

    @property
    def day_display(self):
        if self.is_daily:
            return "daily"
        else:
            return f"on {self.day}"

    @property
    def place_display(self):
        if self.place:
            return f'appears in {self.place.name}'
        else:
            return 'disappears'

    def __str__(self):
        return f'Event: {self.villager.name} {self.place_display} at {self.time} {self.day_display}'
