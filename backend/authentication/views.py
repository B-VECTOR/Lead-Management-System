from django.conf import settings
from django.contrib import messages
from django.contrib.auth.decorators import login_required, permission_required
from django.contrib.auth.models import Group
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse, reverse_lazy
from django.utils.decorators import method_decorator
from django.views.decorators.http import require_http_methods
from django.views.generic import CreateView
from rest_framework import status
from rest_framework.generics import ListAPIView
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.renderers import TemplateHTMLRenderer
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .forms import ManagedUserUpdateForm, UserCreationForm
from .models import Belt, PasswordResetToken, User
from .permissions import UserManagementPermission
from .serializers import (
    BeltSerializer,
    ChangeOwnPasswordSerializer,
    CustomTokenObtainPairSerializer,
    GroupSerializer,
    PasswordResetConfirmSerializer,
    UserSerializer,
)


class LoginView(TokenObtainPairView):
    permission_classes = [AllowAny]
    serializer_class = CustomTokenObtainPairSerializer


class RefreshView(TokenRefreshView):
    permission_classes = [AllowAny]


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response(
                {"detail": "Refresh token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            RefreshToken(refresh_token).blacklist()
        except TokenError:
            return Response(
                {"detail": "Token is invalid or expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_205_RESET_CONTENT)


class SignUpView(CreateView):
    """Register a new user account."""

    form_class = UserCreationForm
    template_name = "registration/signup.html"
    success_url = reverse_lazy("login")


@require_http_methods(["GET"])
@login_required
def profile(request):
    """Display the signed-in user's profile."""
    return render(request, "users/profile.html")


class ChangeOwnPasswordView(APIView):
    """Logged-in self-service password change (Account settings).

    Distinct from the admin-driven reset on UserSerializer/UserDetailView:
    this requires the caller to prove they know their current password.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangeOwnPasswordSerializer(
            data=request.data, context={"user": request.user}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """Return the authenticated user's own profile (Phase 8, optional `/me`).

    Lets the frontend confirm identity after a reload against the token, rather
    than trusting the localStorage copy. Same shape as the user CRUD serializer.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class PasswordResetRequestView(APIView):
    """Start the forgot-password flow: issue a reset token for an email
    (Phase 8 — replaces the frontend's mocked flow).

    Always responds 200 so the endpoint does not reveal whether an email is
    registered. Since there is no email backend in this build, the reset link
    is returned in the response body **only in DEBUG** so the flow is usable in
    development (documented deviation — a real deployment would email it).
    """

    permission_classes = [AllowAny]

    def post(self, request):
        email = (request.data.get("email") or "").strip()
        payload = {"detail": "If that email has an account, a reset link has been sent."}
        user = User.objects.filter(email__iexact=email).first() if email else None
        if user is not None:
            token = PasswordResetToken.objects.create(user=user)
            if settings.DEBUG:
                payload["token"] = str(token.token)
                payload["reset_url"] = f"/reset-password/{token.token}"
        return Response(payload)


class PasswordResetTokenView(APIView):
    """Verify a reset token (GET) or set a new password with it (POST)."""

    permission_classes = [AllowAny]

    def _get_valid_token(self, token):
        record = PasswordResetToken.objects.filter(token=token).select_related("user").first()
        if record is None or not record.is_valid:
            return None
        return record

    def get(self, request, token):
        record = self._get_valid_token(token)
        if record is None:
            return Response({"valid": False}, status=status.HTTP_404_NOT_FOUND)
        return Response({"valid": True, "email": record.user.email})

    def post(self, request, token):
        record = self._get_valid_token(token)
        if record is None:
            return Response(
                {"detail": "This reset link is invalid or has expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = PasswordResetConfirmSerializer(
            data=request.data, context={"user": record.user}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        record.used = True
        record.save(update_fields=["used"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class GroupListView(ListAPIView):
    """Read-only list of the roles a user can be assigned (Django Groups).

    Backs the role checkboxes on the user create/edit form so the set of
    assignable roles is driven by the database, not hardcoded in the frontend.
    """

    queryset = Group.objects.order_by("id")
    serializer_class = GroupSerializer
    pagination_class = None


class BeltListView(ListAPIView):
    """Read-only list of belts, for the belt / acting-belt-level selects."""

    queryset = Belt.objects.all()  # Belt.Meta.ordering is ["order", "name"]
    serializer_class = BeltSerializer
    pagination_class = None


def _user_queryset(*, include_deleted=False):
    manager = User.all_objects if include_deleted else User.objects
    return manager.filter(is_superuser=False).select_related("belt", "acting_belt_level").order_by("email")


class UserListCreateView(APIView):
    """List (paginated) or create users.

    Restricted to users holding the ``users.*_user`` model permissions
    (see :class:`~users.permissions.UserManagementPermission`).
    """

    permission_classes = [UserManagementPermission]

    def get(self, request):
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(_user_queryset(), request)
        serializer = UserSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = UserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class UserDetailView(APIView):
    """Retrieve, update, or soft-delete a single user.

    Delete is a soft delete: the row is kept and hidden from the default
    manager, rather than removed.
    """

    permission_classes = [UserManagementPermission]

    def get_object(self, pk):
        return get_object_or_404(_user_queryset(), pk=pk)

    def get(self, request, pk):
        return Response(UserSerializer(self.get_object(pk)).data)

    def _update(self, request, pk, *, partial):
        user = self.get_object(pk)
        serializer = UserSerializer(user, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        # Don't let a manager lock themselves out by deactivating their own account.
        if user.pk == request.user.pk and serializer.validated_data.get("is_active") is False:
            return Response(
                {"is_active": "You cannot deactivate your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer.save()
        return Response(serializer.data)

    def put(self, request, pk):
        return self._update(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def delete(self, request, pk):
        user = self.get_object(pk)
        # Don't let a manager delete their own account and lock themselves out.
        if user.pk == request.user.pk:
            return Response(
                {"detail": "You cannot delete your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.soft_delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# --- User-management page (class-based views) ------------------------------
#
# A separate, template-rendered set of pages for a "user manager" to
# create/update/soft-delete/restore users, gated by the same
# `users.*_user` model permissions as the CRUD API above.

MANAGE_LIST_URL_NAME = "authentication:manage-list"

MANAGE_FORM_TEMPLATE = "users/manage/form.html"


def manage_access(codename):
    def decorator(cls):
        cls = method_decorator(
            permission_required(f"authentication.{codename}", raise_exception=True),
            name="dispatch",
        )(cls)
        return method_decorator(login_required, name="dispatch")(cls)

    return decorator


def _render_manage_form(form, title):
    return Response(
        {"form": form, "title": title}, template_name=MANAGE_FORM_TEMPLATE
    )


@manage_access("view_user")
class ManageUserListView(APIView):
    """List users. Pass ?show_deleted=1 to include soft-deleted users."""

    renderer_classes = [TemplateHTMLRenderer]

    def get(self, request):
        show_deleted = request.GET.get("show_deleted") == "1"
        users = _user_queryset(include_deleted=show_deleted)
        return Response(
            {"users": users, "show_deleted": show_deleted},
            template_name="users/manage/list.html",
        )


@manage_access("add_user")
class ManageUserCreateView(APIView):
    renderer_classes = [TemplateHTMLRenderer]

    def get(self, request):
        return _render_manage_form(UserCreationForm(), "Create user")

    def post(self, request):
        form = UserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            messages.success(request, f"Created user {user.email}.")
            return redirect(MANAGE_LIST_URL_NAME)
        return _render_manage_form(form, "Create user")


@manage_access("change_user")
class ManageUserUpdateView(APIView):
    renderer_classes = [TemplateHTMLRenderer]

    def get(self, request, pk):
        user = get_object_or_404(User.objects, pk=pk)
        form = ManagedUserUpdateForm(instance=user)
        return _render_manage_form(form, "Edit user")

    def post(self, request, pk):
        user = get_object_or_404(User.objects, pk=pk)
        form = ManagedUserUpdateForm(request.POST, instance=user)
        if form.is_valid():
            # Don't let a manager lock themselves out by deactivating their own account.
            if user.pk == request.user.pk and not form.cleaned_data.get("is_active"):
                form.add_error("is_active", "You cannot deactivate your own account.")
                return _render_manage_form(form, "Edit user")
            form.save()
            messages.success(request, f"Updated user {user.email}.")
            return redirect(MANAGE_LIST_URL_NAME)
        return _render_manage_form(form, "Edit user")


@manage_access("delete_user")
class ManageUserDeleteView(APIView):
    def post(self, request, pk):
        user = get_object_or_404(User.objects, pk=pk)
        # Don't let a manager delete their own account and lock themselves out.
        if user.pk == request.user.pk:
            messages.error(request, "You cannot delete your own account.")
            return redirect(MANAGE_LIST_URL_NAME)
        user.soft_delete()
        messages.success(request, f"Deleted user {user.email}.")
        return redirect(MANAGE_LIST_URL_NAME)


@manage_access("change_user")
class ManageUserRestoreView(APIView):
    def post(self, request, pk):
        user = get_object_or_404(User.all_objects, pk=pk, is_deleted=True)
        user.restore()
        messages.success(request, f"Restored user {user.email}.")
        return redirect(f"{reverse(MANAGE_LIST_URL_NAME)}?show_deleted=1")
