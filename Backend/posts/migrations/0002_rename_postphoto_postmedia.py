# Written by hand: a rename keeps every existing row; an automatic guess could drop and recreate the table.
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('posts', '0001_posts_and_photos'),
    ]

    operations = [
        migrations.RenameModel(old_name='PostPhoto', new_name='PostMedia'),
    ]
