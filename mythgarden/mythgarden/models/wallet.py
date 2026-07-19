from django.db import models

from ._constants import KOIN_SIGN


class Wallet(models.Model):
    session = models.OneToOneField('Session', on_delete=models.CASCADE, primary_key=True)
    money = models.IntegerField(default=0)

    def __str__(self):
        return 'Wallet ' + self.session.abbr_key_tag()

    def serialize(self):
        return self.display

    @property
    def display(self):
        return KOIN_SIGN + str(self.money)
