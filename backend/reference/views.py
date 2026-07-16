from rest_framework.generics import ListAPIView

from .models import Area, Country, Industry
from .serializers import AreaSerializer, CountrySerializer, IndustrySerializer


# Dropdowns offer only active rows (§4.2 v13) — an inactivated entry is
# retired from new selections but keeps existing FKs valid.

class CountryListView(ListAPIView):
    """Read-only list of active countries, for the lead form's Country select."""

    queryset = Country.objects.filter(status=Country.Status.ACTIVE)  # ordered by name
    serializer_class = CountrySerializer
    pagination_class = None


class IndustryListView(ListAPIView):
    """Read-only list of active industries, for the lead form's Industry select."""

    queryset = Industry.objects.filter(status=Industry.Status.ACTIVE)
    serializer_class = IndustrySerializer
    pagination_class = None


class AreaListView(ListAPIView):
    """Read-only list of active areas, for the lead/user forms' Domain select."""

    queryset = Area.objects.filter(status=Area.Status.ACTIVE)
    serializer_class = AreaSerializer
    pagination_class = None
