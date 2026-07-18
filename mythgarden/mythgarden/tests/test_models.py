from django.test import TestCase
from django.core.validators import ValidationError

# noinspection PyUnresolvedReferences
from mythgarden.models import Action, Clock, Session

# noinspection PyUnresolvedReferences
from mythgarden.models._constants import MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY

def create_session(skip_post_save_signal=True):
    return Session.objects.create(skip_post_save_signal=skip_post_save_signal)


class ActionModelTests(TestCase):
    def test_computes_correct_display_cost_for_time_actions(self):
        """
        Computes the correct display cost for time actions
        """
        action = Action(action_type=Action.WATER, cost_amount=1, cost_unit=Action.HOUR)

        self.assertEqual(action.display_cost, '1hr')

    def test_computes_correct_display_cost_for_money_actions(self):
        """
        Computes the correct display cost for money actions
        """
        action = Action(action_type=Action.BUY, cost_amount=5, cost_unit=Action.KOIN)

        self.assertEqual(action.display_cost, '⚜️5')


class ClockModelTests(TestCase):
    def setUp(self):
        session = create_session()
        self.clock = Clock(session=session, day=MONDAY, time=9*60)

    def test_advance_should_advance_the_time_by_the_amount_of_hours(self):
        """
        advance should advance the time by the amount of hours
        """
        self.clock.time = 9*60
        self.clock.advance(60)

        self.assertEqual(self.clock.time, 10*60)

    def test_advance_should_roll_time_over_when_time_equals_24(self):
        """
        advance should roll time over when time equals 24*60
        """
        self.clock.time = 9*60
        self.clock.advance(15*60)

        self.assertEqual(self.clock.time, 0)

    def test_advance_should_roll_time_over_when_time_exceeds_24(self):
        """
        advance should roll time over when time exceeds 24*60
        """
        self.clock.time = 9*60
        self.clock.advance(18*60)

        self.assertEqual(self.clock.time, 3*60)

    def test_advance_should_roll_day_over_when_time_exceeds_24(self):
        """
        advance should roll day over when time exceeds 24*60
        """
        self.clock.day = MONDAY
        self.clock.time = 9*60
        self.clock.advance(18*60)

        self.assertEqual(self.clock.day, TUESDAY)

    def test_advance_should_roll_day_over_multiple_day_when_time_exceeds_48_plus(self):
        """
        advance should roll day over multiple days when time exceeds 48+ hours
        """
        self.clock.day = MONDAY
        self.clock.time = 9*60
        self.clock.advance(2*60*24)

        self.assertEqual(self.clock.day, WEDNESDAY)

    def test_advance_should_roll_back_to_start_of_week_when_day_goes_past_saturday(self):
        """
        advance should roll back to start of week when day goes past Saturday
        """
        self.clock.day = SATURDAY
        self.clock.time = 9*60
        self.clock.advance(18*60)

        self.assertEqual(self.clock.day, SUNDAY)


    def test_get_time_display_should_show_pm_if_time_is_after_12(self):
        """
        get_time_display should show pm if time is after 12
        """
        self.clock.time = 13*60

        self.assertEqual(self.clock.get_time_display(), '1:00pm')

    def test_get_time_display_should_show_am_if_time_is_before_12(self):
        """
        get_time_display should show am if time is before 12
        """
        self.clock.time = 9*60

        self.assertEqual(self.clock.get_time_display(), '9:00am')

    def test_get_time_display_should_show_12am_if_time_is_0(self):
        """
        get_time_display should show 12am if time is 0
        """
        self.clock.time = 0

        self.assertEqual(self.clock.get_time_display(), '12:00am')

    def test_get_time_display_should_show_12pm_if_time_is_12(self):
        """
        get_time_display should show 12pm if time is 12
        """
        self.clock.time = 12*60

        self.assertEqual(self.clock.get_time_display(), '12:00pm')

    def test_get_time_display_should_show_1230am_if_time_is_0_5(self):
        """
        get_time_display should show 12:30 am if time is 0.5
        """
        self.clock.time = 30

        self.assertEqual(self.clock.get_time_display(), '12:30am')

    def test_get_time_display_should_show_1230pm_if_time_is_12_5(self):
        """
        get_time_display should show 12:30 pm if time is 12.5
        """
        self.clock.time = 12*60 + 30

        self.assertEqual(self.clock.get_time_display(), '12:30pm')

    def test_clock_should_error_if_time_is_set_to_less_than_0(self):
        """
        should error if time is less than 0
        """

        with self.assertRaises(ValidationError):
            self.clock.time = -1
            self.clock.save()

    def test_clock_should_error_if_time_is_set_to_greater_than_24(self):
        """
        should error if time is greater than 24*60
        """

        with self.assertRaises(ValidationError):
            self.clock.time = 24*60 + 1
            self.clock.save()








