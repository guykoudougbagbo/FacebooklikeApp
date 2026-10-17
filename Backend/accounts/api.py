from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import AppLogin
from utils.accounts import admins, app_logins, invites, sessions, two_factor
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
    PushTokenSerializer,
    ReactivateSerializer,
    TicketCodeSerializer,
    TicketSerializer,
)
from utils.accounts.throttles import (
    AppSecondStepThrottle,
    InviteThrottle,
    LoginAccountThrottle,
    LoginIPThrottle,
    SecondStepThrottle,
)
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


# --- Phone app login -------------------------------------------------------
# Same two steps and limits as the website. These routes set and read no cookies, so they need no CSRF check:
# their answers only go back to the app that asked.

class AppLoginView(APIView):
    # Public: this is how a logged-out admin starts logging in from the app.
    permission_classes = [AllowAny]
    throttle_classes = [LoginIPThrottle, LoginAccountThrottle]

    def post(self, request):
        data = LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        started = app_logins.start(data.validated_data["email"], data.validated_data["password"])
        if started is None:
            return _error(WRONG_LOGIN)
        next_step, ticket = started
        return Response({"next": next_step, "ticket": ticket})


def _pending_from(request, serializer_class):
    data = serializer_class(data=request.data)
    data.is_valid(raise_exception=True)
    return app_logins.pending_user(data.validated_data["ticket"]), data.validated_data


class AppVerifyView(APIView):
    # Public: only works with a ticket from the password step.
    permission_classes = [AllowAny]
    throttle_classes = [AppSecondStepThrottle]

    def post(self, request):
        user, data = _pending_from(request, TicketCodeSerializer)
        if user is None:
            return _error(SESSION_EXPIRED, status.HTTP_401_UNAUTHORIZED)
        if not two_factor.verify(user, data["code"]):
            return _error(WRONG_CODE)
        return Response({"key": app_logins.create(user), "user": MeSerializer(user).data})


class AppSetupView(APIView):
    # Public: only works with a ticket from the password step, for an admin with no authenticator app yet.
    permission_classes = [AllowAny]
    throttle_classes = [AppSecondStepThrottle]

    def post(self, request):
        user, _ = _pending_from(request, TicketSerializer)
        if user is None:
            return _error(SESSION_EXPIRED, status.HTTP_401_UNAUTHORIZED)
        if two_factor.has_confirmed_device(user):
            return _error("La double authentification est déjà configurée.")
        otpauth_url, secret = two_factor.start_setup(user)
        return Response({"otpauth_url": otpauth_url, "secret": secret})


class AppConfirmView(APIView):
    # Public: only works with a ticket from the password step, for an admin with no authenticator app yet.
    permission_classes = [AllowAny]
    throttle_classes = [AppSecondStepThrottle]

    def post(self, request):
        user, data = _pending_from(request, TicketCodeSerializer)
        if user is None:
            return _error(SESSION_EXPIRED, status.HTTP_401_UNAUTHORIZED)
        if two_factor.has_confirmed_device(user):
            return _error("La double authentification est déjà configurée.")
        codes = two_factor.confirm_setup(user, data["code"])
        if codes is None:
            return _error(WRONG_CODE)
        return Response({"key": app_logins.create(user), "recovery_codes": codes, "user": MeSerializer(user).data})


class AppLogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if isinstance(request.auth, AppLogin):
            app_logins.end(request.auth)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AppPushTokenView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        if not isinstance(request.auth, AppLogin):
            return _error("Réservé à l'application.")
        data = PushTokenSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            app_logins.set_push_token(request.auth, data.validated_data["expo_token"])
        except app_logins.PushTokenError as exc:
            return _error(str(exc))
        return Response(status=status.HTTP_204_NO_CONTENT)

    def delete(self, request):
        if isinstance(request.auth, AppLogin):
            app_logins.clear_push_token(request.auth)
        return Response(status=status.HTTP_204_NO_CONTENT)


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
