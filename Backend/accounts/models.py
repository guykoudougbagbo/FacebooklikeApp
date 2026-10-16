from django.conf import settings
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower
from django.utils import timezone
from django.utils.crypto import salted_hmac


class UserManager(BaseUserManager):
    def create_user(self, email, display_name, password):
        user = self.model(email=self.normalize_email(email).lower(), display_name=display_name)
        user.set_password(password)
        user.save(using=self._db)
        return user


class User(AbstractBaseUser, PermissionsMixin):
    """A page owner or admin. Visitors never have accounts."""

    email = models.EmailField(unique=True)
    display_name = models.CharField(max_length=80)
    is_active = models.BooleanField(default=True)
    date_joined = models.DateTimeField(default=timezone.now)
    # Bumping this logs the user out of every session at once.
    session_epoch = models.PositiveIntegerField(default=0)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = ["display_name"]

    class Meta:
        constraints = [
            models.UniqueConstraint(Lower("email"), name="accounts_user_email_ci_unique"),
        ]
        permissions = [
            ("invite_admin", "Inviter un administrateur"),
            ("remove_admin", "Retirer un administrateur"),
            ("reset_admin_two_factor", "Réinitialiser la double authentification d'un administrateur"),
            ("view_admins", "Voir la liste des administrateurs"),
            ("view_admin_activity", "Voir l'activité des administrateurs"),
            ("reinvite_admin", "Réinviter un ancien administrateur"),
        ]

    def __str__(self):
        return self.display_name

    def _get_session_auth_hash(self, secret=None):
        return salted_hmac(
            "accounts.User.get_session_auth_hash",
            f"{self.password}:{self.session_epoch}",
            secret=secret,
            algorithm="sha256",
        ).hexdigest()


class AdminInvite(models.Model):
    # Only a SHA-256 of the link token is stored, so a database leak can't be used to join.
    token_hash = models.CharField(max_length=64, unique=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)
    accepted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    # Set only on a re-invite: the one removed admin this link can switch back on.
    for_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(
                fields=["expires_at", "id"],
                condition=Q(accepted_at__isnull=True, revoked_at__isnull=True),
                name="accounts_invite_pending_idx",
            ),
        ]


class RecoveryCode(models.Model):
    """One-time backup code for the second login step. Only a SHA-256 of the code is stored."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    code_hash = models.CharField(max_length=64)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "code_hash"], name="accounts_recovery_code_unique"),
        ]


class AdminActivity(models.Model):
    class Action(models.TextChoices):
        INVITE_CREATED = "invite_created"
        INVITE_REVOKED = "invite_revoked"
        ADMIN_JOINED = "admin_joined"
        ADMIN_REMOVED = "admin_removed"
        TWO_FACTOR_RESET = "two_factor_reset"
        ADMIN_REINVITED = "admin_reinvited"
        ADMIN_REJOINED = "admin_rejoined"

    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    action = models.CharField(max_length=32, choices=Action.choices)
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    invite = models.ForeignKey(AdminInvite, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(default=timezone.now)
