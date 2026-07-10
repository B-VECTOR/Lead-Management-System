from django.core.management.base import BaseCommand

from reference.models import Area, Country, Industry

# Seed data from Tech Req §13.2–13.4. Maintained here only for first-run
# bootstrap; the tables are editable in the Django admin thereafter (§4.2).

COUNTRIES = [
    ("India", "IN"),
    ("Indonesia", "ID"),
]

INDUSTRIES = [
    ("Auto Comp", "COMP"),
    ("Auto OEM", "OEM"),
    ("Banking", "BNK"),
    ("Building & Construction Goods", "BCG"),
    ("CapEx", "CEX"),
    ("Consumer Goods", "CG"),
    ("EPC", "EPC"),
    ("ETO", "ETO"),
    ("FMCG", "FMCG"),
    ("FMEG", "FMEG"),
    ("Industrial Goods", "IG"),
    ("Information Technology", "IT"),
    ("Machinery & Equipment", "ME"),
    ("Organised Retail", "RE"),
    ("Pharma & Chemical", "PH"),
    ("Textile & Fashion", "TX"),
]

AREAS = [
    ("B2B Sales", "B2B"),
    ("B2C Sales", "B2C"),
    ("Distribution", "DIST"),
    ("NPD", "NPD"),
    ("Operations", "OPS"),
    ("Projects", "PROJ"),
    ("Supply Chain", "SC"),
    ("VectorFLOW AMC", "VFAMC"),
    ("VectorFLOW Upgrade", "VFUPG"),
    ("VectorPRO AMC", "VPAMC"),
    ("VectorPRO Upgrade", "VPUPG"),
]


class Command(BaseCommand):
    help = "Seed the Country / Industry / Area reference tables (idempotent)."

    def _seed(self, model, rows):
        label = model._meta.verbose_name_plural
        for name, code in rows:
            obj, created = model.objects.get_or_create(name=name, defaults={"code": code})
            if not created and obj.code != code:
                obj.code = code
                obj.save(update_fields=["code"])
            self.stdout.write(f"{'Created' if created else 'Exists'} {model.__name__}: {name} ({code})")
        self.stdout.write(f"  → {model.objects.count()} {label} total")

    def handle(self, *args, **options):
        self._seed(Country, COUNTRIES)
        self._seed(Industry, INDUSTRIES)
        self._seed(Area, AREAS)
        self.stdout.write(self.style.SUCCESS("Reference data seeded."))
