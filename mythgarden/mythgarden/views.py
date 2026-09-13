import json
import os

from django.core.validators import ValidationError
from django.db import DatabaseError, IntegrityError, transaction
from django.http import HttpResponseRedirect, HttpResponseNotFound
from django.http import JsonResponse
from django.shortcuts import render, get_object_or_404
from django.urls import reverse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST
from django.conf import settings

from .view_helpers import retrieve_session, ensure_state_objects_created, get_home_models, get_fresh_models, get_requested_action, get_serialized_messages, \
    validate_action, custom_serialize, set_user_data, load_session_with_related_data
from .game_logic import ActionExecutor, EventOperator
from .models import Session
from .models import Item, Place
from .models import GameSettings
from .static_helpers import generate_uuid


def health(request):
    """Readiness check: database reachable and world bootstrapped; no player cookie."""
    try:
        ready = Item.objects.exists() and Place.objects.exists()
    except DatabaseError:
        ready = False
    return JsonResponse({'status': 'ok' if ready else 'unavailable'}, status=200 if ready else 503)

@ensure_csrf_cookie
def home(request):
    with transaction.atomic():
        session = retrieve_session(request)
        home_models = get_home_models(session)

    context = {'ctx': {model_name: custom_serialize(data) for model_name, data in home_models.items()}}

    # Add environment info for deploy badge and production styling
    environment = os.environ.get('ENVIRONMENT', 'development')
    context['ctx']['environment'] = environment
    context['ctx']['touchUiEnabled'] = settings.MYTHGARDEN_TOUCH_UI_ENABLED

    # Only add deploy info for non-production
    if environment != 'production':
        context['ctx']['branchName'] = os.environ.get('BRANCH_NAME', '')
        context['ctx']['deployTime'] = os.environ.get('DEPLOY_TIME', '')

    template_name = 'mythgarden/home.html'
    return render(request, template_name, context)


def action(request):
    """Modifies game state data based on the requested action and returns a JsonResponse containing new game state data,
    or returns an error message if the action is not available."""

    # guard against 'GET' requests
    if not request.method == 'POST':
        return HttpResponseRedirect(reverse('mythgarden:home'))

    # load session based on django session key in request
    # if session is missing, redirect to home -- we handle session creation in the GET home request
    session_key = request.session.get('session_key')
    if not session_key:
        return HttpResponseRedirect(reverse('mythgarden:home'))

    # find requested action in currently available actions,
    # validate it, execute it, react to time passing as needed
    # if action is unavailable, invalid, or database errors out, return an error message
    try:
        with transaction.atomic():
            # Settings updates and gameplay share this lock. Validate against
            # the state after any concurrent request has finished committing.
            Session.objects.select_for_update().get(pk=session_key)
            session = load_session_with_related_data(session_key)
            if request.headers.get('X-Game-Version') != session.state_version:
                result = {name: custom_serialize(data) for name, data in get_home_models(session).items()}
                message = 'Your progress has been refreshed. Please try again. If this repeats, reload the page.'
                result['error'] = message
                result['messages'].append({'id': -1, 'text': message, 'isError': True})
                return JsonResponse(result, status=409)
            requested_action = get_requested_action(request, session)
            validate_action(session, requested_action)
            ActionExecutor().execute(requested_action, session)
            if session.is_fresh('clock'):
                EventOperator().react_to_time_passing(session.clock, session)
            session.has_taken_action = True
            session.state_version = generate_uuid()
            session.save(update_fields=['has_taken_action', 'state_version'])

            if session.game_over:
                session = EventOperator().trigger_game_over(session)
                session = ensure_state_objects_created(session)
                updated_models = get_home_models(session)
            else:
                session.mark_fresh('actions', 'stateVersion')
                updated_models = get_fresh_models(session)
            results = {name: custom_serialize(data) for name, data in updated_models.items()}
    except Session.DoesNotExist:
        return HttpResponseNotFound()
    except (ValidationError, IntegrityError) as e:
        error_message = ' '.join(e.messages) if isinstance(e, ValidationError) else 'Unable to save that action. Please reload and try again.'
        session.messages.create(text=error_message, is_error=True)
        return JsonResponse({'error': error_message, 'messages': get_serialized_messages(session)})

    return JsonResponse(results)


@require_POST
def kys(request):
    """A shortcut to "kill your session" -- ie reset the game state to the start of the week.
    A staple for timeloop games everywhere."""
    session_key = request.session.get('session_key')
    if not session_key:
        return HttpResponseRedirect(reverse('mythgarden:home'))

    with transaction.atomic():
        session = get_object_or_404(Session.objects.select_for_update(), pk=session_key)
        EventOperator().trigger_kys(session)
    return HttpResponseRedirect(reverse('mythgarden:home'))


def user_data(request):
    """Endpoint for updating user data like hero's name, choice of portrait, etc."""
    if not request.method == 'POST':
        return HttpResponseRedirect(reverse('mythgarden:home'))

    session_key = request.session.get('session_key')
    if not session_key:
        return HttpResponseRedirect(reverse('mythgarden:home'))

    session = get_object_or_404(Session, pk=session_key)

    try:
        body = json.loads(request.body)
        if not isinstance(body, dict) or set(body) != {'userData'}:
            raise ValidationError('Send profile changes in a userData object.')
        new_data = body['userData']

        with transaction.atomic():
            session = get_object_or_404(Session.objects.select_for_update(), pk=session_key)
            hero = session.hero
            success_message = set_user_data(hero, new_data)
            if success_message:
                session.messages.create(text=success_message)
    except (ValidationError, ValueError, UnicodeDecodeError) as e:
        message = ' '.join(e.messages) if isinstance(e, ValidationError) else 'The profile request is invalid. Please try again.'
        session.messages.create(text=message, is_error=True)
        return JsonResponse({'error': message, 'messages': get_serialized_messages(session)}, status=400)

    return JsonResponse({'hero': custom_serialize(session.hero_state), 'messages': get_serialized_messages(session)})


def test_time(request, time, day):
    if not settings.DEBUG:
        return HttpResponseNotFound()

    with transaction.atomic():
        session = retrieve_session(request)
        home_models = get_home_models(session)

    session.clock.time = time
    session.clock.day = day
    session.clock.save()

    context = {'ctx': {model_name: custom_serialize(data) for model_name, data in home_models.items()}}

    template_name = 'mythgarden/home.html'
    return render(request, template_name, context)


def get_settings(request):
    """Endpoint for retrieving game settings."""
    session_key = request.session.get('session_key')
    if not session_key:
        return HttpResponseRedirect(reverse('mythgarden:home'))

    session = get_object_or_404(Session, pk=session_key)

    # Ensure settings exist for the hero
    game_settings, created = GameSettings.objects.get_or_create(hero=session.hero)

    return JsonResponse({**game_settings.serialize(), 'can_apply_immediately': not session.has_taken_action})


def update_settings(request):
    """Apply choices to an untouched week, otherwise save them for the next week."""
    if not request.method == 'POST':
        return HttpResponseRedirect(reverse('mythgarden:home'))

    session_key = request.session.get('session_key')
    if not session_key:
        return HttpResponseRedirect(reverse('mythgarden:home'))

    try:
        new_settings = json.loads(request.body)
        allowed_fields = {f'draft_{key}' for key in GameSettings.SCORE_BONUSES}
        if not isinstance(new_settings, dict) or set(new_settings) - allowed_fields:
            raise ValueError('Send only draft challenge options as a JSON object.')
        if any(type(value) is not bool for value in new_settings.values()):
            raise ValueError('Each challenge option must be true or false.')

        with transaction.atomic():
            session = get_object_or_404(Session.objects.select_for_update(), pk=session_key)
            game_settings, _ = GameSettings.objects.get_or_create(hero=session.hero)
            # Update only submitted columns, so separate requests cannot
            # overwrite each other's unrelated draft choices.
            if new_settings:
                GameSettings.objects.filter(pk=game_settings.pk).update(**new_settings)
                game_settings.refresh_from_db()
            can_apply_immediately = not session.has_taken_action
            if new_settings and can_apply_immediately:
                game_settings.apply_draft()
                # No gameplay has happened, so villagers still have only their
                # initial positions. Recreate these for the new movement rule.
                session.hero.settings = game_settings
                session.villager_states.all().delete()
                session.populate_villager_states(session.place_states.all())
                session.state_version = generate_uuid()
                session.save(update_fields=['state_version'])
            result = {**game_settings.serialize(), 'can_apply_immediately': can_apply_immediately}
            if new_settings and can_apply_immediately:
                session = load_session_with_related_data(session_key)
                result['gameState'] = {name: custom_serialize(data) for name, data in get_home_models(session).items()}
    except (ValidationError, ValueError, UnicodeDecodeError) as e:
        return JsonResponse({'error': str(e)}, status=400)

    return JsonResponse(result)
