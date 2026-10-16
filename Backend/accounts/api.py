from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from utils.accounts import admins, invites, sessions, two_factor
from utils.accounts.activity import recent_activity
from utils.accounts.serializers import (
    AcceptInviteSerializer,
    ActivitySerializer,
    AdminSerializer,
    CodeSerializer,
    FormerAdminSerializer,
    InviteCheckSerializer,
    InviteSerializer,
    InviteTokenSerializer,
    LoginSerializer,
    MeSerializer,
    ReactivateSerializer,
)
from utils.accounts.throttles import InviteThrottle, LoginAccountThrottle, LoginIPThrottle, SecondStepThrottle
from utils.api import NewestFirstPagination, OldestFirstPagination, csrf_checked, has_permission

WRONG_LOGIN = "Adresse e-mail ou mot de passe incorrect."
SESSION_EXPIRED = "Votre session a expiré. Reconnectez-vous."
WRONG_CODE = "Code incorrect. Réessayez."
INVALID_INVITE = "Cette invitation n'est plus valide. Demandez un nouveau lien."


def _error(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"detail": message}, status=code)


# --- Login ---------------------------------------------------------------

@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    # Public: the browser needs the CSRF cookie before it can send the login form.
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(status=status.HTTP_204_NO_CONTENT)


@csrf_checked
class LoginView(APIView):
    # Public: this is how a logged-out admin starts logging in.
    permission_classes = [AllowAny]
    throttle_classes = [LoginIPThrottle, LoginAccountThrottle]

    def post(self, request):
        data = LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        next_step = sessions.start_password_step(request, data.validated_data["email"], data.validated_data["password"])
        if next_step is None:
            return _error(WRONG_LOGIN)
        return Response({"next": next_step})


@csrf_checked
class SecondStepVerifyView(APIView):
    # Public: only works for a session that just passed the password step.
    permission_classes = [AllowAny]
    throttle_classes = [SecondStepThrottle]

    def post(self, request):
        user = sessions.pending_user(request)
        if user is None:
            return _error(SESSION_EXPIRED, status.HTTP_401_UNAUTHORIZED)
        data = CodeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if not two_factor.verify(user, data.validated_data["code"]):
            return _error(WRONG_CODE)
        sessions.complete_login(request, user)
        return Response(MeSerializer(user).data)


@csrf_checked
class SecondStepSetupView(APIView):
    # Public: only works for a session that passed the password step and has no app linked yet.
    permission_classes = [AllowAny]
    throttle_classes = [SecondStepThrottle]

    def post(self, request):
        user = sessions.pending_user(request)
        if user is None:
            return _error(SESSION_EXPIRED, status.HTTP_401_UNAUTHORIZED)
        if two_factor.has_confirmed_device(user):
            return _error("La double authentification est déjà configurée.")
        otpauth_url, secret = two_factor.start_setup(user)
        return Response({"otpauth_url": otpauth_url, "secret": secret})


@csrf_checked
class SecondStepConfirmView(APIView):
    # Public: only works for a session that passed the password step and has no app linked yet.
    permission_classes = [AllowAny]
    throttle_classes = [SecondStepThrottle]

    def post(self, request):
        user = sessions.pending_user(request)
        if user is None:
            return _error(SESSION_EXPIRED, status.HTTP_401_UNAUTHORIZED)
        if two_factor.has_confirmed_device(user):
            return _error("La double authentification est déjà configurée.")
        data = CodeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        codes = two_factor.confirm_setup(user, data.validated_data["code"])
        if codes is None:
            return _error(WRONG_CODE)
        sessions.complete_login(request, user)
        return Response({"recovery_codes": codes, "user": MeSerializer(user).data})


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        sessions.end_session(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(MeSerializer(request.user).data)


# --- Joining from an invite ----------------------------------------------

@csrf_checked
class InviteCheckView(APIView):
    # Public: the invited person has no account yet; the link token is the proof.
    permission_classes = [AllowAny]
    throttle_classes = [InviteThrottle]

    def post(self, request):
        data = InviteTokenSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        invite = invites.find_usable(data.validated_data["token"])
        if invite is None:
            return _error(INVALID_INVITE, status.HTTP_404_NOT_FOUND)
        return Response(InviteCheckSerializer(invite).data)


@csrf_checked
class InviteAcceptView(APIView):
    # Public: the invited person has no account yet; the link token is the proof.
    permission_classes = [AllowAny]
    throttle_classes = [InviteThrottle]

    def post(self, request):
        data = AcceptInviteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        try:
            user = invites.accept_invite(v["token"], v["email"], v["display_name"], v["password"])
        except invites.InviteError as exc:
            return _error(str(exc))
        return Response({"next": sessions.begin_pending(request, user)}, status=status.HTTP_201_CREATED)


@csrf_checked
class InviteReactivateView(APIView):
    # Public: a removed admin is logged out; their personal re-invite link is the proof.
    permission_classes = [AllowAny]
    throttle_classes = [InviteThrottle]

    def post(self, request):
        data = ReactivateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            user = invites.reactivate_from_invite(data.validated_data["token"], data.validated_data["password"])
        except invites.InviteError as exc:
            return _error(str(exc))
        return Response({"next": sessions.begin_pending(request, user)})


# --- Managing admins -----------------------------------------------------

class InviteListCreateView(generics.ListAPIView):
    permission_classes = [has_permission("accounts", "invite_admin")]
    serializer_class = InviteSerializer
    pagination_class = NewestFirstPagination

    def get_queryset(self):
        return invites.pending_invites()

    def post(self, request):
        invite, token = invites.create_invite(request.user)
        return Response(
            {"id": invite.id, "token": token, "expires_at": invite.expires_at},
            status=status.HTTP_201_CREATED,
        )


class InviteRevokeView(APIView):
    permission_classes = [has_permission("accounts", "invite_admin")]

    def delete(self, request, pk):
        if not invites.revoke_invite(pk, request.user):
            return _error("Invitation introuvable.", status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminListView(generics.ListAPIView):
    permission_classes = [has_permission("accounts", "view_admins")]
    serializer_class = AdminSerializer
    pagination_class = OldestFirstPagination

    def get_queryset(self):
        return admins.active_admins()


class AdminRemoveView(APIView):
    permission_classes = [has_permission("accounts", "remove_admin")]

    def post(self, request, pk):
        try:
            admins.remove_admin(pk, request.user)
        except admins.AdminError as exc:
            return _error(str(exc))
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminResetSecondStepView(APIView):
    permission_classes = [has_permission("accounts", "reset_admin_two_factor")]

    def post(self, request, pk):
        try:
            admins.reset_two_factor(pk, request.user)
        except admins.AdminError as exc:
            return _error(str(exc))
        return Response(status=status.HTTP_204_NO_CONTENT)


class FormerAdminListView(generics.ListAPIView):
    permission_classes = [has_permission("accounts", "reinvite_admin")]
    serializer_class = FormerAdminSerializer
    pagination_class = OldestFirstPagination

    def get_queryset(self):
        return admins.former_admins()


class ReinviteView(APIView):
    permission_classes = [has_permission("accounts", "reinvite_admin")]

    def post(self, request, pk):
        try:
            invite, token = invites.create_reinvite(pk, request.user)
        except invites.InviteError as exc:
            return _error(str(exc), status.HTTP_404_NOT_FOUND)
        return Response(
            {"id": invite.id, "token": token, "expires_at": invite.expires_at},
            status=status.HTTP_201_CREATED,
        )


class ActivityListView(generics.ListAPIView):
    permission_classes = [has_permission("accounts", "view_admin_activity")]
    serializer_class = ActivitySerializer
    pagination_class = NewestFirstPagination

    def get_queryset(self):
        return recent_activity()
