from django.db import models
from django.templatetags.static import static

from ._constants import IMAGE_PREFIX, FARMER_PORTRAIT_DIR, DEFAULT_PORTRAIT


class FarmerPortrait(models.Model):
    image_path = models.CharField(max_length=255, default=DEFAULT_PORTRAIT, unique=True)

    @classmethod
    def get_default_pk(cls):
        portrait, created = cls.objects.get_or_create(image_path=DEFAULT_PORTRAIT)
        return portrait.pk

    @classmethod
    def get_gallery_portrait_urls(cls):
        gallery_portraits = cls.objects.exclude(image_path=DEFAULT_PORTRAIT)
        gallery_portrait_urls = [portrait.image_url for portrait in gallery_portraits]

        return gallery_portrait_urls

    @property
    def image_url(self):
        if not self.image_path:
            return None

        return static(f'{IMAGE_PREFIX}/{FARMER_PORTRAIT_DIR}/{self.image_path}')

    def serialize(self):
        return {
            'portraitPath': self.image_path
        }

    class Meta:
        ordering = ['image_path']
