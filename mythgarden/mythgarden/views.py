from sqlite3 import IntegrityError
import json
import os

from django.core.validators import ValidationError
from django.db import transaction
from django.http import HttpResponseRedirect, HttpResponseNotFound
from django.http import JsonResponse
from django.shortcuts import render, get_object_or_404
from django.urls import reverse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.conf import settings

from .view_helpers import retrieve_session, ensure_state_objects_created, get_home_models, get_fresh_models, get_requested_action, get_serialized_messages, \
    validate_action, custom_serialize, set_user_data, load_session_with_related_data
from .game_logic import ActionExecutor, EventOperator
from .models import Session
from .models import Achievement
from .models import GameSettings

@ensure_csrf_cookie
def home(request):
    with transaction.atomic():
        session = retrieve_session(request)
        home_models = get_home_models(session)

    context = {'ctx': {model_name: custom_serialize(data) for model_name, data in home_models.items()}}

    # Add environment info for deploy badge and production styling
    environment = os.environ.get('ENVIRONMENT', 'development')
    context['ctx']['environment'] = environment

    # Only add deploy info for non-production
    if environment != 'production':
        context['ctx']['branchName'] = os.environ.get('BRANCH_NAME', '')
        context['ctx']['deployTime'] = os.environ.get('DEPLOY_TIME', '')

    print(Achievement.objects.all().count())
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

    try:
        session = load_session_with_related_data(session_key)
    except Session.DoesNotExist:
        return HttpResponseNotFound()

    # find requested action in currently available actions,
    # validate it, execute it, react to time passing as needed
    # if action is unavailable, invalid, or database errors out, return an error message
    try:
        requested_action = get_requested_action(request, session)
        validate_action(session, requested_action)
        with transaction.atomic():
            ActionExecutor().execute(requested_action, session)
            if session.is_fresh('clock'):
                EventOperator().react_to_time_passing(session.clock, session)
    except (ValidationError, IntegrityError) as e:
        session.messages.create(text=e.message, is_error=True)
        return JsonResponse({'error': e.message, 'messages': get_serialized_messages(session)})

    # if game_over flag is true, then reset the session
    # and return a new set of starting objects
    if session.game_over:
        with transaction.atomic():
            session = EventOperator().trigger_game_over(session)

        session = ensure_state_objects_created(session)
        home_models = get_home_models(session)
        results = {model_name: custom_serialize(data) for model_name, data in home_models.items()}
        return JsonResponse(results)

    # get models that have been modified (including actions every time)
    # and return them as JSON
    session.mark_fresh('actions')
    updated_models = get_fresh_models(session)
    results = {model_name: custom_serialize(data) for model_name, data in updated_models.items()}
    return JsonResponse(results)


def kys(request):
    """A shortcut to "kill your session" -- ie reset the game state to the start of the week.
    A staple for timeloop games everywhere."""
    session_key = request.session.get('session_key')
    if not session_key:
        return HttpResponseRedirect(reverse('mythgarden:home'))

    session = get_object_or_404(Session, pk=session_key)

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
        hero = session.hero
        new_data = json.loads(request.body)['userData']

        with transaction.atomic():
            success_message = set_user_data(hero, new_data)
            if success_message:
                session.messages.create(text=success_message)
    except ValidationError as e:
        session.messages.create(text=e.message, is_error=True)
        return JsonResponse({'error': e.message, 'messages': get_serialized_messages(session)})

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

    return JsonResponse(game_settings.serialize())


def update_settings(request):
    """Endpoint for updating draft game settings."""
    if not request.method == 'POST':
        return HttpResponseRedirect(reverse('mythgarden:home'))

    session_key = request.session.get('session_key')
    if not session_key:
        return HttpResponseRedirect(reverse('mythgarden:home'))

    session = get_object_or_404(Session, pk=session_key)

    try:
        # Ensure settings exist for the hero
        game_settings, created = GameSettings.objects.get_or_create(hero=session.hero)

        new_settings = json.loads(request.body)

        with transaction.atomic():
            # Only allow updating draft settings
            if 'draft_villagers_move' in new_settings:
                game_settings.draft_villagers_move = new_settings['draft_villagers_move']
            if 'draft_building_hours' in new_settings:
                game_settings.draft_building_hours = new_settings['draft_building_hours']
            if 'draft_advanced_crops' in new_settings:
                game_settings.draft_advanced_crops = new_settings['draft_advanced_crops']
            if 'draft_dynamic_shop' in new_settings:
                game_settings.draft_dynamic_shop = new_settings['draft_dynamic_shop']

            game_settings.save()
    except (ValidationError, ValueError) as e:
        error_message = str(e) if hasattr(e, 'message') else str(e)
        return JsonResponse({'error': error_message})

    return JsonResponse(game_settings.serialize())
