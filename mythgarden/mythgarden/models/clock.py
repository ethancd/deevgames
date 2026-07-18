from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models

from ._constants import MINUTES_IN_A_DAY, DAYS_OF_WEEK, FIRST_DAY, DAWN, MINUTES_IN_A_HALF_DAY, \
    OVERSLEPT_TIME, DAY_TO_INDEX, SUNSET


class Clock(models.Model):
    session = models.OneToOneField('Session', on_delete=models.CASCADE, primary_key=True)
    day = models.CharField(default=FIRST_DAY, max_length=9, choices=DAYS_OF_WEEK)
    time = models.IntegerField(default=DAWN, validators=[MinValueValidator(0), MaxValueValidator(MINUTES_IN_A_DAY - 1)])
    is_new_day = models.BooleanField(default=False)

    last_triggered_day = models.CharField(default=FIRST_DAY, max_length=9, choices=DAYS_OF_WEEK)
    last_triggered_time = models.IntegerField(default=0, validators=[MinValueValidator(0), MaxValueValidator(MINUTES_IN_A_DAY - 1)])

    def __str__(self):
        return 'Clock ' + self.session.abbr_key_tag()

    def serialize(self):
        return {
            'dayDisplay': self.get_day_display(),
            'timeDisplay': self.get_time_display(),
            'time': self.time,
            'dayNumber': self.day_index
        }

    @classmethod
    def convert_time_to_display(cls, time):
        """ Returns the time as a string in the format 'hh:mmam' or 'hh:mmpm' """
        hours = (time % MINUTES_IN_A_HALF_DAY) // 60
        if hours == 0:
            hours = 12
        minutes = time % 60
        suffix = 'pm' if time >= MINUTES_IN_A_HALF_DAY else 'am'

        return f"{hours}:{minutes:02d}{suffix}"

    @property
    def display(self):
        return self.get_day_display() + ' ' + self.get_time_display()

    @property
    def day_index(self):
        return DAY_TO_INDEX[self.day]

    def get_time_display(self):
        """ Returns the time as a string in the format 'hh:mmam' or 'hh:mmpm' """
        return Clock.convert_time_to_display(self.time)

    def advance(self, amount_in_minutes):
        """ Updates the day and time by the given amount of time,
        rolling the clock and days over at midnight and end of saturday respectively. """

        self.time += amount_in_minutes

        days_to_add = self.time // MINUTES_IN_A_DAY
        if days_to_add > 0:
            self.time = self.time % MINUTES_IN_A_DAY
            self.advance_day(days_to_add)

        return self  # for chaining

    def advance_day(self, days_to_add):
        """ Advances the day by the given number of days, rolling over at the end of the week. """
        new_day_index = (self.day_index + days_to_add) % 7
        self.day = DAYS_OF_WEEK[new_day_index][0]
        self.is_new_day = True

    def mark_last_triggered_point_as_now(self):
        self.last_triggered_day = self.day
        self.last_triggered_time = self.time

        return self  # for chaining

    def advance_to_end_of_day(self):
        if self.time >= SUNSET:
            return self.advance(self.minutes_to_midnight)

        if self.time < DAWN:
            return self.advance(self.minutes_to_dawn)

    @property
    def minutes_to_midnight(self):
        return MINUTES_IN_A_DAY - self.time

    @property
    def minutes_to_dawn(self):
        return DAWN - self.time

    @property
    def minutes_to_overslept_time(self):
        return OVERSLEPT_TIME - self.time

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)
