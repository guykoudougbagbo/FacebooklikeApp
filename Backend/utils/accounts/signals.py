from django.dispatch import Signal

# Sent after an admin is removed from the team, with removed_user and acting_user.
admin_removed = Signal()
