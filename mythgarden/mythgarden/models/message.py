from django.db import models


class Message(models.Model):
    session = models.ForeignKey('Session', on_delete=models.CASCADE, related_name='messages')
    text = models.CharField(max_length=255)
    is_error = models.BooleanField(default=False)

    def __str__(self):
        return self.abbr_text + ' ' + self.session.abbr_key_tag()

    def serialize(self):
        return {
            'text': self.text,
            'id': self.id,
            'isError': self.is_error
        }

    @property
    def abbr_text(self):
        return f"{self.text[:50]}{'...' if len(self.text) > 50 else ''}"

    class Meta:
        ordering = ['pk']
