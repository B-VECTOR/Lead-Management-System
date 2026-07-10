from django.urls import path

from .views import AreaListView, CountryListView, IndustryListView

app_name = "reference"

urlpatterns = [
    path("api/countries/", CountryListView.as_view(), name="api-country-list"),
    path("api/industries/", IndustryListView.as_view(), name="api-industry-list"),
    path("api/areas/", AreaListView.as_view(), name="api-area-list"),
]
