from django.db import models

from ._constants import ITEM_TYPES, RARITY_CHOICES, VALENCES

class Knowledge(models.Model):
    ITEM_KNOWLEDGE = 'ITEM_KNOWLEDGE'
    VILLAGER_KNOWLEDGE = 'VILLAGER_KNOWLEDGE'
    MYTHEGG_KNOWLEDGE = 'MYTHEGG_KNOWLEDGE'
    MYTHLING_POWER_KNOWLEDGE = 'MYTHLING_POWER_KNOWLEDGE'

    KNOWLEDGE_TYPES = [
        (ITEM_KNOWLEDGE, 'Item knowledge'),
        (VILLAGER_KNOWLEDGE, 'Villager knowledge'),
        (MYTHEGG_KNOWLEDGE, 'Mythegg knowledge'),
        (MYTHLING_POWER_KNOWLEDGE, 'Mythling power knowledge')
    ]

    unlocking_achievement = models.ForeignKey('Achievement', on_delete=models.CASCADE, related_name='unlocked_knowledge')
    display_name = models.CharField(max_length=255)
    knowledge_type = models.CharField(max_length=24, choices=KNOWLEDGE_TYPES)

    def __str__(self):
        return f'Knowledge: {self.display_name}'


class ItemKnowledge(Knowledge):
    item_type = models.CharField(max_length=8, choices=ITEM_TYPES)
    rarity = models.CharField(max_length=8, choices=RARITY_CHOICES)

    def save(self, *args, **kwargs):
        if not self.knowledge_type:
            self.knowledge_type = Knowledge.ITEM_KNOWLEDGE

        return super().save(*args, **kwargs)


class VillagerKnowledge(Knowledge):
    villager = models.ForeignKey('Villager', on_delete=models.CASCADE)
    valence = models.CharField(max_length=7, choices=VALENCES)

    def save(self, *args, **kwargs):
        if not self.knowledge_type:
            self.knowledge_type = Knowledge.VILLAGER_KNOWLEDGE

        return super().save(*args, **kwargs)


class MytheggKnowledge(Knowledge):
    mythegg = models.ForeignKey('Mythling', on_delete=models.CASCADE)

    def save(self, *args, **kwargs):
        if not self.knowledge_type:
            self.knowledge_type = Knowledge.MYTHEGG_KNOWLEDGE

        return super().save(*args, **kwargs)

class MythlingPowerKnowledge(Knowledge):
    mythling = models.ForeignKey('Mythling', on_delete=models.CASCADE)

    def save(self, *args, **kwargs):
        if not self.knowledge_type:
            self.knowledge_type = Knowledge.MYTHLING_POWER_KNOWLEDGE

        return super().save(*args, **kwargs)