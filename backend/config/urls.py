"""URL configuration for the LMS project."""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    # Built-in auth views: login, logout, password change / reset.
    path("accounts/", include("django.contrib.auth.urls")),
    path("", include("authentication.urls")),
]
