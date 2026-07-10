from rest_framework.generics import ListAPIView

from .models import Area, Country, Industry
from .serializers import AreaSerializer, CountrySerializer, IndustrySerializer


class CountryListView(ListAPIView):
    """Read-only list of countries, for the lead form's Country select."""

    queryset = Country.objects.all()  # ordered by name (Meta.ordering)
    serializer_class = CountrySerializer
    pagination_class = None


class IndustryListView(ListAPIView):
    """Read-only list of industries, for the lead form's Industry select."""

    queryset = Industry.objects.all()
    serializer_class = IndustrySerializer
    pagination_class = None


class AreaListView(ListAPIView):
    """Read-only list of areas, for the lead/user forms' Domain select."""

    queryset = Area.objects.all()
    serializer_class = AreaSerializer
    pagination_class = None
