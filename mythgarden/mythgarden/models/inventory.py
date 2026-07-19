from django.db import models

from ._constants import MAX_ITEMS


class Inventory(models.Model):
    session = models.OneToOneField('Session', on_delete=models.CASCADE, primary_key=True)
    item_tokens = models.ManyToManyField('ItemToken', blank=True)

    @property
    def is_full(self):
        return self.item_tokens.count() >= MAX_ITEMS

    def __str__(self):
        return 'Inventory ' + self.session.abbr_key_tag()
