from django.db import models


class GameSettings(models.Model):
    hero = models.OneToOneField('Hero', on_delete=models.CASCADE, related_name='settings')

    # Active settings (current run uses these)
    villagers_move = models.BooleanField(default=False)
    building_hours = models.BooleanField(default=False)
    advanced_crops = models.BooleanField(default=False)
    dynamic_shop = models.BooleanField(default=False)

    # Draft settings (applied on next run)
    draft_villagers_move = models.BooleanField(default=False)
    draft_building_hours = models.BooleanField(default=False)
    draft_advanced_crops = models.BooleanField(default=False)
    draft_dynamic_shop = models.BooleanField(default=False)

    SCORE_BONUSES = {
        'villagers_move': 0.50,
        'building_hours': 0.25,
        'advanced_crops': 0.25,
        'dynamic_shop': 0.25,
    }

    @property
    def score_multiplier(self) -> float:
        """Calculate active score multiplier."""
        multiplier = 1.0
        for setting, bonus in self.SCORE_BONUSES.items():
            if getattr(self, setting):
                multiplier += bonus
        return multiplier

    @property
    def draft_score_multiplier(self) -> float:
        """Calculate draft score multiplier."""
        multiplier = 1.0
        for setting, bonus in self.SCORE_BONUSES.items():
            if getattr(self, f'draft_{setting}'):
                multiplier += bonus
        return multiplier

    def apply_draft(self):
        """Copy draft settings to active settings. Called at run start."""
        self.villagers_move = self.draft_villagers_move
        self.building_hours = self.draft_building_hours
        self.advanced_crops = self.draft_advanced_crops
        self.dynamic_shop = self.draft_dynamic_shop
        self.save()

    def serialize(self):
        return {
            'villagers_move': self.villagers_move,
            'building_hours': self.building_hours,
            'advanced_crops': self.advanced_crops,
            'dynamic_shop': self.dynamic_shop,
            'draft_villagers_move': self.draft_villagers_move,
            'draft_building_hours': self.draft_building_hours,
            'draft_advanced_crops': self.draft_advanced_crops,
            'draft_dynamic_shop': self.draft_dynamic_shop,
            'score_multiplier': self.score_multiplier,
            'draft_score_multiplier': self.draft_score_multiplier,
        }
