import json
from typing import Iterable
from django.core.validators import ValidationError

from .game_logic import ActionGenerator, ActionValidator
from .models import Session, FarmerPortrait


MODEL_LAMBDAS = {
    'achievements': lambda session: session.hero.achievements.all(),
    'actions': lambda session: ActionGenerator().get_actions_for_session(session),
    'buildings': lambda session: session.location.buildings.all(),
    'clock': lambda session: session.clock,
    'dialogue': lambda session: session.current_dialogue,
    'localItemTokens': lambda session: session.local_item_tokens.all(),
    'hero': lambda session: session.hero_state,
    'inventory': lambda session: session.inventory.item_tokens.all(),
    'messages': lambda session: session.messages.all(),
    'place': lambda session: session.location,
    'portraitUrls': lambda session: FarmerPortrait.get_gallery_portrait_urls(),
    'speaker': lambda session: session.get_villager_state(session.current_dialogue.speaker),
    'villagerStates': lambda session: session.occupant_states.all(),
    'wallet': lambda session: session.wallet,
}

def retrieve_session(request):
    """Loads a session from the database or creates a new one if one does not exist.
    Also saves the session key to the request session."""
    
    session_key = request.session.get('session_key', None)

    if session_key is None:
        session = Session.objects.create(is_first_session=True)
        request.session['session_key'] = session.pk
    else:
        try:
            session = load_session_with_related_data(session_key)
        except Session.DoesNotExist:
            session = Session.objects.create(pk=session_key, is_first_session=True)

    session = ensure_state_objects_created(session)

    return session


def ensure_state_objects_created(session):
    # populate_* methods create objects with session FK already set via bulk_create
    # No need to call .set() - the relationship is established during creation
    if session.place_states.count() == 0:
        session.populate_place_states()

    if session.villager_states.count() == 0:
        place_states = list(session.place_states.all())
        session.populate_villager_states(place_states)

    if session.mythling_states.count() == 0:
        session.populate_mythling_states()

    return session


def load_session_with_related_data(session_key):
    one_to_one_session_relations = ['hero', '_location', 'hero_state', 'wallet', 'clock', 'inventory']
    # many_to_many_session_relations = ['villager_states', 'place_states']

    session_data_queryset = Session.objects.select_related(*one_to_one_session_relations)
    session_data_queryset = session_data_queryset.prefetch_related('inventory__item_tokens__item')

    # session_data_queryset = session_data_queryset.prefetch_related(*many_to_many_session_relations)
    session_data_queryset = session_data_queryset.prefetch_related('villager_states__villager__home', 'villager_states__location_state__place')
    session_data_queryset = session_data_queryset.prefetch_related('place_states__place', 'place_states__item_tokens__item', 'place_states__occupants')

    session = session_data_queryset.get(pk=session_key)
    session.clear_fresh()  # reset this every call

    return session


def get_home_models(session):
    """Returns a dictionary of models that are needed to render the home page."""

    home_model_keys = [
        'achievements',
        'actions',
        'buildings',
        'clock',
        'hero',
        'inventory',
        'localItemTokens',
        'messages',
        'place',
        'portraitUrls',
        'villagerStates',
        'wallet',
    ]

    return get_models(home_model_keys, session)


def get_fresh_models(session):
    """Returns a dictionary of models that have been updated on this call."""

    return get_models(session.get_fresh_keys(), session)


def get_models(model_keys, session):
    models = {}
    for key in model_keys:
        models[key] = MODEL_LAMBDAS[key](session)

    return models


def get_requested_action(request, session):
    action_digest = json.loads(request.body)['uniqueDigest']
    available_actions = ActionGenerator().get_actions_for_session(session)

    try:
        return [a for a in available_actions if a.unique_digest == action_digest][0]
    except IndexError:
        raise ValidationError("⚠️ Oops, that action isn't available")


def get_serialized_messages(session):
    return custom_serialize(list(session.messages.all()))


def validate_action(session, requested_action):
    av = ActionValidator()
    if not av.can_afford_action(session.wallet, requested_action):
        raise ValidationError("⚠️ You don't have enough fleurs to afford that right now")


def custom_serialize(obj):
    if isinstance(obj, str):
        return obj
    if isinstance(obj, Iterable):
        return [custom_serialize(i) for i in obj]
    else:
        return obj.serialize()


def set_user_data(hero, data):
    updated_fields = []

    if data.get('name') and hero.name != data['name']:
        hero.name = data['name']
        updated_fields.append('farmer name')

    if data.get('portraitPath') and hero.portrait.image_path != data['portraitPath']:
        new_portrait = FarmerPortrait.objects.get(image_path=data['portraitPath'])
        hero.portrait = new_portrait
        updated_fields.append('portrait')

    hero.save()

    if len(updated_fields) > 0:
        return f"Saved new {' & '.join(updated_fields)}!"
    else:
        return None
