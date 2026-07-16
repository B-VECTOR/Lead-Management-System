from django.contrib import admin

from .models import Area, Country, Industry


class ReferenceEntryAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "status")
    list_editable = ("status",)
    list_filter = ("status",)
    search_fields = ("name", "code")
    ordering = ("name",)


admin.site.register(Country, ReferenceEntryAdmin)
admin.site.register(Industry, ReferenceEntryAdmin)
admin.site.register(Area, ReferenceEntryAdmin)
