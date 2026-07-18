from django.urls import path

from . import views

app_name = 'mythgarden'
urlpatterns = [
    path('', views.home, name='home'),
    path('action', views.action, name='action'),
    path('user_data', views.user_data, name='user_data'),
    path('settings', views.get_settings, name='get_settings'),
    path('settings/update', views.update_settings, name='update_settings'),
    path('kys', views.kys, name='kys'),
    path('test_time/<int:time>/<str:day>', views.test_time, name='test_time')
]
