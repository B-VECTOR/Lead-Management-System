from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import Belt, User


class BeltSerializer(serializers.ModelSerializer):
    class Meta:
        model = Belt
        fields = ["id", "name", "order"]


class GroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = ["id", "name"]


class UserSerializer(serializers.ModelSerializer):
    """Serializer backing the user-management CRUD API.

    ``is_staff`` / ``is_superuser`` are intentionally not exposed here to
    prevent a user-management operator from escalating privileges through
    this endpoint; those remain admin-only via the Django admin.
    """

    password = serializers.CharField(
        write_only=True,
        required=False,
        style={"input_type": "password"},
    )
    groups = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Group.objects.all(),
        required=False,
    )

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "password",
            "name",
            "employee_id",
            "mobile_no",
            "belt",
            "acting_belt_level",
            "domain",
            "date_of_joining",
            "is_active",
            "is_deleted",
            "date_joined",
            "groups",
        ]
        read_only_fields = ["id", "is_deleted", "date_joined"]

    def validate_password(self, value):
        validate_password(value, user=self.instance)
        return value

    def validate_date_of_joining(self, value):
        # Date of Joining is exempt from the global no-past-dates rule (it's
        # historical), but a future joining date is not allowed.
        if value and value > timezone.now().date():
            raise serializers.ValidationError("Joining date can't be in the future.")
        return value

    def validate_mobile_no(self, value):
        if not str(value).isdigit() or len(str(value)) != 10:
            raise serializers.ValidationError("Enter a valid 10-digit mobile number.")
        return value

    def create(self, validated_data):
        groups = validated_data.pop("groups", [])
        password = validated_data.pop("password", None)
        if not password:
            raise serializers.ValidationError(
                {"password": "This field is required when creating a user."}
            )
        user = User.objects.create_user(password=password, **validated_data)
        if groups:
            user.groups.set(groups)
        return user

    def update(self, instance, validated_data):
        groups = validated_data.pop("groups", None)
        password = validated_data.pop("password", None)
        user = super().update(instance, validated_data)
        if password:
            user.set_password(password)
            user.save(update_fields=["password"])
        if groups is not None:
            user.groups.set(groups)
        return user


class ChangeOwnPasswordSerializer(serializers.Serializer):
    """Self-service password change: unlike the admin-driven reset in
    UserSerializer, this requires proving knowledge of the current password.
    """

    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        if not self.context["user"].check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate_new_password(self, value):
        validate_password(value, user=self.context["user"])
        return value

    def save(self):
        user = self.context["user"]
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        return user


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Set a new password given a valid reset token (Phase 8).

    The token itself is resolved in the view; this only validates and applies
    the new password against the resolved user (Django's password validators).
    """

    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        validate_password(value, user=self.context["user"])
        return value

    def save(self):
        user = self.context["user"]
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        return user


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["username"] = user.username
        token["email"] = user.email
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = {
            "id": self.user.id,
            "username": self.user.username,
            "email": self.user.email,
            "name": self.user.name,
            "groups": list(self.user.groups.values_list("id", flat=True)),
        }
        return data
