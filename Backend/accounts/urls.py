from django.urls import path

from accounts import api

urlpatterns = [
    path("auth/csrf/", api.CsrfView.as_view()),
    path("auth/login/", api.LoginView.as_view()),
    path("auth/second-step/verify/", api.SecondStepVerifyView.as_view()),
    path("auth/second-step/setup/", api.SecondStepSetupView.as_view()),
    path("auth/second-step/confirm/", api.SecondStepConfirmView.as_view()),
    path("auth/logout/", api.LogoutView.as_view()),
    path("auth/me/", api.MeView.as_view()),
    path("invites/check/", api.InviteCheckView.as_view()),
    path("invites/accept/", api.InviteAcceptView.as_view()),
    path("invites/reactivate/", api.InviteReactivateView.as_view()),
    path("admin/invites/", api.InviteListCreateView.as_view()),
    path("admin/invites/<int:pk>/", api.InviteRevokeView.as_view()),
    path("admin/admins/", api.AdminListView.as_view()),
    path("admin/admins/<int:pk>/remove/", api.AdminRemoveView.as_view()),
    path("admin/admins/<int:pk>/reset-second-step/", api.AdminResetSecondStepView.as_view()),
    path("admin/former-admins/", api.FormerAdminListView.as_view()),
    path("admin/former-admins/<int:pk>/reinvite/", api.ReinviteView.as_view()),
    path("admin/activity/", api.ActivityListView.as_view()),
]
