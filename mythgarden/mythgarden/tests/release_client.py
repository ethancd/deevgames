from django.test import Client


class GameClient(Client):
    """Carry the version returned by HTTP responses, just like the browser."""
    state_version = None

    def request(self, **request):
        if request.get('PATH_INFO') == '/action' and self.state_version:
            request.setdefault('HTTP_X_GAME_VERSION', self.state_version)
        response = super().request(**request)
        if response.get('Content-Type', '').startswith('application/json'):
            payload = response.json()
            version = payload.get('gameState', payload).get('stateVersion')
            if version:
                self.state_version = version
        elif response.context and 'ctx' in response.context:
            self.state_version = response.context['ctx'].get('stateVersion')
        return response
