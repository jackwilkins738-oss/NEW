# Database backups

Every night at about 3am, a GitHub Action (`.github/workflows/backup.yml`)
dumps the whole database, compresses it, **encrypts it with your passphrase**,
and keeps it for 30 days under *Actions → Database backup* on this repository.

**The honest version:** this is the free safety net. Once the first paying
client's data is in here, move to Supabase Pro ($25/month). It gives daily
backups you can restore with one click, and the project never gets paused.
Keep this running anyway, as a second copy Supabase doesn't hold.

It covers all your business data: quotes, invoices, leads, projects, customers
and settings. Logins (Supabase Auth) aren't included - after a full restore,
people are re-invited.
Uploaded files (logos, onboarding photos) live in Supabase Storage and
aren't in the dump.

## Set up (10 minutes, once)

1. **The connection string.** In Supabase, click *Connect* at the top of the
   project, then choose *Session pooler*. Copy the URI and put your database
   password in it. It looks like
   `postgresql://postgres.xxxx:PASSWORD@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`.
   Use the **session pooler**, not "Direct connection": GitHub's machines
   can't reach the direct address.
2. **A passphrase.** Make one of at least 20 characters (four random words
   works) and save it in your password manager. **If you lose it, every
   backup is unreadable. Nobody can recover it.**
3. In GitHub, go to this repo, then *Settings → Secrets and variables →
   Actions → New repository secret*, and add:
   - `SUPABASE_DB_URL`: the string from step 1
   - `BACKUP_PASSPHRASE`: the passphrase from step 2
4. *Actions → Database backup → Run workflow*. After a minute or two it should
   go green, with a `database-backup` file at the bottom of the run.

The repository is public, so anyone logged in to GitHub can download the
file. That's why it's encrypted: without the passphrase it's random bytes.

## Restore

Download `database-backup` from the run you want, then unzip it:

```bash
gpg -d backup-2026-10-01.sql.gz.gpg | gunzip > backup.sql   # asks for the passphrase
```

`backup.sql` is ordinary SQL.

- **Recovering a few rows:** open it and copy out what you need.
- **Restoring everything:** restore into a **new** Supabase project with
  `psql "<new project's connection string>" -f backup.sql`, check it, then
  point the dashboard's environment variables at it. Never restore straight
  over the live database.
- **Afterwards:** delete `backup.sql` once you're done. It's unencrypted.
