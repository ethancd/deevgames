from ..models._constants import SPARKLY, RAINBOW, GOLDEN, SPOOPY, VERDANT, CORAL

class MytheggPowers:
    def spoopy_active(self, session):
        return self.is_active(SPOOPY, session)

    def coral_active(self, session):
        return self.is_active(CORAL, session)

    def verdant_active(self, session):
        return self.is_active(VERDANT, session)

    def sparkly_active(self, session):
        return self.is_active(SPARKLY, session)

    def golden_active(self, session):
        return self.is_active(GOLDEN, session)

    def rainbow_active(self, session):
        return self.is_active(RAINBOW, session)

    def is_active(self, mythling_type, session):
        mythling_state = session.mythling_states.filter(mythling__mythling_type=mythling_type)

        if len(mythling_state) == 0:
            return False

        return mythling_state.first().is_in_possession
