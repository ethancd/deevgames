from io import StringIO
from unittest.mock import patch

from django.core.management import CommandError, call_command
from django.db import DatabaseError
from django.test import TestCase, override_settings

from mythgarden.models import Hero, Item, Place, Session, Villager


@override_settings(SECURE_SSL_REDIRECT=False)
class DeploymentTests(TestCase):
    def test_empty_world_bootstraps_once_and_preserves_player(self):
        call_command('bootstrap_world', stdout=StringIO())
        self.assertEqual((Item.objects.count(), Place.objects.count(), Villager.objects.count()), (201, 16, 17))
        session = Session.objects.create()
        session.hero.name = 'Keep Me'
        session.hero.save()
        counts = (Item.objects.count(), Hero.objects.count(), Session.objects.count())
        call_command('bootstrap_world', stdout=StringIO())
        self.assertEqual((Item.objects.count(), Hero.objects.count(), Session.objects.count()), counts)
        self.assertEqual(Session.objects.get(pk=session.pk).hero.name, 'Keep Me')

    def test_partial_world_fails_without_loading_over_it(self):
        Place.objects.create(name='Partial world')
        with self.assertRaises(CommandError):
            call_command('bootstrap_world', stdout=StringIO())
        self.assertEqual(Item.objects.count(), 0)
        self.assertEqual(Place.objects.count(), 1)

    def test_health_reports_readiness_without_creating_saves(self):
        self.assertEqual(self.client.get('/healthz').status_code, 503)
        call_command('bootstrap_world', stdout=StringIO())
        response = self.client.get('/healthz')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})
        self.assertFalse(response.cookies)
        self.assertEqual(Session.objects.count(), 0)
        with patch('mythgarden.views.Item.objects.exists', side_effect=DatabaseError('private database details')):
            response = self.client.get('/healthz')
        self.assertEqual(response.status_code, 503)
        self.assertNotContains(response, 'private', status_code=503)
