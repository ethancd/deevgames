from django.db import models

from ._constants import DIRECTIONS


class Bridge(models.Model):
    place_1 = models.ForeignKey('Place', on_delete=models.CASCADE, related_name='bridges_as_1')
    place_2 = models.ForeignKey('Place', on_delete=models.CASCADE, related_name='bridges_as_2')

    direction_1 = models.CharField(max_length=5, choices=DIRECTIONS)
    direction_2 = models.CharField(max_length=5, choices=DIRECTIONS)

    def __str__(self):
        return str(self.place_1) + ' on the ' + self.get_direction_1_display() + ' is adjacent to ' + str(
            self.place_2) + ' to the ' + self.get_direction_2_display()
