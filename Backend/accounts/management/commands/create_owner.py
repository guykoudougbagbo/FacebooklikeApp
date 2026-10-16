from getpass import getpass

from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email

from utils.accounts.admins import AdminError, create_owner


class Command(BaseCommand):
    help = "Create the page owner. Only possible from the server, and only once."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--display-name", required=True)

    def handle(self, *args, email, display_name, **options):
        try:
            validate_email(email)
        except ValidationError:
            raise CommandError("That email address is not valid.") from None
        password = getpass("Password: ")
        if password != getpass("Password (again): "):
            raise CommandError("The passwords don't match.")
        try:
            password_validation.validate_password(password)
        except ValidationError as exc:
            raise CommandError(" ".join(exc.messages)) from None
        try:
            create_owner(email, display_name.strip(), password)
        except AdminError as exc:
            raise CommandError(str(exc)) from None
        self.stdout.write(self.style.SUCCESS(
            "Owner created. Log in on the site to link an authenticator app."
        ))
