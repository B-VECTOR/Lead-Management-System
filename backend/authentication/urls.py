from django.urls import path

from .views import (
    BeltListView,
    ChangeOwnPasswordView,
    GroupListView,
    LoginView,
    LogoutView,
    ManageUserCreateView,
    ManageUserDeleteView,
    ManageUserListView,
    ManageUserRestoreView,
    ManageUserUpdateView,
    RefreshView,
    SignUpView,
    UserDetailView,
    UserListCreateView,
    profile,
)

app_name = "authentication"

urlpatterns = [
    # JWT API
    path("api/auth/login/", LoginView.as_view(), name="auth-login"),
    path("api/auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("api/auth/refresh/", RefreshView.as_view(), name="auth-refresh"),
    path("api/auth/change-password/", ChangeOwnPasswordView.as_view(), name="auth-change-password"),
    # Web pages
    path("users/signup/", SignUpView.as_view(), name="signup"),
    path("users/profile/", profile, name="profile"),
    # User management CRUD API
    path("api/users/", UserListCreateView.as_view(), name="api-user-list"),
    path("api/users/<int:pk>/", UserDetailView.as_view(), name="api-user-detail"),
    # Reference-data lookups (roles, belts) for the user create/edit form
    path("api/groups/", GroupListView.as_view(), name="api-group-list"),
    path("api/belts/", BeltListView.as_view(), name="api-belt-list"),
    # User-management pages
    path("users/manage/", ManageUserListView.as_view(), name="manage-list"),
    path("users/manage/create/", ManageUserCreateView.as_view(), name="manage-create"),
    path("users/manage/<int:pk>/edit/", ManageUserUpdateView.as_view(), name="manage-update"),
    path("users/manage/<int:pk>/delete/", ManageUserDeleteView.as_view(), name="manage-delete"),
    path("users/manage/<int:pk>/restore/", ManageUserRestoreView.as_view(), name="manage-restore"),
]
