"""URL configuration for the LMS project."""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    # Built-in auth views: login, logout, password change / reset.
    path("accounts/", include("django.contrib.auth.urls")),
    path("", include("authentication.urls")),
    path("", include("reference.urls")),
    path("", include("leads.urls")),
]

# Serve uploaded lead attachments from Django during development (Phase 8).
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
