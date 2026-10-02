# Prayer Box: tagged links (UTM)

Share these links instead of the plain address, so Google Analytics can tell where
visitors came from. Each one opens the normal home page; the `utm_` tags are only read
by analytics.

| Where you share it | utm_source | utm_medium | Link |
|---|---|---|---|
| QR code (posters, flyers, bulletins) | `qr` | `print` | https://www.prayerbox.site/?utm_source=qr&utm_medium=print&utm_campaign=launch |
| Instagram bio link | `instagram` | `social` | https://www.prayerbox.site/?utm_source=instagram&utm_medium=social&utm_campaign=launch |
| Instagram story | `instagram` | `social` | https://www.prayerbox.site/?utm_source=instagram&utm_medium=social&utm_campaign=launch&utm_content=story |
| WhatsApp message or group | `whatsapp` | `social` | https://www.prayerbox.site/?utm_source=whatsapp&utm_medium=social&utm_campaign=launch |
| Text message (SMS / iMessage) | `sms` | `sms` | https://www.prayerbox.site/?utm_source=sms&utm_medium=sms&utm_campaign=launch |
| Facebook post | `facebook` | `social` | https://www.prayerbox.site/?utm_source=facebook&utm_medium=social&utm_campaign=launch |
| LinkedIn post | `linkedin` | `social` | https://www.prayerbox.site/?utm_source=linkedin&utm_medium=social&utm_campaign=launch |
| X (Twitter) post | `x` | `social` | https://www.prayerbox.site/?utm_source=x&utm_medium=social&utm_campaign=launch |
| Email | `email` | `email` | https://www.prayerbox.site/?utm_source=email&utm_medium=email&utm_campaign=launch |

The Instagram story link also has `utm_content=story`, to tell it apart from the bio link.
All links use `utm_campaign=launch`. For a new push (an event, a season, a sermon
series), copy any link and change only the campaign, for example
`utm_campaign=easter2027`. Keep the values lowercase so they group together in reports.

The QR codes in `../qr/` already use the QR link above.

## Where to see the results

Google Analytics (analytics.google.com, signed in with the account that owns the
PrayerBox Firebase project) > Reports > Acquisition > Traffic acquisition. Set the table
to "Session source / medium" or "Session campaign". New visits show up in Reports >
Realtime within about a minute; the full reports fill in within a day.

The site also records these actions: `sign_up`, `login` (with the method: google or
email), `prayer_submitted` (public or anonymous) and `reply_sent`. They're under
Reports > Engagement > Events. No prayer or reply text is ever sent to analytics.
